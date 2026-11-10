import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query } from "./functions";
import { sha256Hex } from "./sha256";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotp,
} from "./totp";
import { requireUser } from "./lib";
import {
  securityConsumeRecoveryCode,
  securityDisable,
  securityEnable,
  securityReplaceRecoveryCodes,
  securitySaveSetup,
  securitySetupContext,
  securitySignInState,
} from "./securityRefs";

function recoveryHash(userId: string, code: string) {
  return sha256Hex(`${userId}:${normalizeRecoveryCode(code)}`);
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const [security, passkeys] = await Promise.all([
      ctx.db
        .query("accountSecurity")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .unique(),
      ctx.db
        .query("passkeyCredentials")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
    ]);
    return {
      twoFactorEnabled: security?.twoFactorEnabled === true,
      setupPending:
        security?.twoFactorEnabled !== true &&
        security?.totpSecret !== undefined,
      recoveryCodesRemaining: security?.recoveryCodeHashes.length ?? 0,
      enabledAt: security?.enabledAt ?? null,
      passkeyCount: passkeys.length,
      passkeys: passkeys.map((passkey) => ({
        id: passkey._id as string,
        name: passkey.name,
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt ?? null,
      })),
    };
  },
});

export const beginTwoFactorSetup = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You're not signed in.");
    const context = await ctx.runQuery(securitySetupContext, {
      userId,
    });
    if (!context) throw new Error("Your account no longer exists.");
    if (context.security?.twoFactorEnabled) {
      throw new Error("Two-step verification is already enabled.");
    }
    const secret = generateTotpSecret();
    await ctx.runMutation(securitySaveSetup, {
      userId,
      secret,
    });
    const label = `Kyro:${context.email}`;
    return {
      secret,
      uri: `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=Kyro&algorithm=SHA1&digits=6&period=30`,
    };
  },
});

export const confirmTwoFactorSetup = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You're not signed in.");
    const state = await ctx.runQuery(securitySignInState, {
      userId,
    });
    if (!state?.totpSecret || state.twoFactorEnabled) {
      throw new Error("Start setup again.");
    }
    if (!(await verifyTotp(state.totpSecret, code))) {
      throw new Error("That authenticator code isn't valid.");
    }
    const recoveryCodes = generateRecoveryCodes();
    await ctx.runMutation(securityEnable, {
      userId,
      recoveryCodeHashes: recoveryCodes.map((value) =>
        recoveryHash(userId, value),
      ),
    });
    return { recoveryCodes };
  },
});

export const regenerateRecoveryCodes = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You're not signed in.");
    const state = await ctx.runQuery(securitySignInState, {
      userId,
    });
    if (!state?.twoFactorEnabled || !state.totpSecret) {
      throw new Error("Two-step verification isn't enabled.");
    }
    if (!(await verifyTotp(state.totpSecret, code))) {
      throw new Error("That authenticator code isn't valid.");
    }
    const recoveryCodes = generateRecoveryCodes();
    await ctx.runMutation(securityReplaceRecoveryCodes, {
      userId,
      recoveryCodeHashes: recoveryCodes.map((value) =>
        recoveryHash(userId, value),
      ),
    });
    return { recoveryCodes };
  },
});

export const disableTwoFactor = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You're not signed in.");
    const state = await ctx.runQuery(securitySignInState, {
      userId,
    });
    if (!state?.twoFactorEnabled || !state.totpSecret) return true;
    const validTotp = await verifyTotp(state.totpSecret, code);
    const validRecovery = validTotp
      ? false
      : await ctx.runMutation(securityConsumeRecoveryCode, {
          userId,
          codeHash: recoveryHash(userId, code),
        });
    if (!validTotp && !validRecovery) {
      throw new Error("That authenticator or recovery code isn't valid.");
    }
    await ctx.runMutation(securityDisable, { userId });
    return true;
  },
});

export const cancelTwoFactorSetup = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const existing = await ctx.db
      .query("accountSecurity")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .unique();
    if (existing && !existing.twoFactorEnabled) {
      await ctx.db.delete(existing._id);
    }
  },
});
