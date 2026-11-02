import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

const EMAIL_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const context = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "password"),
      )
      .unique();
    return {
      email: user.email ?? null,
      emailChangedAt: user.emailChangedAt ?? null,
      hasPassword: account !== null,
    };
  },
});

export const apply = internalMutation({
  args: { userId: v.id("users"), newEmail: v.string() },
  handler: async (ctx, { userId, newEmail }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Your account no longer exists.");
    const now = Date.now();
    if (
      user.emailChangedAt !== undefined &&
      now - user.emailChangedAt < EMAIL_CHANGE_COOLDOWN_MS
    ) {
      throw new Error("Email addresses can only be changed once every 7 days.");
    }
    const duplicateUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", newEmail))
      .unique();
    if (duplicateUser && duplicateUser._id !== userId) {
      throw new Error("That email address is already in use.");
    }
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "password"),
      )
      .unique();
    if (!account) throw new Error("This account doesn't use password sign-in.");
    const duplicateAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", newEmail),
      )
      .unique();
    if (duplicateAccount && duplicateAccount._id !== account._id) {
      throw new Error("That email address is already in use.");
    }
    await ctx.db.patch(account._id, { providerAccountId: newEmail });
    await ctx.db.patch(userId, {
      email: newEmail,
      emailChangedAt: now,
      emailVerificationTime: undefined,
    });
    return now;
  },
});
