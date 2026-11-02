import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const signInState = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("accountSecurity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const setupContext = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const [user, security] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("accountSecurity")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    ]);
    return user
      ? {
          email: user.email ?? user.username ?? "account",
          security,
        }
      : null;
  },
});

export const saveSetup = internalMutation({
  args: { userId: v.id("users"), secret: v.string() },
  handler: async (ctx, { userId, secret }) => {
    const existing = await ctx.db
      .query("accountSecurity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    if (existing) {
      if (existing.twoFactorEnabled) {
        throw new Error("Two-step verification is already enabled.");
      }
      await ctx.db.patch(existing._id, {
        totpSecret: secret,
        recoveryCodeHashes: [],
        setupStartedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("accountSecurity", {
        userId,
        totpSecret: secret,
        twoFactorEnabled: false,
        recoveryCodeHashes: [],
        setupStartedAt: now,
        updatedAt: now,
      });
    }
  },
});

export const enable = internalMutation({
  args: {
    userId: v.id("users"),
    recoveryCodeHashes: v.array(v.string()),
  },
  handler: async (ctx, { userId, recoveryCodeHashes }) => {
    const existing = await ctx.db
      .query("accountSecurity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!existing?.totpSecret) throw new Error("Start setup again.");
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      twoFactorEnabled: true,
      recoveryCodeHashes,
      setupStartedAt: undefined,
      enabledAt: now,
      updatedAt: now,
    });
  },
});

export const replaceRecoveryCodes = internalMutation({
  args: {
    userId: v.id("users"),
    recoveryCodeHashes: v.array(v.string()),
  },
  handler: async (ctx, { userId, recoveryCodeHashes }) => {
    const existing = await ctx.db
      .query("accountSecurity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!existing?.twoFactorEnabled) {
      throw new Error("Two-step verification isn't enabled.");
    }
    await ctx.db.patch(existing._id, {
      recoveryCodeHashes,
      updatedAt: Date.now(),
    });
  },
});

export const consumeRecoveryCode = internalMutation({
  args: { userId: v.id("users"), codeHash: v.string() },
  handler: async (ctx, { userId, codeHash }) => {
    const existing = await ctx.db
      .query("accountSecurity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!existing?.twoFactorEnabled) return false;
    const index = existing.recoveryCodeHashes.indexOf(codeHash);
    if (index < 0) return false;
    await ctx.db.patch(existing._id, {
      recoveryCodeHashes: existing.recoveryCodeHashes.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const disable = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("accountSecurity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
