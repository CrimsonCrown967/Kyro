import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  claimEmailRef,
  markEmailFailedRef,
  markEmailSentRef,
} from "./emailRefs";

function safeCode(value: unknown): string {
  return String(value ?? "DELIVERY_FAILURE")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

export const deliver = internalAction({
  args: { outboxId: v.id("emailOutbox") },
  handler: async (ctx, { outboxId }) => {
    const email = await ctx.runMutation(claimEmailRef, { outboxId });
    if (!email) return;
    const endpoint = process.env.EMAIL_DISPATCH_URL?.trim();
    const secret = process.env.EMAIL_DISPATCH_SECRET?.trim();
    if (!endpoint || !secret) {
      await ctx.runMutation(markEmailFailedRef, {
        outboxId,
        errorCode: "DISPATCH_NOT_CONFIGURED",
      });
      return;
    }
    let url: URL;
    try {
      url = new URL(endpoint);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "kyro-chat.cyou" ||
        url.pathname !== "/api/email/dispatch"
      ) {
        throw new Error("unsafe endpoint");
      }
    } catch {
      await ctx.runMutation(markEmailFailedRef, {
        outboxId,
        errorCode: "INVALID_DISPATCH_URL",
      });
      return;
    }

    try {
      const payload = JSON.parse(email.payload) as Record<string, unknown>;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: email.eventKey,
          to: email.to,
          template: email.template,
          payload,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        messageId?: string;
        code?: string;
      } | null;
      if (!response.ok || result?.ok !== true || !result.messageId) {
        await ctx.runMutation(markEmailFailedRef, {
          outboxId,
          errorCode: safeCode(result?.code ?? `HTTP_${response.status}`),
        });
        return;
      }
      await ctx.runMutation(markEmailSentRef, {
        outboxId,
        providerMessageId: result.messageId,
      });
    } catch (error) {
      const code =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "DISPATCH_TIMEOUT"
          : "DISPATCH_NETWORK_ERROR";
      await ctx.runMutation(markEmailFailedRef, { outboxId, errorCode: code });
    }
  },
});
