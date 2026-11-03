import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { sha256Hex } from "./sha256";

/** Consumed only by Kyro's Vercel Functions; possession is the one-time proof. */
export const consume = mutation({
  args: {
    ticket: v.string(),
    purpose: v.union(v.literal("join"), v.literal("moderate")),
  },
  handler: async (ctx, { ticket, purpose }) => {
    if (!/^[a-zA-Z0-9_-]{40,80}$/.test(ticket)) {
      throw new Error("Invalid LiveKit ticket.");
    }
    const row = await ctx.db
      .query("livekitTickets")
      .withIndex("by_hash", (q) => q.eq("ticketHash", sha256Hex(ticket)))
      .unique();
    const now = Date.now();
    if (
      !row ||
      row.purpose !== purpose ||
      row.consumedAt !== undefined ||
      row.expiresAt <= now
    ) {
      throw new Error("That LiveKit ticket is invalid or expired.");
    }
    await ctx.db.patch(row._id, { consumedAt: now });
    return {
      roomName: row.roomName,
      identity: row.identity,
      displayName: row.displayName,
      metadata: row.metadata,
      canPublishSources: row.canPublishSources,
      canManage: row.canManage,
      action: row.action ?? null,
      targetIdentity: row.targetIdentity ?? null,
      trackSid: row.trackSid ?? null,
    };
  },
});
