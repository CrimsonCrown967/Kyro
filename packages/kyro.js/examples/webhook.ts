import { createServer } from "node:http";
import { Readable } from "node:stream";
import { KyroClient, createWebhookHandler } from "../src/index.js";

const client = new KyroClient({ token: process.env.KYRO_BOT_TOKEN });
const publicKey = process.env.KYRO_WEBHOOK_PUBLIC_KEY;
if (!publicKey)
  throw new Error(
    "Pin KYRO_WEBHOOK_PUBLIC_KEY from client.getGateway() before accepting webhooks.",
  );
// Demonstration only: replace this store with your database for restart durability.
const processed = new Set<string>();
const handle = createWebhookHandler({
  publicKey,
  eventStore: {
    has: (id) => processed.has(id),
    mark: (id) => {
      processed.add(id);
    },
  },
  onEvent: async (event) => {
    if (event.type !== "interactionCreate") return;
    const interaction = event.data as { id: string; commandName: string };
    if (interaction.commandName === "ping")
      await client.respondToInteraction(interaction.id, {
        content: "Pong!",
        ephemeral: true,
      });
  },
});

// Run behind your own public HTTPS reverse proxy. Do not call login() in webhook mode.
createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value)
        headers.set(key, Array.isArray(value) ? value.join(",") : value);
    }
    const response = await handle(
      new Request("http://localhost/events", {
        method: incoming.method,
        headers,
        ...(incoming.method === "POST"
          ? {
              body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
              duplex: "half",
            }
          : {}),
      }),
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end("Request failed");
  }
}).listen(8080, "127.0.0.1");
