import { CopyValue, developerPanel } from "./DeveloperShared";
import fullReference from "../../../docs/bot-platform.md?raw";
import { BOT_API_BASE } from "@/lib/backend";

export const BOT_API_ENDPOINTS = [
  ["GET", "/users/@me", "Bot identity"],
  ["GET", "/gateway", "Event types and webhook public key"],
  ["POST", "/gateway/heartbeat", "Update bot presence"],
  ["GET", "/events?limit=50", "Read unacknowledged events"],
  ["POST", "/events/ack", "Acknowledge eventIds after processing"],
  [
    "GET, PUT",
    "/applications/@me/commands",
    "List or replace commands; optional serverId scope",
  ],
  [
    "POST",
    "/interactions/:id/responses",
    "Respond once with content, embeds, optional ephemeral",
  ],
  ["GET", "/servers/:id", "Server information"],
  [
    "GET, POST",
    "/servers/:id/channels",
    "Visible channels or create a text channel",
  ],
  ["GET, DELETE", "/channels/:id", "Channel information or delete channel"],
  [
    "GET, POST",
    "/channels/:id/messages",
    "Read history or send content, embeds and attachments",
  ],
  [
    "GET, PATCH, DELETE",
    "/channels/:id/messages/:messageId",
    "Read, edit own message, or delete a message",
  ],
  [
    "POST",
    "/channels/:id/messages/:messageId/reactions",
    "Add an emoji reaction",
  ],
  [
    "POST",
    "/channels/:id/attachments",
    "Upload binary data with Content-Type and X-Filename",
  ],
  [
    "POST",
    "/channels/:id/polls",
    "Create question and options, optional multiple/durationMinutes",
  ],
  [
    "GET, DELETE",
    "/servers/:id/members/:userId",
    "Read member or kick a lower-ranked member",
  ],
  [
    "PUT",
    "/servers/:id/bans/:userId",
    "Ban a lower-ranked member; optional reason",
  ],
  [
    "POST",
    "/servers/:id/roles",
    "Create role with name, permissions and optional color",
  ],
  ["PATCH", "/servers/:id/roles/:roleId", "Update a lower-ranked role"],
  [
    "PUT",
    "/servers/:id/members/:userId/roles",
    "Set roleIds for a lower-ranked member",
  ],
] as const;

