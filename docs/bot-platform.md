# Kyro Bot Developer Platform

Kyro users can create a bot application, install it in a server they manage, and run its code on an external Node.js host. The platform persists applications, commands, permissions, events and audits in Convex. The official TypeScript SDK lives at [`sdk/kyro.js`](../sdk/kyro.js); it is distributed from this repository and is **not published to npm**.

## Quick start

1. Open **Developer portal** in Kyro's navigation (`/dashboard/developers`). Create an application with a unique bot username. Save the token displayed once in the dialog.
2. Choose default permissions and, under **Webhooks & Events**, subscribe to the events your bot uses. `interactionCreate` is always included. Select SDK polling for the example below.
3. Open **Installation**, follow the invite link, choose your server, review the requested permissions, and authorize. Manage Community permission is required, and the installer cannot delegate capabilities they do not hold.
4. Build the SDK from the repository and install the local package into your external project:

```sh
# In the KyroFree checkout
npm ci
npm run build:sdk

# In a separate Node.js project
npm install /absolute/path/to/KyroFree/sdk/kyro.js
```

Use Node 20.19+ and ES modules. Configure `KYRO_BOT_TOKEN` in your host's secret environment. Subscribe to `messageCreate` for text triggers and grant View Channels, Read Message History and Send Messages.

```ts
import { KyroClient } from "kyro.js";

const client = new KyroClient({ token: process.env.KYRO_BOT_TOKEN });
client.on("ready", async () => {
  console.log("Bot is online!");
  await client.registerCommand({ name: "ping", description: "Check the bot" });
});
client.on("messageCreate", async (message) => {
  if (!message.author.bot && message.content === "!ping") {
    await message.reply({ content: "Pong!", nonce: `pong:${message.id}` });
  }
});
client.on("interactionCreate", async (interaction) => {
  if (interaction.name === "ping") {
    await interaction.reply("Pong!", { ephemeral: true });
  }
});
client.on("error", (error) => console.error(error.message));
await client.login();
```

The UI presents the command as `/your_bot_username:ping`. It preserves the existing built-in/canned server commands and avoids collisions between installed applications.

## Identity and token lifecycle

An application has an application ID, human owner ID and bot user ID. The bot is an ordinary server member marked with `botApplicationId`, has a dedicated profile and avatar, and cannot log in with a password. Application icons/banners are separate from the bot avatar.

The portal generates 32 random bytes using the browser CSPRNG and creates `kyro_bot_` followed by 64 hexadecimal characters. Only the SHA-256 digest is transmitted to the application mutation and stored. Application/profile/list responses never return a token or its digest. The original token exists only in the creation/rotation dialog and the developer's host.

Rotation replaces the digest immediately; revocation removes it. Disabling, suspension, deleting the application, deleting its owner, or a site ban blocks API authentication. A request already being processed can finish; subsequent authentication uses the current digest/status. Presence is based on recent authenticated requests, not a manually invented connection count.

**OAuth2 & Authorization** is an installation-consent section. Kyro's existing signed-in account authorizes a server grant. This feature does not implement authorization-code exchange, third-party user login, client secrets, or OAuth access to a human account.

## Permissions and server integration

Supported permission strings:

```text
view_channel          send_messages          read_message_history
manage_messages       manage_channels        manage_roles
kick_members          ban_members            manage_server
mention_everyone      add_reactions          upload_attachments
use_external_emojis   create_polls
```

The default request is `view_channel`, `send_messages`, `read_message_history`. Installation creates a dedicated role and server membership. Effective permissions are the intersection of the installation grant, current server-role permissions, and channel overrides. Administrator cannot bypass channel denies for a bot. Changing application defaults does not increase an existing grant.

Server settings → Bots lists installed applications and permits grant edits/removal. Removing or kicking the bot invalidates membership and cleans its installation. Server role ordering still applies: move the bot's role above roles/members it should manage. Bots cannot manage the server owner, themselves, equal/higher roles, managed bot roles, the default role, or delegate capabilities outside their grant.

Text message and interaction operations respect posting restrictions, timeout, read-only/locked channels, rules-channel access, slow mode, and AutoMod. Reactions/polls additionally require their explicit capability and send permission. External custom emoji require membership in their source server and `use_external_emojis`. Mention notifications check the recipient's channel visibility, mute preference and blocks.

## REST contract

Production base: `https://kyro-chat.cyou/api/bots/v1`. The website proxy forwards to the configured Convex HTTP deployment. Developers can also use `https://<deployment>.convex.site/api/bots/v1`. Local HTTP actions use `http://127.0.0.1:3211/api/bots/v1` by default; Vite alone does not run Vercel's API functions.

