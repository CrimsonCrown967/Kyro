import { v } from "convex/values";
import { internalMutation, internalQuery } from "./functions";
import { enqueueEmail } from "./emailOutbox";
import { secureCodeHash } from "./verificationCodes";

const CODE_TTL_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function resetCodeHash(email: string, code: string): string {
  return secureCodeHash(
    process.env.KYRO_RESET_PEPPER ?? "",
    "password-reset",
    email,
    code,
  );
}

export const accountForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) return null;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", user._id).eq("provider", "password"),
      )
      .unique();
    return { userId: user._id, hasPassword: account !== null };
  },
});

export const prepare = internalMutation({
  args: {
    email: v.string(),
    code: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, { email, code, userId }) => {
    const now = Date.now();
    const history = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(MAX_SENDS_PER_HOUR);
    const recent = history.filter((row) => now - row.createdAt < HOUR_MS);
    if (
      recent.some((row) => now - row.createdAt < COOLDOWN_MS) ||
      recent.length >= MAX_SENDS_PER_HOUR
    ) {
      return { throttled: true };
    }
    await ctx.db.insert("passwordResetRequests", { email, createdAt: now });
    if (!userId) return { throttled: false };

    const rows = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    const resetId = await ctx.db.insert("passwordResetCodes", {
      email,
      codeHash: resetCodeHash(email, code),
      attempts: 0,
      expiresAt: now + CODE_TTL_MS,
      createdAt: now,
    });
    const user = await ctx.db.get(userId);
    if (user?.email === email) {
      await enqueueEmail(ctx, {
        eventKey: `password-reset:${resetId}`,
        userId,
        to: email,
        template: "password_reset",
        payload: {
          email,
          code,
          displayName: user.name ?? user.username ?? "Kyro member",
          username: user.username ?? "unknown",
        },
      });
    }
    return { throttled: false };
  },
});

export const verify = internalMutation({
  args: { email: v.string(), code: v.string() },
  handler: async (ctx, { email, code }) => {
    const rows = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const row = rows.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!row)
      throw new Error("That code is no longer valid. Request a new one.");
    const now = Date.now();
    if (row.expiresAt <= now) {
      await ctx.db.delete(row._id);
      throw new Error("That code has expired. Request a new one.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await ctx.db.delete(row._id);
      throw new Error("Too many wrong attempts — that code was canceled.");
    }
    if (row.codeHash !== resetCodeHash(email, code)) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      const left = MAX_ATTEMPTS - row.attempts - 1;
      throw new Error(
        left > 0
          ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many wrong attempts — that code was canceled.",
      );
    }
    await ctx.db.delete(row._id);
    return { ok: true as const };
  },
});