export function BotApiDocs() {
  const base = BOT_API_BASE;
  const example = `import { KyroClient } from "kyro.js";\n\nconst client = new KyroClient({\n  token: process.env.KYRO_BOT_TOKEN,\n  apiBase: process.env.KYRO_BOT_API_URL\n});\nclient.on("ready", () => console.log("Bot is online!"));\nclient.on("messageCreate", async message => {\n  if (!message.author.bot && message.content === "!ping")\n    await message.reply("Pong!");\n});\nclient.on("interactionCreate", async interaction => {\n  if (interaction.commandName === "ping")\n    await interaction.reply({ content: "Pong!", ephemeral: true });\n});\nawait client.registerCommands([{ name: "ping", description: "Check latency" }]);\nawait client.login();`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kyro Bot API</h1>
        <p className="mt-3 text-sm leading-6 text-[#A0A6B5]">
          Host your bot on your own Node.js server. Kyro provides authenticated
          APIs, persistent commands, and events.
        </p>
      </div>
      <section className={developerPanel}>
        <h2 className="font-semibold">Connect</h2>
        <a
          className="mt-3 inline-block text-sm text-[#B8BEFF] underline underline-offset-4"
          href={`data:text/markdown;charset=utf-8,${encodeURIComponent(fullReference)}`}
          download="kyro-bot-api.md"
        >
          Download complete API reference and deployment guide
        </a>
        <div className="my-4 flex flex-wrap items-center gap-2">
          <code className="break-all text-xs text-[#B8BEFF]">{base}</code>
          <CopyValue value={base} />
        </div>
        <p className="text-sm leading-6 text-[#A0A6B5]">
          Send <code>Authorization: Bot &lt;token&gt;</code> on every request.
          JSON bodies use <code>Content-Type: application/json</code>.
          Successful responses contain <code>{'{"data": ...}'}</code>; errors
          contain{" "}
          <code>{'{"error":{"code":"FORBIDDEN","message":"..."}}'}</code>.
        </p>
      </section>
      <section className={developerPanel}>
        <h2 className="font-semibold">TypeScript quick start</h2>
        <p className="mt-2 text-sm text-[#A0A6B5]">
          The SDK source is included in KyroFree at packages/kyro.js. Build it
          and install the local package. It has not been published to npm.
          Node.js 22 or newer is recommended.
        </p>
        <pre className="my-4 overflow-auto rounded-lg bg-[#111318] p-4 text-xs leading-6">
          npm run build --prefix packages/kyro.js{"\n"}npm install
          /path/to/KyroFree/packages/kyro.js
        </pre>
        <pre className="overflow-auto rounded-lg bg-[#111318] p-4 text-xs leading-6 text-[#B8BEFF]">
          {example}
        </pre>
      </section>
      <section className={developerPanel}>
        <h2 className="mb-4 font-semibold">Endpoints</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#A0A6B5]">
                <th className="p-2">Method</th>
                <th className="p-2">Path</th>
                <th className="p-2">Behavior</th>
              </tr>
            </thead>
            <tbody>
              {BOT_API_ENDPOINTS.map(([method, path, description]) => (
                <tr key={path} className="border-t border-white/10">
                  <td className="whitespace-nowrap p-2 text-[#B8BEFF]">
                    {method}
                  </td>
                  <td className="p-2 font-mono">{path}</td>
                  <td className="p-2 text-[#A0A6B5]">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={developerPanel}>
        <h2 className="font-semibold">Permissions and limits</h2>
        <p className="mt-3 text-sm leading-7 text-[#A0A6B5]">
          120 API requests per minute per bot; 5 messages per 5 seconds per
          channel; 10 uploads per minute. Honor HTTP 429 and Retry-After.
          Message text is limited to 2,000 characters; JSON bodies to 64 KiB.
          Channel overrides, role hierarchy, timeouts, bans, AutoMod, and
          server-approved permissions are enforced on every request.
          Administrator is unavailable to bots.
        </p>
        <h3 className="mt-5 font-medium">Errors</h3>
        <p className="mt-2 text-sm leading-7 text-[#A0A6B5]">
          400 INVALID_REQUEST · 401 UNAUTHORIZED · 403 FORBIDDEN · 404 NOT_FOUND
          · 409 CONFLICT · 410 EXPIRED · 413 PAYLOAD_TOO_LARGE · 422
          AUTOMOD_BLOCKED · 429 RATE_LIMITED · 500 INTERNAL_ERROR.
        </p>
      </section>
      <section className={developerPanel}>
        <h2 className="font-semibold">Commands and events</h2>
        <p className="mt-3 text-sm leading-7 text-[#A0A6B5]">
          Register up to 100 commands per scope. Server commands override global
          commands with the same name. Arguments support string, integer,
          boolean and server users, with optional choices. Respond within 15
          minutes. Ephemeral responses are readable only by the invoking user.
        </p>
        <p className="mt-3 text-sm leading-7 text-[#A0A6B5]">
          Events include an ID, timestamp, type, serverId, optional channelId,
          and data. Poll and acknowledge after durable processing, or configure
          an HTTPS webhook. Verify Ed25519 signatures over timestamp + "." +
          exact body bytes, accept timestamps within 5 minutes, and deduplicate
          IDs in durable storage. Pin your application's public key from GET
          /gateway. Deliveries expire after 7 days; webhook failures retry up to
          8 times with exponential backoff. Use one event transport per
          application. The SDK's default deduplication lasts only for its
          current process.
        </p>
        <p className="mt-3 text-sm leading-7 text-[#A0A6B5]">
          Complete request and response schemas, deployment settings, and
          operational limits are documented in docs/bot-platform.md in the
          repository.
        </p>
      </section>
    </div>
  );
}
