import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";

export const securitySignInState = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  Doc<"accountSecurity"> | null
>("securityInternal:signInState");

export const securitySetupContext = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  {
    email: string;
    security: Doc<"accountSecurity"> | null;
  } | null
>("securityInternal:setupContext");

export const securitySaveSetup = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; secret: string },
  void
>("securityInternal:saveSetup");

export const securityEnable = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; recoveryCodeHashes: string[] },
  void
>("securityInternal:enable");

export const securityReplaceRecoveryCodes = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; recoveryCodeHashes: string[] },
  void
>("securityInternal:replaceRecoveryCodes");

export const securityConsumeRecoveryCode = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; codeHash: string },
  boolean
>("securityInternal:consumeRecoveryCode");

export const securityDisable = makeFunctionReference<
  "mutation",
  { userId: Id<"users"> },
  void
>("securityInternal:disable");
