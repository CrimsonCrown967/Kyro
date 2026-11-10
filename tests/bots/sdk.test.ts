import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  KyroClient,
  KyroAPIError,
  createWebhookHandler,
  verifyWebhookSignature,
} from "../../packages/kyro.js/src/index.ts";
import type {
  BotEvent,
  MessageData,
} from "../../packages/kyro.js/src/types.ts";

const token = `kyro_bot_${"a".repeat(64)}`;
const apiBase = "https://test.convex.site/bot-api/v1";
const message: MessageData = {
  id: "message-1",
  channelId: "channel-1",
  serverId: "server-1",
  content: "!ping",
  author: { id: "user-1", username: "member", bot: false },
  createdAt: Date.now(),
};
const json = (data: unknown) => Response.json({ data });

test("SDK rejects insecure remote URLs and invalid credentials without echoing them", () => {
  assert.throws(
    () => new KyroClient({ token: "secret" }),
    /valid Kyro bot token/,
  );
  assert.throws(
    () => new KyroClient({ token, apiBase: "http://remote.test/bot-api/v1" }),
    /HTTPS/,
  );
  assert.throws(
    () => new KyroClient({ token, apiBase: "https://user:pass@example.test" }),
    /credentials/,
  );
});

test("message wrappers authenticate, encode IDs and preserve idempotency keys", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = new KyroClient({
    token,
    apiBase,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return json(message);
    },
  });
  const first = await client.sendMessage("channel/one", {
    content: "hello",
    clientId: "stable-key",
  });
  await first.reply({ content: "response", clientId: "reply-key" });
  assert.equal(requests[0].url, `${apiBase}/channels/channel%2Fone/messages`);
  assert.equal(
    new Headers(requests[0].init.headers).get("authorization"),
    `Bot ${token}`,
  );
  assert.equal(requests[0].init.redirect, "error");
  assert.deepEqual(JSON.parse(String(requests[1].init.body)), {
    content: "response",
    replyToId: message.id,
    clientId: "reply-key",
  });
  assert.equal(JSON.stringify(client).includes(token), false);
});

test("API errors retain status and error codes while hiding credentials", async () => {
  const client = new KyroClient({
    token,
    apiBase,
    fetch: async () =>
      Response.json(
        { error: { code: "FORBIDDEN", message: `Denied ${token}` } },
        { status: 403 },
      ),
  });
  await assert.rejects(client.getServer("server"), (error: unknown) => {
    assert.ok(error instanceof KyroAPIError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.message.includes(token), false);
    return true;
  });
});

test("network-failed writes are never automatically retried", async () => {
  let calls = 0;
  const client = new KyroClient({
    token,
    apiBase,
    fetch: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  await assert.rejects(
    client.sendMessage("channel", "message"),
    (error: unknown) =>
      error instanceof KyroAPIError && error.code === "NETWORK_ERROR",
  );
  assert.equal(calls, 1);
});

test("events acknowledge only after awaited handlers and deduplicate repeated delivery", async () => {
  const sequence: string[] = [];
  let ackCount = 0;
  let pollCount = 0;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const event: BotEvent<MessageData> = {
    id: "event-1",
    type: "messageCreate",
    createdAt: Date.now(),
    data: message,
  };
  const client = new KyroClient({
    token,
    apiBase,
    pollIntervalMs: 1000,
    fetch: async (url) => {
      const path = String(url).replace(apiBase, "");
      if (path === "/users/@me")
        return json({
          id: "bot-1",
          applicationId: "app-1",
          username: "my-bot",
        });
      if (path === "/gateway/heartbeat") return json({ online: true });
      if (path.startsWith("/events?")) {
        pollCount += 1;
        return json({ events: [event], hasMore: false });
      }
      if (path === "/events/ack") {
        ackCount += 1;
        sequence.push("ack");
        if (ackCount === 2) resolveDone();
        return json({ acknowledged: 1 });
      }
      throw new Error(`Unexpected endpoint ${path}`);
    },
  });
  client.on("messageCreate", async (received) => {
    assert.equal(received.content, "!ping");
    sequence.push("start");
    await new Promise((resolve) => setTimeout(resolve, 15));
    sequence.push("finish");
  });
  await client.login();
  try {
    await done;
  } finally {
    await client.destroy();
  }
  assert.equal(pollCount, 2);
  assert.deepEqual(sequence, ["start", "finish", "ack", "ack"]);
});

const signing = generateKeyPairSync("ed25519");
const publicKey = signing.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const signed = (body: string, timestamp = String(Date.now())) => ({
  body,
  timestamp,
  signature: sign(
    null,
    Buffer.from(`${timestamp}.${body}`),
    signing.privateKey,
  ).toString("base64"),
  publicKey,
});

test("webhook signatures reject stale, future, modified and malformed deliveries", () => {
  const valid = signed('{"id":"one"}');
  assert.equal(verifyWebhookSignature(valid), true);
  assert.equal(
    verifyWebhookSignature({ ...valid, body: '{"id":"two"}' }),
    false,
  );
  assert.equal(
    verifyWebhookSignature({
      ...valid,
      now: Number(valid.timestamp) + 300_001,
    }),
    false,
  );
  assert.equal(
    verifyWebhookSignature({
      ...valid,
      now: Number(valid.timestamp) - 300_001,
    }),
    false,
  );
  assert.equal(verifyWebhookSignature({ ...valid, signature: "bad" }), false);
  assert.equal(verifyWebhookSignature({ ...valid, publicKey: "bad" }), false);
});

test("webhook handler deduplicates concurrent deliveries and retries failed processing", async () => {
  const ids = new Set<string>();
  let attempts = 0;
  const handler = createWebhookHandler({
    publicKey,
    eventStore: {
      has: (id) => ids.has(id),
      mark: (id) => {
        ids.add(id);
      },
    },
    onEvent: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary database failure");
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
  });
  const envelope = signed(
    JSON.stringify({
      id: "event-1",
      type: "messageCreate",
      createdAt: Date.now(),
      data: message,
    }),
  );
  const request = () =>
    new Request("https://bot.test/events", {
      method: "POST",
      body: envelope.body,
      headers: {
        "X-Kyro-Timestamp": envelope.timestamp,
        "X-Kyro-Signature": envelope.signature,
      },
    });
  assert.equal((await handler(request())).status, 503);
  assert.equal(ids.has("event-1"), false);
  const results = await Promise.all([handler(request()), handler(request())]);
  assert.deepEqual(
    results.map((response) => response.status),
    [204, 204],
  );
  assert.equal(attempts, 2);
});
