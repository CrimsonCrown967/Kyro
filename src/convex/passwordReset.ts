import { v } from "convex/values";
import {
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { action } from "./functions";
import {
  passwordResetAccountRef,
  passwordResetPrepareRef,
  passwordResetVerifyRef,
} from "./verificationRefs";
import { generateSixDigitCode } from "./verificationCodes";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Anonymous request with identical responses for registered and unknown email. */
export const requestCode = action({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const clean = normalizeEmail(email);
    if (!EMAIL_RE.test(clean) || clean.length > 254) {
      throw new Error("Enter a valid email address.");
    }
    const account = await ctx.runQuery(passwordResetAccountRef, {
      email: clean,
    });
    const code = generateSixDigitCode();
    const result = await ctx.runMutation(passwordResetPrepareRef, {
      email: clean,
      code,
      ...(account?.hasPassword ? { userId: account.userId } : {}),
    });
    return { ok: true as const, throttled: result.throttled };
  },
});

/** Trade a one-time code for a new Scrypt password and invalidate sessions. */
export const resetPassword = action({
  args: {
    email: v.string(),
    code: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { email, code, newPassword }) => {
    const clean = normalizeEmail(email);
    const digits = code.trim();
    if (!/^\d{6}$/.test(digits)) {
      throw new Error("Enter the 6-digit code from your email.");
    }
    if (newPassword.length < 8) {
      throw new Error("New passwords need at least 8 characters.");
    }
    if (newPassword.length > 200) {
      throw new Error("New passwords can be at most 200 characters.");
    }
    const account = await ctx.runQuery(passwordResetAccountRef, {
      email: clean,
    });
    if (!account?.hasPassword) {
      throw new Error("That code is no longer valid. Request a new one.");
    }
    await ctx.runMutation(passwordResetVerifyRef, {
      email: clean,
      code: digits,
    });
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: clean, secret: newPassword },
    });
    const verified = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: clean, secret: newPassword },
    }).catch(() => null);
    if (!verified) {
      throw new Error("The password was saved but sign-in failed. Try again.");
    }
    await invalidateSessions(ctx, { userId: account.userId }).catch(
      () => undefined,
    );
    return { ok: true as const };
  },
});
