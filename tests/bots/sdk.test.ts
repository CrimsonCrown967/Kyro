import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  KyroClient,
  KyroApiError,
  verifyWebhook,
} from "../../sdk/kyro.js/dist/index.js";
import {
  webhookSignature,
  webhookPublicKey,
  publicIPv4,
  deliverWebhook,
} from "../../server/bots/webhook";
const token = `kyro_bot_${"a".repeat(64)}`;
const ok = (data: unknown) => Response.json({ ok: true, data });
afterEach(() => vi.restoreAllMocks());
describe("external bot SDK and webhook security", () => {
  it("authenticates requests and exposes structured errors without retrying writes", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Wait" } },
        { status: 429, headers: { "Retry-After": "12" } },
      ),
    );
    const client = new KyroClient({ token, fetch: transport });
    await expect(client.sendMessage("channel", "hello")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      retryAfter: 12,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Bot ${token}`,
    });
    await client.destroy();
  });
  it("dispatches real polling handlers, retries failed handlers and acknowledges after success", async () => {
    const event = {
      id: "event",
      type: "messageCreate",
      serverId: "server",
      channelId: "channel",
      timestamp: Date.now(),
      data: {
        id: "message",
        channelId: "channel",
        content: "!ping",
        embeds: [],
        attachments: [],
        author: { id: "human", bot: false, name: "Human", username: "human" },
        createdAt: Date.now(),
        editedAt: null,
        replyToId: null,
      },
    };
    let acknowledged = false;
    let attempts = 0;
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/me"))
        return ok({
          id: "bot",
          applicationId: "app",
          name: "Bot",
          username: "bot",
          verified: false,
        });
      if (path.endsWith("/events/ack")) {
        assertHandlerSucceeded();
        acknowledged = true;
        return ok({ acknowledged: 1 });
      }
      if (path.endsWith("/events"))
        return ok({ events: acknowledged ? [] : [event] });
      if (path.endsWith("/messages")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          content: "Pong",
          replyToId: "message",
        });
        return ok({ ...event.data, id: "reply", content: "Pong" });
      }
      throw new Error("Unexpected path");
    });
    const assertHandlerSucceeded = () => expect(attempts).toBe(2);
    const client = new KyroClient({
      token,
      fetch: transport,
      pollIntervalMs: 2000,
    });
    client.on("messageCreate", async (message) => {
      attempts++;
      if (attempts === 1) throw new Error("Transient handler failure");
      await message.reply("Pong");
    });
    try {
      await client.login();
      await vi.waitFor(() => expect(acknowledged).toBe(true), {
        timeout: 8000,
        interval: 50,
      });
      expect(attempts).toBe(2);
    } finally {
      await client.destroy();
    }
  });
  it("recovers from a throwing ready handler", async () => {
    const transport = vi.fn<typeof fetch>(async (url) =>
      ok(String(url).endsWith("/me") ? { id: "bot" } : { events: [] }),
    );
    const client = new KyroClient({ token, fetch: transport });
    const fail = () => {
      throw new Error("ready failure");
    };
    client.on("ready", fail);
    await expect(client.login()).rejects.toThrow("ready failure");
    client.off("ready", fail);
    await client.login();
    await client.destroy();
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/me")),
    ).toHaveLength(2);
  });
  it("rejects unsafe API URLs and preserves API error types", () => {
    expect(
      () => new KyroClient({ token, baseUrl: "http://example.com" }),
    ).toThrow(/HTTPS/);
    expect(
      new KyroApiError(403, "MISSING_PERMISSION", "Denied"),
    ).toBeInstanceOf(Error);
  });
  it("verifies exact signed bodies and rejects tampering, wrong keys and stale timestamps", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const encoded = privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64");
    const key = webhookPublicKey(encoded);
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const body = JSON.stringify({ id: "event", data: { message: "hello" } });
    const signature = webhookSignature(encoded, timestamp, body);
    expect(verifyWebhook(body, signature, timestamp, key, now)).toBe(true);
    expect(verifyWebhook(body + " ", signature, timestamp, key, now)).toBe(
      false,
    );
    expect(verifyWebhook(body, signature, timestamp, key, now + 301000)).toBe(
      false,
    );
    expect(verifyWebhook(body, signature, timestamp, "invalid key", now)).toBe(
      false,
    );
  });
  it("blocks private addresses, unsupported protocols and loopback webhook destinations", async () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "::1",
    ])
      expect(publicIPv4(address)).toBe(false);
    expect(publicIPv4("8.8.8.8")).toBe(true);
    await expect(
      deliverWebhook("http://example.com", "{}", "s", "1", "e"),
    ).rejects.toThrow("UNSAFE_WEBHOOK_URL");
    await expect(
      deliverWebhook("https://127.0.0.1", "{}", "s", "1", "e"),
    ).rejects.toThrow("UNSAFE_WEBHOOK_ADDRESS");
  });
});
