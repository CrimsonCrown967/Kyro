import { createServer } from "node:http";
import { KyroClient, verifyWebhook, type BotEvent } from "../src/index.js";

// Expose this process behind your HTTPS reverse proxy. Pin the platform public
// key from GET /api/bots/v1/webhook-key in the host's environment.
const client = new KyroClient({ token: process.env.KYRO_BOT_TOKEN });
const publicKey = process.env.KYRO_WEBHOOK_PUBLIC_KEY;
if (!publicKey) throw new Error("KYRO_WEBHOOK_PUBLIC_KEY is required");
const completed = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
// This runnable example deduplicates within one process. Replace these maps
// with a durable job/idempotency store before running multiple instances.
client.on("messageCreate", async (message) => {
  if (!message.author.bot && message.content === "!ping")
    await message.reply({ content: "Pong!", nonce: `pong:${message.id}` });
});
client.on("interactionCreate", async (interaction) => {
  if (interaction.name === "ping")
    await interaction.reply("Pong!", { ephemeral: true });
});
createServer(async (request, response) => {
  const finish = (status: number) => {
    response.writeHead(status);
    response.end();
  };
  if (request.method !== "POST" || request.url !== "/events")
    return finish(404);
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 65536) return finish(413);
      chunks.push(buffer);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const signature = String(request.headers["x-kyro-signature"] ?? "");
    const timestamp = String(request.headers["x-kyro-timestamp"] ?? "");
    if (!verifyWebhook(body, signature, timestamp, publicKey))
      return finish(401);
    const event = JSON.parse(body) as BotEvent;
    if (!event.id || event.id !== request.headers["x-kyro-event-id"])
      return finish(400);
    if (completed.has(event.id)) return finish(204);
    let work = inFlight.get(event.id);
    if (!work) {
      work = client.handleEvent(event);
      inFlight.set(event.id, work);
    }
    try {
      await work;
      completed.add(event.id);
      if (completed.size > 10000)
        completed.delete(completed.values().next().value!);
    } finally {
      inFlight.delete(event.id);
    }
    finish(204);
  } catch {
    finish(500);
  }
}).listen(Number(process.env.PORT ?? 8080), "127.0.0.1");
