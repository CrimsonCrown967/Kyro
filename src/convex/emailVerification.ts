import { v } from "convex/values";
import { action } from "./functions";
import {
  prepareEmailVerificationRef,
  verificationAccountRef,
  verifyEmailCodeRef,
} from "./verificationRefs";
import { generateSixDigitCode } from "./verificationCodes";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const requestCode = action({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const clean = normalizeEmail(email);
    if (!EMAIL_RE.test(clean) || clean.length > 254) {
      throw new Error("Enter a valid email address.");
    }
    const account = await ctx.runQuery(verificationAccountRef, {
      email: clean,
    });
    const code = generateSixDigitCode();
    const result = await ctx.runMutation(prepareEmailVerificationRef, {
      email: clean,
      code,
      ...(account?.requiresVerification ? { userId: account.userId } : {}),
    });
    return { ok: true as const, throttled: result.throttled };
  },
});

export const verifyCode = action({
  args: { email: v.string(), code: v.string() },
  handler: async (ctx, { email, code }) => {
    const clean = normalizeEmail(email);
    const digits = code.trim();
    if (!EMAIL_RE.test(clean) || !/^\d{6}$/.test(digits)) {
      throw new Error("Enter the 6-digit code from your email.");
    }
    const verification = await ctx.runMutation(verifyEmailCodeRef, {
      email: clean,
      code: digits,
    });
    if (!verification.ok) throw new Error(verification.error);
    return verification;
  },
});
