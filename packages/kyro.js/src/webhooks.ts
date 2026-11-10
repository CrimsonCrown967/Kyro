import { verify, createPublicKey } from "node:crypto";
import type { BotEvent, EventStore } from "./types.js";

/** Verify the exact body bytes before parsing JSON. Headers use milliseconds. */
export function verifyWebhookSignature(options: {
  body: string | Uint8Array;
  timestamp: string | null;
  signature: string | null;
  publicKey: string;
  now?: number;
  maxAgeMs?: number;
}): boolean {
  const { timestamp, signature } = options;
  if (!timestamp || !signature || !/^\d{13}$/.test(timestamp)) return false;
  const maxAge = options.maxAgeMs ?? 300_000;
  if (!Number.isFinite(maxAge) || maxAge < 0) return false;
  if (Math.abs((options.now ?? Date.now()) - Number(timestamp)) > maxAge)
    return false;
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
  try {
    const key = createPublicKey(options.publicKey);
    if (key.asymmetricKeyType !== "ed25519") return false;
    const body =
      typeof options.body === "string"
        ? Buffer.from(options.body, "utf8")
        : Buffer.from(options.body);
    return verify(
      null,
      Buffer.concat([Buffer.from(`${timestamp}.`), body]),
      key,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

/**
 * Serialize delivery handling in this process and mark IDs only after success.
 * A shared durable store and transactional side effects are required for
 * deduplication across multiple worker processes.
 */
export function createWebhookHandler(options: {
  publicKey: string;
  eventStore: EventStore;
  onEvent(event: BotEvent): void | Promise<void>;
  maxBodyBytes?: number;
}): (request: Request) => Promise<Response> {
  let queue: Promise<void> = Promise.resolve();
  return async (request) => {
    if (request.method !== "POST")
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "POST" },
      });
    const limit = options.maxBodyBytes ?? 262_144;
    if (!request.body) return new Response("Invalid payload", { status: 400 });
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > limit) {
          await reader.cancel();
          return new Response("Payload too large", { status: 413 });
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks);
    if (
      !verifyWebhookSignature({
        body,
        timestamp: request.headers.get("X-Kyro-Timestamp"),
        signature: request.headers.get("X-Kyro-Signature"),
        publicKey: options.publicKey,
      })
    ) {
      return new Response("Invalid signature", { status: 401 });
    }
    let event: BotEvent;
    try {
      event = JSON.parse(body.toString("utf8")) as BotEvent;
      if (
        !event ||
        typeof event.id !== "string" ||
        !event.id ||
        typeof event.type !== "string" ||
        !Number.isFinite(event.createdAt)
      ) {
        return new Response("Invalid event", { status: 400 });
      }
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const handled = queue.then(async () => {
      if (await options.eventStore.has(event.id)) return;
      await options.onEvent(event);
      await options.eventStore.mark(event.id);
    });
    queue = handled.catch(() => undefined);
    try {
      await handled;
      return new Response(null, { status: 204 });
    } catch {
      return new Response("Delivery failed", { status: 503 });
    }
  };
}
