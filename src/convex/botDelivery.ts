import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation } from "./functions";
import { activeBot, botError, ownerApp } from "./botLib";
import { eventDto, eventVisible } from "./botEvents";

export const claim = internalMutation({
  args: { eventId: v.id("botEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (
      !event ||
      !["pending", "leased"].includes(event.status) ||
      event.nextAttemptAt > Date.now()
    )
      return null;
    const app = await ctx.db.get(event.applicationId);
    if (!app || app.deliveryMode !== "webhook" || !app.webhookUrl) return null;
    let allowed = false;
    try {
      await activeBot(ctx, app.tokenHash ?? "");
      allowed = await eventVisible(ctx, app, event);
    } catch {
      /* Deleted, suspended or revoked applications cannot receive events. */
    }
    if (!allowed || event.expiresAt < Date.now() || event.attempts >= 6) {
      await ctx.db.patch(eventId, {
        status: "dead",
        lastError: "EXPIRED_OR_ACCESS_REVOKED",
      });
      return null;
    }
    const attempt = event.attempts + 1;
    await ctx.db.patch(eventId, {
      status: "leased",
      attempts: attempt,
      leaseUntil: Date.now() + 60000,
      nextAttemptAt: Date.now() + 60000,
    });
    return { url: app.webhookUrl, event: eventDto(event), attempt };
  },
});
export const finish = internalMutation({
  args: {
    eventId: v.id("botEvents"),
    attempt: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.status !== "leased" || event.attempts !== args.attempt)
      return;
    if (args.success)
      await ctx.db.patch(event._id, {
        status: "delivered",
        deliveredAt: Date.now(),
        lastError: undefined,
      });
    else
      await ctx.db.patch(event._id, {
        status: event.attempts >= 6 ? "dead" : "pending",
        nextAttemptAt:
          Date.now() +
          [60000, 300000, 900000, 3600000, 21600000][
            Math.min(event.attempts - 1, 4)
          ],
        lastError: args.error?.slice(0, 100) ?? "DELIVERY_FAILED",
      });
  },
});
export const due = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("botEvents")
      .withIndex("by_delivery_status_due", (q) =>
        q
          .eq("deliveryMode", "webhook")
          .eq("status", "pending")
          .lte("nextAttemptAt", now),
      )
      .take(25);
    const leased = await ctx.db
      .query("botEvents")
      .withIndex("by_delivery_status_due", (q) =>
        q
          .eq("deliveryMode", "webhook")
          .eq("status", "leased")
          .lte("nextAttemptAt", now),
      )
      .take(25);
    return [...pending, ...leased]
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
      .slice(0, 25)
      .map((e) => e._id);
  },
});
// Migrate queued events in bounded transactions when developers change delivery mode.
export const syncDeliveryMode = internalMutation({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    const app = await ctx.db.get(applicationId);
    if (!app) return;
    const opposite = app.deliveryMode === "poll" ? "webhook" : "poll";
    let rows = await ctx.db
      .query("botEvents")
      .withIndex("by_app_delivery", (q) =>
        q.eq("applicationId", applicationId).eq("deliveryMode", opposite),
      )
      .take(200);
    if (!rows.length)
      rows = await ctx.db
        .query("botEvents")
        .withIndex("by_app_delivery", (q) =>
          q.eq("applicationId", applicationId).eq("deliveryMode", undefined),
        )
        .take(200);
    for (const row of rows)
      await ctx.db.patch(row._id, { deliveryMode: app.deliveryMode });
    if (rows.length)
      await ctx.scheduler.runAfter(
        0,
        makeFunctionReference<"mutation">("botDelivery:syncDeliveryMode"),
        { applicationId },
      );
  },
});
export const retry = mutation({
  args: { applicationId: v.id("botApplications"), eventId: v.id("botEvents") },
  handler: async (ctx, args) => {
    const app = await ownerApp(ctx, args.applicationId);
    const event = await ctx.db.get(args.eventId);
    if (
      !event ||
      event.applicationId !== app._id ||
      event.expiresAt < Date.now()
    )
      botError(404, "NOT_FOUND", "Event not found or expired.");
    if (event.status !== "dead")
      botError(409, "NOT_RETRYABLE", "Only failed deliveries can be retried.");
    await ctx.db.patch(event._id, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.now(),
      lastError: undefined,
    });
  },
});
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db
      .query("botInteractions")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now() - 86400000))
      .take(500))
      await ctx.db.delete(row._id);
    for (const event of await ctx.db
      .query("botEvents")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(500))
      await ctx.db.delete(event._id);
    for (const row of await ctx.db
      .query("botRateLimits")
      .withIndex("by_window", (q) => q.lt("window", Date.now() - 86400000))
      .take(500))
      await ctx.db.delete(row._id);
  },
});
export const webhookStatus = internalQuery({
  args: {},
  handler: async () => ({
    configured: Boolean(process.env.KYRO_BOT_WEBHOOK_PRIVATE_KEY),
  }),
});
export const webhookWorker = makeFunctionReference<"action">(
  "botWebhooks:deliverDue",
);
