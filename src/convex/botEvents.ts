import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  requireOwnedApplication,
  requireBotChannel,
  requireBotServer,
} from "./botCore";
import { botFailure } from "./botRuntimeLib";
import { PERMISSIONS } from "../lib/permissions";

const fanOutRef = makeFunctionReference<"mutation">("botEvents:fanOut");
const deliverRef = makeFunctionReference<"action">("botWebhooks:deliver");
const MAX_ATTEMPTS = 8;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export async function canReceiveEvent(
  ctx: QueryCtx | MutationCtx,
  app: Doc<"botApplications">,
  event: Doc<"botEvents">,
) {
  if (
    event.createdAt < Date.now() - RETENTION_MS ||
    (event.visibleToApplicationIds &&
      !event.visibleToApplicationIds.includes(app._id))
  )
    return false;
  if (
    !app.enabled ||
    app.suspended ||
    app.deletedAt ||
    (event.applicationId && event.applicationId !== app._id)
  )
    return false;
  if (
    event.type !== "interactionCreate" &&
    !app.subscriptions.includes(event.type)
  )
    return false;
  try {
    const access = await requireBotServer(ctx, app, event.serverId);
    if (access.installation.createdAt > event.createdAt) return false;
    if (event.channelId && event.type !== "channelDelete")
      await requireBotChannel(
        ctx,
        app,
        event.channelId,
        event.type.startsWith("message")
          ? PERMISSIONS.READ_MESSAGE_HISTORY
          : PERMISSIONS.VIEW_CHANNEL,
      );
    return true;
  } catch {
    return false;
  }
}
export function eventObject(event: Doc<"botEvents">) {
  return {
    id: event._id,
    type: event.type,
    createdAt: event.createdAt,
    serverId: event.serverId,
    channelId: event.channelId,
    data: JSON.parse(event.dataJson) as unknown,
  };
}
export const fanOut = internalMutation({
  args: { eventId: v.id("botEvents"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { eventId, cursor }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return;
    const page = await ctx.db
      .query("botInstallations")
      .withIndex("by_server", (q) => q.eq("serverId", event.serverId))
      .paginate({ numItems: 50, cursor });
    for (const installation of page.page) {
      const app = await ctx.db.get(installation.applicationId);
      if (!app || !(await canReceiveEvent(ctx, app, event))) continue;
      const exists = await ctx.db
        .query("botEventDeliveries")
        .withIndex("by_application_event", (q) =>
          q.eq("applicationId", app._id).eq("eventId", eventId),
        )
        .unique();
      if (exists) continue;
      const deliveryId = await ctx.db.insert("botEventDeliveries", {
        applicationId: app._id,
        eventId,
        status: "pending",
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: event.createdAt,
      });
      if (app.webhookUrl)
        await ctx.scheduler.runAfter(0, deliverRef, { deliveryId });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, fanOutRef, {
        eventId,
        cursor: page.continueCursor,
      });
  },
});
export async function pollEvents(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  limit: number,
) {
  if (app.webhookUrl)
    botFailure(
      "CONFLICT",
      "Disable the webhook URL before using event polling.",
    );
  const deliveries = await ctx.db
    .query("botEventDeliveries")
    .withIndex("by_application_status", (q) =>
      q.eq("applicationId", app._id).eq("status", "pending"),
    )
    .take(100);
  const events = [];
  let hasMore = false;
  for (const delivery of deliveries) {
    const event = await ctx.db.get(delivery.eventId);
    if (
      !event ||
      event.createdAt < Date.now() - RETENTION_MS ||
      !(await canReceiveEvent(ctx, app, event))
    ) {
      await ctx.db.patch(delivery._id, {
        status: "failed",
        lastError: "Expired or access revoked.",
      });
      continue;
    }
    if (events.length >= limit) {
      hasMore = true;
      break;
    }
    events.push(eventObject(event));
  }
  return { events, hasMore: hasMore || deliveries.length === 100 };
}
export async function acknowledgeEvents(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  eventIds: string[],
) {
  let acknowledged = 0;
  for (const raw of new Set(eventIds)) {
    const eventId = ctx.db.normalizeId("botEvents", raw);
    if (!eventId) botFailure("INVALID_REQUEST", "Invalid event ID.");
    const row = await ctx.db
      .query("botEventDeliveries")
      .withIndex("by_application_event", (q) =>
        q.eq("applicationId", app._id).eq("eventId", eventId),
      )
      .unique();
    if (!row) continue;
    if (row.status !== "delivered")
      await ctx.db.patch(row._id, {
        status: "delivered",
        acknowledgedAt: Date.now(),
        lastError: undefined,
      });
    acknowledged += 1;
  }
  return { acknowledged };
}
export const logs = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    await requireOwnedApplication(ctx, applicationId);
    const rows = await ctx.db
      .query("botEventDeliveries")
      .withIndex("by_application_created", (q) =>
        q.eq("applicationId", applicationId),
      )
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        eventType: (await ctx.db.get(row.eventId))?.type ?? "expired",
        status: row.status,
        attempts: row.attempts,
        createdAt: row.createdAt,
        lastError: row.lastError,
        nextAttemptAt: row.nextAttemptAt,
      })),
    );
  },
});
export const retry = mutation({
  args: { deliveryId: v.id("botEventDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const row = await ctx.db.get(deliveryId);
    if (!row) botFailure("NOT_FOUND", "Delivery not found.");
    const { app } = await requireOwnedApplication(ctx, row.applicationId);
    if (row.status !== "failed")
      botFailure("CONFLICT", "Only failed deliveries can be retried.");
    const event = await ctx.db.get(row.eventId);
    if (!event || !(await canReceiveEvent(ctx, app, event)))
      botFailure("FORBIDDEN", "Event expired or bot access was revoked.");
    await ctx.db.patch(row._id, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.now(),
      lastError: undefined,
    });
    if (app.webhookUrl)
      await ctx.scheduler.runAfter(0, deliverRef, { deliveryId });
  },
});
export const claim = internalMutation({
  args: { deliveryId: v.id("botEventDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const row = await ctx.db.get(deliveryId);
    if (
      !row ||
      row.status === "delivered" ||
      row.status === "failed" ||
      row.nextAttemptAt > Date.now() ||
      (row.status === "inflight" && (row.leaseUntil ?? 0) > Date.now())
    )
      return null;
    const app = await ctx.db.get(row.applicationId);
    const event = await ctx.db.get(row.eventId);
    if (!app || !event || !(await canReceiveEvent(ctx, app, event))) {
      await ctx.db.patch(row._id, {
        status: "failed",
        lastError: "Event expired or access revoked.",
      });
      return null;
    }
    if (!app.webhookUrl) return null;
    // At most 30 outbound deliveries per application each minute.
    const { rateLimit } = await import("./botRuntimeLib");
    if (!(await rateLimit(ctx, `webhook:${app._id}`, 30, 60_000))) {
      await ctx.db.patch(row._id, {
        status: "pending",
        nextAttemptAt: Date.now() + 60_000,
      });
      return null;
    }
    const attempt = row.attempts + 1;
    await ctx.db.patch(row._id, {
      status: "inflight",
      attempts: attempt,
      leaseUntil: Date.now() + 30_000,
      nextAttemptAt: Date.now() + 30_000,
    });
    return {
      applicationId: app._id,
      url: app.webhookUrl,
      event: eventObject(event),
      attempt,
    };
  },
});
export const finish = internalMutation({
  args: {
    deliveryId: v.id("botEventDeliveries"),
    attempt: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { deliveryId, attempt, success, error }) => {
    const row = await ctx.db.get(deliveryId);
    if (!row || row.status !== "inflight" || row.attempts !== attempt) return;
    const terminal = success || attempt >= MAX_ATTEMPTS;
    const delay = Math.min(60 * 60_000, 5000 * 2 ** (attempt - 1));
    await ctx.db.patch(deliveryId, {
      status: success ? "delivered" : terminal ? "failed" : "pending",
      acknowledgedAt: success ? Date.now() : undefined,
      lastError: success
        ? undefined
        : (error ?? "Delivery failed.").slice(0, 200),
      leaseUntil: undefined,
      nextAttemptAt: Date.now() + delay,
    });
    if (!terminal)
      await ctx.scheduler.runAfter(delay, deliverRef, { deliveryId });
  },
});
const sweepRef = makeFunctionReference<"mutation">("botEvents:sweepDue");
/** Paginate past polling queues so they cannot starve webhook recovery. */
export const sweepDue = internalMutation({
  args: {
    status: v.union(v.literal("pending"), v.literal("inflight")),
    cursor: v.union(v.string(), v.null()),
    dueAt: v.number(),
  },
  handler: async (ctx, { status, cursor, dueAt }) => {
    const page = await ctx.db
      .query("botEventDeliveries")
      .withIndex("by_status_due", (q) =>
        q.eq("status", status).lte("nextAttemptAt", dueAt),
      )
      .paginate({ numItems: 100, cursor });
    for (const row of page.page) {
      const app = await ctx.db.get(row.applicationId);
      if (app?.webhookUrl)
        await ctx.scheduler.runAfter(0, deliverRef, { deliveryId: row._id });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, sweepRef, {
        status,
        cursor: page.continueCursor,
        dueAt,
      });
  },
});
export const maintain = internalMutation({
  args: {},
  handler: async (ctx) => {
    const offline = await ctx.db
      .query("botApplications")
      .withIndex("by_presence", (q) =>
        q
          .eq("enabled", true)
          .gt("lastSeen", 0)
          .lt("lastSeen", Date.now() - 150_000),
      )
      .take(100);
    for (const app of offline) {
      await ctx.db.patch(app._id, { lastSeen: undefined });
      if (await ctx.db.get(app.botUserId))
        await ctx.db.patch(app.botUserId, {
          status: "offline",
          lastSeen: undefined,
        });
    }
    for (const status of ["pending", "inflight"] as const)
      await ctx.scheduler.runAfter(0, sweepRef, {
        status,
        cursor: null,
        dueAt: Date.now(),
      });
    const before = Date.now() - RETENTION_MS;
    const deliveries = await ctx.db
      .query("botEventDeliveries")
      .withIndex("by_created", (q) => q.lt("createdAt", before))
      .take(500);
    for (const row of deliveries) await ctx.db.delete(row._id);
    const events = await ctx.db
      .query("botEvents")
      .withIndex("by_created", (q) => q.lt("createdAt", before))
      .take(500);
    for (const row of events) await ctx.db.delete(row._id);
    const limits = await ctx.db
      .query("botRateLimits")
      .withIndex("by_window", (q) => q.lt("windowStart", Date.now() - 3600_000))
      .take(500);
    for (const row of limits) await ctx.db.delete(row._id);
    const interactions = await ctx.db
      .query("botInteractions")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", before))
      .take(500);
    for (const row of interactions) await ctx.db.delete(row._id);
  },
});
