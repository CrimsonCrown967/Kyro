import { internalMutation } from "./functions";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { PRESENCE_TIMEOUT_MS } from "./lib";

export const HEARTBEAT_MIN_WRITE_MS = 45_000;

/** Renew a small lease without invalidating every query that reads the profile. */
export async function renewPresence(
  ctx: MutationCtx,
  user: Doc<"users">,
  device?: "desktop" | "mobile" | "tablet",
  explicitStatus?: Doc<"users">["status"],
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("userPresence")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  const status =
    explicitStatus ??
    (user.status === "idle" ||
    user.status === "dnd" ||
    user.status === "invisible"
      ? user.status
      : "online");
  const online = status !== "offline";
  const transition =
    user.presenceOnline !== online ||
    user.status !== status ||
    (device !== undefined && user.device !== device);
  if (
    !transition &&
    existing &&
    now - existing.lastHeartbeatAt < HEARTBEAT_MIN_WRITE_MS
  )
    return;
  if (!online) {
    if (existing) await ctx.db.delete(existing._id);
  } else {
    const lease = {
      lastHeartbeatAt: now,
      expiresAt: now + PRESENCE_TIMEOUT_MS,
    };
    if (existing) await ctx.db.patch(existing._id, lease);
    else await ctx.db.insert("userPresence", { userId: user._id, ...lease });
  }
  if (transition)
    await ctx.db.patch(user._id, {
      presenceOnline: online,
      status,
      lastSeen: now,
      ...(device ? { device } : {}),
    });
}

/** Only expired leases are read. No full user scan, and renewals are transaction-safe. */
export const expire = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("userPresence")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", Date.now()))
      .take(200);
    for (const lease of expired) {
      const user = await ctx.db.get(lease.userId);
      if (user && user.presenceOnline !== false)
        await ctx.db.patch(user._id, {
          presenceOnline: false,
          lastSeen: lease.lastHeartbeatAt,
        });
      await ctx.db.delete(lease._id);
    }
    return { expired: expired.length };
  },
});
