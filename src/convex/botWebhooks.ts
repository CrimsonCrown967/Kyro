"use node";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "./functions";
import type { Id } from "./_generated/dataModel";
import {
  deliverWebhook,
  webhookPublicKey,
  webhookSignature,
} from "../../server/bots/webhook";

const due = makeFunctionReference<
  "query",
  Record<string, never>,
  Id<"botEvents">[]
>("botDelivery:due");
const claim = makeFunctionReference<
  "mutation",
  { eventId: Id<"botEvents"> },
  {
    url: string;
    event: { id: string; type: string; timestamp: number; data: unknown };
    attempt: number;
  } | null
>("botDelivery:claim");
const finish = makeFunctionReference<
  "mutation",
  {
    eventId: Id<"botEvents">;
    attempt: number;
    success: boolean;
    error?: string;
  }
>("botDelivery:finish");
export const publicKey = internalAction({
  args: {},
  handler: async () => {
    const key = process.env.KYRO_BOT_WEBHOOK_PRIVATE_KEY;
    if (!key) return { configured: false, key: null };
    return { configured: true, key: webhookPublicKey(key) };
  },
});
export const deliverDue = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids = await ctx.runQuery(due, {});
    await Promise.all(
      ids.map(async (eventId) => {
        const job = await ctx.runMutation(claim, { eventId });
        if (!job) return;
        let error: string | undefined;
        try {
          const key = process.env.KYRO_BOT_WEBHOOK_PRIVATE_KEY;
          if (!key) throw new Error("SIGNING_KEY_NOT_CONFIGURED");
          const timestamp = String(Math.floor(Date.now() / 1000));
          const body = JSON.stringify(job.event);
          await deliverWebhook(
            job.url,
            body,
            webhookSignature(key, timestamp, body),
            timestamp,
            eventId,
          );
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : "DELIVERY_FAILED";
          error = /^[A-Z_0-9]+$/.test(message) ? message : "DELIVERY_FAILED";
        }
        await ctx.runMutation(finish, {
          eventId,
          attempt: job.attempt,
          success: !error,
          ...(error ? { error } : {}),
        });
      }),
    );
  },
});
