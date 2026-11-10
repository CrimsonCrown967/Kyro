"use node";

import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { BOT_EVENT_TYPES } from "../lib/botContracts";

const claimRef = makeFunctionReference<"mutation">("botEvents:claim");
const finishRef = makeFunctionReference<"mutation">("botEvents:finish");
function applicationKey(applicationId: string) {
  const encoded = process.env.KYRO_BOT_EVENT_SIGNING_KEY;
  const master = encoded ? Buffer.from(encoded, "base64") : null;
  if (!master || master.length !== 32)
    throw new Error("Webhook signing is not configured.");
  const seed = createHmac("sha256", master)
    .update(`kyro-bot-events-v1:${applicationId}`)
    .digest();
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
}
/** Public IPv4 only: pin a DNS result, never trust a second resolution or redirect. */
export function isPublicWebhookAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function sendWebhook(
  urlString: string,
  body: string,
  headers: Record<string, string>,
): Promise<number> {
  const url = new URL(urlString);
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Invalid webhook URL.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses;
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Webhook DNS timed out.")),
          5000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const ipv4 = addresses.filter((entry) => entry.family === 4);
  if (
    !ipv4.length ||
    ipv4.some((entry) => !isPublicWebhookAddress(entry.address))
  )
    throw new Error("Webhook destination is not a public IPv4 address.");
  const address = ipv4[0].address;
  return await new Promise<number>((resolve, reject) => {
    const deadline = setTimeout(
      () => outgoing.destroy(new Error("Webhook delivery timed out.")),
      5000,
    );
    const outgoing = request(
      url,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "user-agent": "Kyro-Webhooks/1.0",
        },
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        agent: false,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 8192) response.destroy();
        });
        response.on("error", () => {});
        response.resume();
        resolve(status);
        // No response content is recorded, and redirects are never followed.
      },
    );
    outgoing.on("close", () => clearTimeout(deadline));
    outgoing.on("error", () => reject(new Error("Webhook connection failed.")));
    outgoing.setTimeout(5000, () =>
      outgoing.destroy(new Error("Webhook delivery timed out.")),
    );
    outgoing.end(body);
  });
}
export const gateway = internalAction({
  args: { applicationId: v.id("botApplications") },
  handler: async (_ctx, { applicationId }) => {
    let signingPublicKey: string | null = null;
    try {
      signingPublicKey = createPublicKey(applicationKey(applicationId))
        .export({ format: "pem", type: "spki" })
        .toString();
    } catch {
      /* Polling requires no signing key. */
    }
    return {
      signingPublicKey,
      events: BOT_EVENT_TYPES,
      transport: "polling-or-webhook",
      retentionDays: 7,
    };
  },
});
export const deliver = internalAction({
  args: { deliveryId: v.id("botEventDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.runMutation(claimRef, { deliveryId });
    if (!delivery) return;
    let success = false;
    let error: string | undefined;
    try {
      const body = JSON.stringify(delivery.event);
      const timestamp = String(Date.now());
      const signature = sign(
        null,
        Buffer.from(`${timestamp}.${body}`),
        applicationKey(delivery.applicationId),
      ).toString("base64");
      const status = await sendWebhook(delivery.url, body, {
        "x-kyro-event-id": delivery.event.id,
        "x-kyro-timestamp": timestamp,
        "x-kyro-signature": signature,
      });
      success = status >= 200 && status < 300;
      if (!success) error = `Webhook returned HTTP ${status}.`;
    } catch (cause) {
      error =
        cause instanceof Error &&
        /^(Webhook|Invalid webhook)/.test(cause.message)
          ? cause.message
          : "Webhook delivery failed.";
    }
    await ctx.runMutation(finishRef, {
      deliveryId,
      attempt: delivery.attempt,
      success,
      error,
    });
  },
});
