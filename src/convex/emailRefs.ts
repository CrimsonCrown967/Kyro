import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

export const claimEmailRef = makeFunctionReference<
  "mutation",
  { outboxId: Id<"emailOutbox"> },
  {
    eventKey: string;
    to: string;
    template:
      | "password_reset"
      | "email_verification"
      | "temporary_ban"
      | "permanent_ban"
      | "warning"
      | "restoration";
    payload: string;
  } | null
>("emailOutbox:claim");

export const markEmailSentRef = makeFunctionReference<
  "mutation",
  { outboxId: Id<"emailOutbox">; providerMessageId: string },
  void
>("emailOutbox:markSent");

export const markEmailFailedRef = makeFunctionReference<
  "mutation",
  { outboxId: Id<"emailOutbox">; errorCode: string },
  { retrying: boolean }
>("emailOutbox:markFailed");

export const deliverEmailRef = makeFunctionReference<
  "action",
  { outboxId: Id<"emailOutbox"> },
  void
>("emailDelivery:deliver");

export const kickDueEmailsRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { scheduled: number }
>("emailOutbox:kickDue");

export const cleanupEmailRecordsRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { deleted: number }
>("emailOutbox:cleanupExpiredRecords");

export const notifyExpiredBansRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { queued: number }
>("emailOutbox:notifyExpiredBans");