Every endpoint except `GET /webhook-key` requires:

```http
Authorization: Bot kyro_bot_<64 hexadecimal characters>
Content-Type: application/json
```

The placeholder above is descriptive, not a usable credential. Do not put real tokens into source files, URLs, screenshots, or logs. IDs are opaque strings, timestamps are Unix milliseconds, optional absent DTO fields generally use `null`, and request bodies reject unknown properties where a contract is defined.

Success: `{"ok":true,"data":...}`. Failure: `{"ok":false,"error":{"code":"MISSING_PERMISSION","message":"..."}}`. POST command/message creation returns 201; other successful operations return 200. Responses use `Cache-Control: no-store`.

### Endpoints

Paths below are relative to the base. All server/channel endpoints require a current installation and relevant visibility.

| Method and path                                           | Input                                                                              | Returned `data` / extra permission                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /me`                                                 | None                                                                               | Bot identity: `id, applicationId, name, username, verified`.                         |
| `GET /servers`                                            | None                                                                               | `{servers:[{id,name,permissions}]}`.                                                 |
| `GET /servers/:serverId`                                  | None                                                                               | `id,name,description,ownerId,permissions`.                                           |
| `PATCH /servers/:serverId`                                | Optional `name` (2–64), `description` (≤1000)                                      | `{id}`; `manage_server`.                                                             |
| `GET /servers/:serverId/channels`                         | None                                                                               | `{channels:[{id,serverId,name,kind,topic}]}`; hidden channels filtered.              |
| `POST /servers/:serverId/channels`                        | `name` (1–64 lowercase letters/digits/underscore/hyphen), optional `topic` (≤1000) | `{id}`; creates a text channel; `manage_channels`.                                   |
| `GET /channels/:channelId`                                | None                                                                               | `id,serverId,name,kind,topic,permissions`.                                           |
| `PATCH /channels/:channelId`                              | Optional `name,topic`, same constraints as creation                                | `{id}`; `manage_channels`.                                                           |
| `DELETE /channels/:channelId`                             | None                                                                               | `{deleted:true}`; `manage_channels`, existing content cleanup.                       |
| `GET /servers/:serverId/members/:userId`                  | None                                                                               | `id,name,username,bot,nickname,roleIds,joinedAt`; no email or credentials.           |
| `DELETE /servers/:serverId/members/:userId`               | None                                                                               | `{removed:true}`; `kick_members`, hierarchy enforced.                                |
| `PUT /servers/:serverId/bans/:userId`                     | `reason` (1–300)                                                                   | `{banned:true}`; `ban_members`, current member/hierarchy required.                   |
| `GET /servers/:serverId/roles`                            | None                                                                               | `{roles:[{id,name,color,permissions,position,isDefault,managed}]}`.                  |
| `POST /servers/:serverId/roles`                           | `name` (1–64), `permissions`, optional hex `color`                                 | `{id}`; `manage_roles`, lower-role/delegation checks.                                |
| `PATCH /servers/:serverId/roles/:roleId`                  | Optional `name,color,permissions`                                                  | `{id}`; `manage_roles`.                                                              |
| `DELETE /servers/:serverId/roles/:roleId`                 | None                                                                               | `{deleted:true}`; `manage_roles`.                                                    |
| `PUT /servers/:serverId/members/:userId/roles/:roleId`    | `{}`                                                                               | `{updated:true}`; assigns a lower role, `manage_roles`.                              |
| `DELETE /servers/:serverId/members/:userId/roles/:roleId` | None                                                                               | `{updated:true}`; removes a lower role, `manage_roles`.                              |
| `POST /channels/:channelId/messages`                      | Message object below                                                               | Message DTO; `send_messages`.                                                        |
| `GET /channels/:channelId/messages`                       | Query `limit` (1–100, default 50), optional `before` timestamp and `cursor`        | `{messages,nextBefore,nextCursor}` newest first; `read_message_history`.             |
| `GET /channels/:channelId/messages/:messageId`            | None                                                                               | Message DTO; `read_message_history`.                                                 |
| `PATCH /channels/:channelId/messages/:messageId`          | Message object, with no replacement attachments                                    | Message DTO; own messages only, replaces content/embeds.                             |
| `DELETE /channels/:channelId/messages/:messageId`         | None                                                                               | `{deleted:true}`; other authors require `manage_messages`.                           |
| `POST /channels/:channelId/messages/:messageId/reactions` | `emoji` (1–64)                                                                     | `{added:true}`; idempotent add, `add_reactions`.                                     |
| `POST /channels/:channelId/messages/:messageId/polls`     | Poll object below                                                                  | `{id}`; own message, `create_polls`, one poll/message.                               |
| `POST /channels/:channelId/uploads`                       | `{}`                                                                               | `{uploadUrl,maximumBytes}`; `upload_attachments`.                                    |
| `POST /channels/:channelId/uploads/register`              | `storageId,name`                                                                   | `{storageId}`; validates metadata and ownership.                                     |
| `GET /commands`                                           | None                                                                               | Command DTO array with `id,serverId,name,description,permissions,options,updatedAt`. |
| `POST /commands`                                          | Command object below                                                               | `{id}`; upsert by application/scope/name.                                            |
| `DELETE /commands/:commandId`                             | None                                                                               | `{deleted:true}`; own commands only.                                                 |
| `POST /interactions/:interactionId/response`              | `content` (1–2000), optional `ephemeral` (default false)                           | `{id,ephemeral,messageId}`; one response, 15-minute expiry.                          |
| `GET /events`                                             | None                                                                               | `{events:[Event]}`; leases up to 25 events in polling mode.                          |
| `POST /events/ack`                                        | `ids` array (1–25)                                                                 | `{acknowledged:number}`; own leased events only.                                     |
| `GET /webhook-key`                                        | No authentication                                                                  | `{configured,key}` where key is the PEM Ed25519 public key; 503 if unavailable.      |

Example message input:

```json
{
  "content": "Release is ready",
  "embeds": [
    {
      "title": "Build complete",
      "description": "All checks passed",
      "url": "https://example.com/build/42",
      "color": "#5865F2",
      "fields": [{ "name": "Version", "value": "1.0" }]
    }
  ],
  "nonce": "release-42"
}
```

Content is ≤2000 characters; up to three embeds and six attachments are allowed. Embeds support title (256), description (2000), HTTPS URL (2000), hex color, and up to ten fields with names (100) and values (1000). Supply `replyToId` to reply within the same channel. The message must have content, an embed, or an attachment. `nonce` is an optional 1–100 character idempotency key scoped to the application and channel; reuse returns the existing message. It is available while that message exists. Edits replace content/embeds and preserve existing attachments.

Message DTO fields: `id,channelId,content,embeds,replyToId,createdAt,editedAt,author,attachments`. `author` is `{id,name,username,bot}`. Attachments contain `{name,size,mimeType,url}`, without exposing storage ownership records. Use `nextCursor` as the next request's `cursor` to page without skipping messages that share a timestamp; keep the other query parameters fixed. `before` is an optional exclusive timestamp filter, and `nextBefore` is retained for clients that use timestamp filtering.

Upload flow: obtain an upload URL, POST the file bytes to it with the actual content type, read `storageId`, register it, then send a message containing `attachmentIds:[storageId]`. Existing upload allowlists, the **10 MiB** cap, ownership and single claim rules apply. The SDK's `upload()` handles the upload/registration steps.

Poll input: `{question,options,multipleChoice?,durationMinutes?}`. Question ≤300 characters, 2–10 nonempty options of ≤100 characters, optional duration 1–10080 minutes. Attach a poll to the bot's own existing message.

Command input:

```json
{
  "name": "greet",
  "description": "Greet a member",
  "permissions": ["send_messages"],
  "options": [
    {
      "name": "user",
      "description": "Who to greet",
      "type": "user",
      "required": true
    },
    {
      "name": "style",
      "description": "Greeting style",
      "type": "string",
      "choices": ["friendly", "formal"]
    },
    { "name": "count", "description": "Repeat count", "type": "integer" },
    { "name": "private", "description": "Reply privately", "type": "boolean" }
  ]
}
```

Omit `serverId` for a global command; supply an installed server ID for an override. Command/option names match `[a-z][a-z0-9_-]{0,31}`, descriptions are 1–100 characters, up to ten uniquely named options and 25 string choices. Integer options must be safe integers; user arguments must identify current server members. Kyro filters the composer by member permissions and provides typed controls/static choices. Dynamic remote autocomplete is not implemented.

Private responses are stored on the interaction and queried only for the invoking user in that channel; they are never regular messages or broadcast message events. The UI shows the latest ten recent responses for up to 15 minutes. A repeated response is a 409; an expired response is a 410. Persist interaction/event IDs when external handlers may restart.

### Errors and limits

| Status    | Typical codes                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400       | `INVALID_REQUEST`, `INVALID_MESSAGE`, `INVALID_COMMAND`, `INVALID_JSON`, `INVALID_UPLOAD`, `INVALID_OPTIONS`                                                                      |
| 401       | `UNAUTHORIZED` (missing, malformed, rotated or revoked credential)                                                                                                                |
| 403       | `MISSING_PERMISSION`, `NOT_INSTALLED`, `ROLE_HIERARCHY`, `CANNOT_DELEGATE`, `NOT_AUTHOR`, `TIMED_OUT`, `CHANNEL_LOCKED`, `AUTOMOD_BLOCKED`, `BOT_UNAVAILABLE`, `REQUEST_REJECTED` |
| 404       | `NOT_FOUND`                                                                                                                                                                       |
| 409       | `ALREADY_RESPONDED`, `POLL_EXISTS`, `UPLOAD_CLAIMED`, `WEBHOOK_MODE`, resource limits                                                                                             |
| 410       | `INTERACTION_EXPIRED`                                                                                                                                                             |
| 413       | `PAYLOAD_TOO_LARGE`                                                                                                                                                               |
| 429       | `RATE_LIMITED`, `SLOW_MODE`; honor `Retry-After` and retry conservatively                                                                                                         |
| 502 / 503 | Proxy/upstream or signing configuration unavailable                                                                                                                               |

API authentication is limited to **120 requests per minute per application**, including reads, polling and failed authorized operations. The authorization counter commits separately from resource mutations. Bots may send **five messages per five seconds**, and channel slow mode applies. JSON bodies are ≤64 KiB. Users may invoke ten commands/minute and submit five bot reports/hour. Limits use the backend clock; do not rely on the UI to enforce them.

Current product caps: 20 applications/owner, 100 installations/application, 100 commands/application. Directory search considers the newest 500 discoverable applications and returns at most 100. Analytics count distinct member IDs from at most 5000 memberships per installed server, so users reached is bounded for very large servers. Mass mentions inspect at most 1000 memberships. These bounds are capacity controls, not claims of unlimited scale.

## Events and signed webhooks

Events are inserted transactionally with source mutations, using stable IDs and timestamps. Subscriptions include `messageCreate`, `messageUpdate`, `messageDelete`, `memberJoin`, `memberLeave`, `memberUpdate`, `serverCreate`, `serverUpdate`, `channelCreate`, `channelDelete`, `roleCreate`, `roleUpdate`, and `interactionCreate`.

- Message create/update data uses the Message DTO; deletion contains IDs only.
- Member data describes membership/role/nickname changes and a public identity snapshot. It is not a global profile-change feed.
- `serverCreate` means the server became available to this bot on installation; subscribe before installing if that initial event is needed.
- Channel deletion contains IDs only to avoid revealing a hidden channel's name.
- Interaction data contains `id,commandId,name,userId,channelId,serverId,options,expiresAt` and is delivered only to the command's application.
- Every envelope is `{id,type,serverId,channelId,timestamp,data}`. Channel visibility, subscription, application status and membership are rechecked before delivery. Message events additionally require read history.

**Delivery is at least once.** Polling leases last 60 seconds. Acknowledge only after successful work; unacknowledged events are retried after the lease. Events expire after seven days, with up to six attempts before a dead status. The SDK caches 10,000 processed event IDs in memory to avoid duplicate callbacks on acknowledgment failures; durable consumers must persist IDs across process restarts. Use message nonces for repeat-safe replies. Ordering is not guaranteed across retries or multiple consumers.

For webhook mode, configure a public HTTPS URL on port 443. The worker runs every minute, attempts up to 25 globally due deliveries per run, uses a 60-second lease, a five-second DNS timeout and a ten-second HTTP timeout, and accepts only 2xx responses. Failed deliveries back off by 1 minute, 5 minutes, 15 minutes, 1 hour and 6 hours. Delivery logs expose status/attempts and safe error codes. Owners can retry dead, unexpired events. Changing modes migrates queued events in bounded background transactions.

DNS resolves and pins a public IPv4 address for each request. Private/link-local/loopback destinations, unsupported schemes, credentials, non-443 ports and redirects are rejected. IPv6-only webhook hosts are not supported by this transport.

Webhook headers:

```text
X-Kyro-Event-Id: <stable event ID>
X-Kyro-Timestamp: <Unix seconds at delivery>
X-Kyro-Signature: <base64 Ed25519 signature>
```

The signed bytes are UTF-8 `timestamp + "." + rawBody`. Retrieve and pin the public key from `GET /webhook-key`; do not trust a key supplied by an incoming webhook. `verifyWebhook(rawBody,signature,timestamp,publicKey)` rejects modified bodies/signatures and timestamps beyond five minutes. Verify before JSON parsing or side effects, compare the header ID to the signed envelope ID, and atomically deduplicate event IDs in your own database. Timestamp checking alone does not prevent a replay within the tolerance window. Return 2xx only after accepting work durably. See the [webhook example](../sdk/kyro.js/examples/webhook.ts).

## Directory, analytics and administration

Only owner-opted-in, active and available bots appear in discovery. Search, category, featured/popular/recent ordering, profiles and installation counts use stored records. Verified/featured status and suspension require platform admin authority. Abuse reports reuse Kyro's existing reports table and staff workflow. Owners can inspect their suspended application; staff can open it and lift suspension.

Analytics record accepted API requests, successful command invocations, installation counts and bounded distinct member reach. Audit logs record application/token/install/command/moderation actions; delivery logs contain no token or raw private key. Application deletion requires typing its name, removes installations and commands, revokes the token, releases profile assets and tombstones the bot identity to preserve old message attribution.

## Deployment and verification

If the portal reports `Could not find public function for 'botApplications:list'`, the frontend has shipped before its Convex backend. A GitHub/Vercel deployment does not publish Convex functions. Deploy this repository to the **same Convex URL used by the live frontend**.

The current `kyro-chat.cyou` site uses `giant-cricket-958`, which Convex classifies as a development deployment. To update that exact backend, put `CONVEX_DEPLOYMENT=dev:giant-cricket-958` in an ignored `.env.bot-deployment.local` file and run:

```sh
npx convex dev --once --env-file .env.bot-deployment.local --codegen disable --typecheck enable --tail-logs disable
```

Check the CLI's announced target before continuing. `npx convex deploy` normally chooses the project's default production deployment, which may be different from the backend the website uses. The explicit Vercel rewrite maps nested `/api/bots/v1/*` routes to `api/bots.ts`; keep it when changing SPA routes.

1. Install dependencies, generate the committed Convex API types, and run the checks below.
2. Deploy the functions/schema to the intended Convex deployment with `npx convex deploy`. Use the project's existing auth configuration and production credentials. Do not run the local test-account harness against a production deployment.
3. In Vercel, set `VITE_CONVEX_URL` to that deployment's `.convex.cloud` URL. The API proxy derives the `.convex.site` URL, or accepts server-side `BOT_CONVEX_SITE_URL` for an explicit/custom HTTP endpoint. Redeploy the frontend/functions after configuration changes.
4. For webhook delivery, run `npm run bots:webhook-key`. It writes `KYRO_BOT_WEBHOOK_PRIVATE_KEY` (base64 PKCS8 Ed25519) to ignored `.env.bots.local`, refusing to overwrite an existing file. Set this variable securely **on Convex**, never as a `VITE_` variable. Verify `/api/bots/v1/webhook-key` returns the corresponding public key. Coordinate public-key pin updates when rotating the platform key. Polling does not require this signing key.
5. Validate a disposable application and server in the intended environment before inviting real communities. External bot processes need their own hosting and durable storage; Kyro does not evaluate developer code or host it in Vercel functions.

```sh
npm run gen:convex
npm run build:sdk
npm run typecheck
npm run lint
npm run test:bots
npm run test:email
npm run test:voice
npm run build
```

Real local integration/browser testing on Windows PowerShell:

```powershell
# Terminal 1: create/start an anonymous local Convex deployment.
$env:CONVEX_AGENT_MODE = 'anonymous'
npx convex dev --typecheck disable --codegen disable

# Terminal 2: if requested by the existing auth config:
npx convex env set VLY_CONVEX_AUTH_ISSUER https://freebuff.com
npm run build:sdk
node scripts/bot-live-smoke.mjs --configure-auth
npx playwright install chromium
$env:VITE_CONVEX_URL = 'http://127.0.0.1:3210'
npx vite --host 127.0.0.1 --port 5173

# Terminal 3, while the servers above are running:
node scripts/bot-browser-smoke.mjs
```

`--configure-auth` generates fresh local auth/webhook keys; use it only when setting up the disposable deployment. The live harness reads `.convex/local/default/config.json`, creates two actual password accounts, signs in normally, and exercises REST/SDK/database flows. It writes ignored `.env.bots-browser.local` credentials for the browser harness. Screenshots are stored in ignored `test-results/`. Run the browser check soon after the live harness because private responses expire after 15 minutes.

Automated coverage includes ownership, grants/revocation, channel denies, role delegation, token/rate behavior, messages/embeds/edits/reactions/polls/uploads, typed private interactions, AutoMod/slow mode, notification privacy, suspension, event leases/retries and SDK/webhook verification. Existing email/voice suites remain part of regression validation. Production LiveKit/SMTP and delivery to a real public webhook require their respective configured services and are not simulated as deployed by these tests.
