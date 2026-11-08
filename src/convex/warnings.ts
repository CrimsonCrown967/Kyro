import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  isPlatformAdmin,
  isPlatformStaff,
  notify,
  requireActiveUser,
  requireUser,
} from "./lib";
import { enqueueUserEmail } from "./emailOutbox";

/** Warnings last 3 days, exactly like the account-standing copy says. */
const WARNING_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Issue a platform warning against an account (site staff only).
 * Enforcement lives in lib.restrictionLevel — see Settings → Account standing.
 */
export const warn = mutation({
  args: { userId: v.id("users"), reason: v.string() },
  handler: async (ctx, { userId, reason }) => {
    const { id, user } = await requireActiveUser(ctx);
    if (!isPlatformStaff(user)) {
      throw new Error("Only Kyro staff can issue warnings.");
    }
    if (userId === id) throw new Error("You can't warn yourself.");
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("That user no longer exists.");
    if (isPlatformAdmin(target) && !isPlatformAdmin(user)) {
      throw new Error("Only an admin can warn another administrator.");
    }
    const clean = reason.trim().slice(0, 300);
    if (clean.length < 3) {
      throw new Error("Say why — at least a few characters.");
    }
    const now = Date.now();
    const warningId = await ctx.db.insert("warnings", {
      userId,
      issuedById: id,
      reason: clean,
      createdAt: now,
      expiresAt: now + WARNING_LIFETIME_MS,
    });
    await notify(ctx, {
      userId,
      type: "moderation",
      title: "You received a warning from Kyro staff",
      body: clean,
      actorId: id,
    });
    await enqueueUserEmail(ctx, {
      eventKey: `warning:${warningId}:created`,
      userId,
      template: "warning",
      payload: {
        reason: clean,
        explanation: clean,
        actionAt: now,
        rules: "Review Kyro's Terms and Community Guidelines.",
      },
    });
  },
});

/** My active warnings and the standing they add up to, for the account page. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const rows = await ctx.db
      .query("warnings")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect();
    const now = Date.now();
    const active = rows
      .filter((row) => row.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt);
    const standings = [
      "all_good",
      "limited",
      "very_limited",
      "suspended",
    ] as const;
    return {
      count: active.length,
      standing: standings[Math.min(active.length, 3)],
      warnings: active.slice(0, 10).map((row) => ({
        id: row._id as string,
        reason: row.reason,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      })),
    };
  },
});
