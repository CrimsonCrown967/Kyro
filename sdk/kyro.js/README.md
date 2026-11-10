# kyro.js

TypeScript SDK for externally hosted Kyro bots. This package is distributed from the KyroFree repository; **it is not published to npm**.

Requires Node.js 20.19+ and ES modules. Build from the repository root with `npm ci` and `npm run build:sdk`, then run `npm install /absolute/path/to/KyroFree/sdk/kyro.js` in your bot project. Root dependencies supply the build toolchain; this SDK has no runtime package dependencies.

```ts
import { KyroClient } from "kyro.js";

const client = new KyroClient({ token: process.env.KYRO_BOT_TOKEN });
client.on("ready", () => console.log("Bot is online!"));
client.on("messageCreate", async (message) => {
  if (!message.author.bot && message.content === "!ping") {
    await message.reply({ content: "Pong!", nonce: `pong:${message.id}` });
  }
});
client.on("error", (error) => console.error(error.message));
await client.login();
```

Create the application in Kyro's Developer portal, save its one-time token in your host's secret environment, enable `messageCreate` under Webhooks & Events, select polling, and install it with View Channels, Read Message History and Send Messages.

## Client

`new KyroClient({token, baseUrl?, pollIntervalMs?, fetch?})` defaults to `https://kyro-chat.cyou/api/bots/v1` and polls every 2500 ms (minimum 2000 ms). Local testing can use `baseUrl: "http://127.0.0.1:3211/api/bots/v1"`. Non-local connections require HTTPS.

`login()` authenticates, emits `ready`, and starts the event loop; it returns the bot identity. `destroy()` stops polling and aborts requests. `on()` / `off()` manage typed async handlers. A failing event handler is not acknowledged; the backend redelivers after its lease. A revoked/disabled bot stops the loop. Start the bot only after changing delivery mode to polling.

Available events: `ready`, `error`, `event` (full envelope), `messageCreate`, `messageUpdate`, `messageDelete`, `memberJoin`, `memberLeave`, `memberUpdate`, `serverCreate`, `serverUpdate`, `channelCreate`, `channelDelete`, `roleCreate`, `roleUpdate`, `interactionCreate`.

## API helpers

- Messages: `sendMessage`, `editMessage`, `deleteMessage`, `messages`, `addReaction`, `createPoll`, `upload`. `KyroMessage` adds `reply`, `edit`, `delete`, `react`.
- Communities: `servers`, `server`, `channels`, `channel`, `member`, `editServer`, `createChannel`, `editChannel`, `deleteChannel`.
- Roles/moderation: `roles`, `createRole`, `editRole`, `deleteRole`, `assignRole`, `removeRole`, `kick`, `ban`.
- Commands: `registerCommand`, `deleteCommand`, `respond`. `KyroInteraction` exposes ID, name, user/server/channel IDs, typed options and `reply(content,{ephemeral?})`.
- `request<T>(method,path,body?)` supports the full REST contract. It throws `KyroApiError` with `status`, `code`, `retryAfter` and a safe server message.

HTTP writes are not automatically retried. Honor 429 delays and use message nonces for operations you repeat. Event delivery is at least once: the SDK's processed-ID cache is in memory; persist deduplication records when work must survive restarts. Do not log credentials or whole request options.

## Slash commands

```ts
await client.registerCommand({
  name: "greet",
  description: "Greet a member",
  options: [
    { name: "user", description: "Who to greet", type: "user", required: true },
  ],
});
client.on("interactionCreate", async (interaction) => {
  if (interaction.name === "greet") {
    await interaction.reply(`Hello, member ${interaction.options.user}!`, {
      ephemeral: true,
    });
  }
});
```

An optional `serverId` creates a server override; absent means global. The composer uses `/bot_username:command`, displays typed options and static choices, and enforces required member permissions. Respond once within 15 minutes.

## Webhooks

`verifyWebhook(rawBody, signature, timestamp, pinnedPublicKey)` verifies Ed25519 signatures and a five-minute timestamp window. Fetch/pin the platform key from `/webhook-key`. Verify raw bytes before parsing; store event IDs durably to reject replays. `client.handleEvent(verifiedEnvelope)` dispatches to the same handlers without starting polling.

See [the webhook example](examples/webhook.ts), [ping example](examples/ping.ts), and [complete API/setup guide](../../docs/bot-platform.md) for permissions, payloads, endpoint responses, deployment configuration, limits and retry semantics.
