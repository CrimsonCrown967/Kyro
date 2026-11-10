import { v } from "convex/values";
import { internalMutation, internalQuery } from "./functions";
import { enqueueEmail } from "./emailOutbox";
import { secureCodeHash } from "./verificationCodes";

const CODE_TTL_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function codeHash(email: string, code: string): string {
  return secureCodeHash(
    process.env.KYRO_EMAIL_VERIFY_PEPPER ?? "",
    "email-verification",
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
    return user
      ? {
          userId: user._id,
          requiresVerification:
            user.requiresEmailVerification === true &&
            user.emailVerificationTime === undefined,
        }
      : null;
  },
});

export const requiresVerification = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return Boolean(
      user?.requiresEmailVerification === true &&
      user.emailVerificationTime === undefined,
    );
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
      .query("emailVerificationRequests")
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
    await ctx.db.insert("emailVerificationRequests", { email, createdAt: now });
    if (!userId) return { throttled: false };
    const user = await ctx.db.get(userId);
    if (
      !user ||
      user.email !== email ||
      user.requiresEmailVerification !== true ||
      user.emailVerificationTime !== undefined
    ) {
      return { throttled: false };
    }
    const oldCodes = await ctx.db
      .query("emailVerificationCodes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const old of oldCodes) await ctx.db.delete(old._id);
    const verificationId = await ctx.db.insert("emailVerificationCodes", {
      userId,
      email,
      codeHash: codeHash(email, code),
      attempts: 0,
      expiresAt: now + CODE_TTL_MS,
      createdAt: now,
    });
    await enqueueEmail(ctx, {
      eventKey: `email-verification:${verificationId}`,
      userId,
      to: email,
      template: "email_verification",
      payload: {
        email,
        code,
        displayName: user.name ?? user.username ?? "Kyro member",
        username: user.username ?? "unknown",
      },
    });
    return { throttled: false };
  },
});

export const verify = internalMutation({
  args: { email: v.string(), code: v.string() },
  handler: async (ctx, { email, code }) => {
    const rows = await ctx.db
      .query("emailVerificationCodes")
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
    if (row.codeHash !== codeHash(email, code)) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      const left = MAX_ATTEMPTS - row.attempts - 1;
      throw new Error(
        left > 0
          ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many wrong attempts — that code was canceled.",
      );
    }
    const user = await ctx.db.get(row.userId);
    if (!user || user.email !== email) {
      await ctx.db.delete(row._id);
      throw new Error("That code is no longer valid. Request a new one.");
    }
    await ctx.db.patch(row.userId, {
      emailVerificationTime: now,
      requiresEmailVerification: undefined,
    });
    for (const codeRow of rows) await ctx.db.delete(codeRow._id);
    return { ok: true as const };
  },
});
