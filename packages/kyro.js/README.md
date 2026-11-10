# kyro.js

The TypeScript SDK for bots hosted on your own Node.js server. Requires Node.js
20.3 or later (22+ recommended). This package is included in the Kyro repository; it is **not
published to npm**.

Build and install from a checkout:

```sh
npm install
npm run build:sdk
# From your bot project:
npm install /path/to/Kyro/packages/kyro.js
```

Create an application in Kyro's `/developers` portal, generate its credential,
subscribe to `messageCreate` and `interactionCreate`, and install the bot in a
server. Copy the API URL shown in the portal. Keep credentials in your bot
host's secret environment, never in browser code or a repository:

```sh
KYRO_BOT_TOKEN=kyro_bot_...
KYRO_BOT_API_URL=https://your-deployment.convex.site/bot-api/v1
```

```ts
import { KyroClient } from "kyro.js";

const client = new KyroClient({ token: process.env.KYRO_BOT_TOKEN });

client.on("ready", (bot) => console.log(`${bot.username} is online`));
client.on("error", (error) => console.error(error.message));
client.on("messageCreate", async (message) => {
  if (!message.author.bot && message.content === "!ping") {
    // Stable key makes a retried event safe to process more than once.
    await message.reply({ content: "Pong!", clientId: `ping:${message.id}` });
  }
});
client.on("interactionCreate", async (interaction) => {
  if (interaction.commandName === "ping") {
    await interaction.reply({ content: "Pong!", ephemeral: true });
  }
});

await client.registerCommands([
  { name: "ping", description: "Check the bot connection" },
]);
await client.login();
process.once("SIGTERM", () => { void client.destroy(); });
process.once("SIGINT", () => { void client.destroy(); });
```

`login()` authenticates, updates bot presence and starts event polling. `ready`
runs once after authentication, and asynchronous handlers are awaited before
events are acknowledged. `destroy()` aborts requests and stops the polling
loop; online presence then expires on the server.

`registerCommands(commands, serverId?)` replaces commands in the given scope.
Omit the server ID for global commands. Passing `[]` clears the scope. Options
support string, integer, boolean and user types, required arguments and static
choices. Commands with the same name may exist in different applications;
Kyro's command selector identifies their bot.

Available wrappers include `sendMessage`, `editMessage`, `deleteMessage`,
`getMessages`, `getMessage`, `uploadAttachment`, `getServer`, `getChannel`, `getChannels`, `createChannel`, `deleteChannel`,
`getMember`, `createRole`, `updateRole`, `setMemberRoles`, `kickMember`,
`banMember`, `addReaction`, `createPoll`, `registerCommands`, `getCommands`,
`respondToInteraction`, and `getGateway`. `Message` provides `reply`, `edit`,
`delete` and `react`; `Interaction` provides `reply`.

API errors are `KyroAPIError` instances with `status`, `code`, `message` and
optional `retryAfter` seconds. The client retries rejected rate-limited
requests up to twice, never blindly retries a network-failed write, and
stops polling when credentials are revoked. Configure `maxRateLimitRetries`,
`requestTimeoutMs`, and `pollIntervalMs` in the constructor if needed.

Event delivery is at least once. The default store deduplicates the last
10,000 successfully handled events in memory. Provide an `eventStore` with
`has(id)` and `mark(id)` backed by your database for restart durability.
Apply side effects and record the event ID in the same transaction when
possible. For sends, persist and reuse `clientId` to make retries idempotent.
One process should poll each application. Multiple replicas require an
external leader/lease and shared durable event store.

Webhook integrations can use `verifyWebhookSignature` on the exact unparsed
request bytes, or `createWebhookHandler({ publicKey, eventStore, onEvent })`
with a Web Standard `Request`. Pin the public key obtained through the
authenticated `getGateway()` endpoint. Signatures use Ed25519 over
`timestamp + "." + rawBody`, with a five-minute timestamp tolerance.
Do not use timestamps alone for replay prevention: retain event IDs in your
durable store. The handler returns 204 after successful processing (including
already processed IDs), 401 for invalid signatures and 503 on handler failures
so Kyro can retry. Never acknowledge before durable processing has finished.

See [the complete Bot API documentation](../../docs/bot-platform.md) and
[working ping example](examples/ping.ts).
