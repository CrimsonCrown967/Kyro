import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

type VerifyResult = { ok: true } | { ok: false; error: string };

export const verificationAccountRef = makeFunctionReference<
  "query",
  { email: string },
  {
    userId: Id<"users">;
    requiresVerification: boolean;
  } | null
>("emailVerificationInternal:accountForEmail");

export const verificationRequirementRef = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  boolean
>("emailVerificationInternal:requiresVerification");

export const prepareEmailVerificationRef = makeFunctionReference<
  "mutation",
  { email: string; code: string; userId?: Id<"users"> },
  { throttled: boolean }
>("emailVerificationInternal:prepare");

export const verifyEmailCodeRef = makeFunctionReference<
  "mutation",
  { email: string; code: string },
  VerifyResult
>("emailVerificationInternal:verify");

export const passwordResetAccountRef = makeFunctionReference<
  "query",
  { email: string },
  { userId: Id<"users">; hasPassword: boolean } | null
>("passwordResetInternal:accountForEmail");

export const passwordResetPrepareRef = makeFunctionReference<
  "mutation",
  { email: string; code: string; userId?: Id<"users"> },
  { throttled: boolean }
>("passwordResetInternal:prepare");

export const passwordResetVerifyRef = makeFunctionReference<
  "mutation",
  { email: string; code: string },
  VerifyResult
>("passwordResetInternal:verify");
