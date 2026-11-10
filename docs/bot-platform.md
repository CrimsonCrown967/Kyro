# Kyro Bot Developer Platform

KyroFree uses React 19, Vite, React Router, strict TypeScript, Tailwind/Radix UI,
Convex Auth, and Convex database/storage/HTTP actions. The bot platform extends
the existing `users`, `serverMembers`, `serverRoles`, `channels`, `messages`,
`polls`, uploads, moderation, and channel permission systems. Bot identities
have `isBot: true`, have no password/auth account, and cannot use human mutations
or own servers. Existing built-in server commands continue to work.

## Create and install

1. Sign in to Kyro and open **Developer Portal** from the account sidebar.
2. Create an application with a unique bot username. Save the one-time token.
3. Set application icon/banner separately from bot avatar/description. Configure
   default permissions, commands and event subscriptions.
4. Share the Installation URL. An authenticated server manager chooses a server,
   reviews permissions, and explicitly authorizes installation. Canceling writes
   nothing. This is a bot installation flow, not third-party user OAuth login.
5. Run your code on your own Node.js host using the SDK below. Kyro never runs
   uploaded user code, `eval`, or a user bot process inside Vercel functions.

Server Settings → Bots & commands lists installed bots. Managers can edit their
permissions or remove them. Owners can disable/delete their applications.
Deletion requires the exact application name and revokes tokens immediately.
The Admin Portal → Bots lets staff review reports and administrators suspend,
restore, verify or feature bots. Restoring a suspended bot never restores its
revoked credential; the owner must generate a new one.

## Authentication

API base: `https://<your-convex-deployment>.convex.site/bot-api/v1`.
Use the HTTP actions `.site` domain, not the database `.cloud` domain.
The portal shows the configured base. Local development uses port 3211.

```http
Authorization: Bot kyro_bot_<64 lowercase hex characters>
Content-Type: application/json
```

The portal generates 32 random bytes with Web Crypto. It sends only SHA-256 of
the complete token to authenticated application mutations. Plaintext exists
only in the one-time browser dialog and the developer's secret environment;
it is never returned by a Kyro backend function, stored in the database,
included in audit logs, or placed in localStorage. All reads use explicit
projections excluding token hashes. HTTPS HTTP actions hash bearer tokens
before passing them to internal database functions. Each function rechecks
the credential and active application so rotation takes effect immediately,
including between upload authorization and attachment registration.

Do not put bot tokens in browser code, URLs, logs, source control, or webhooks.
Never use a human session token as a bot token.

## HTTP contract

Success: `{ "data": <result> }`. Creates return 201; other successes return 200.
Errors: `{ "error": { "code": "FORBIDDEN", "message": "Missing permission: …" } }`.
Rate-limit errors also contain `retryAfter` seconds and a `Retry-After` header.
Responses use `Cache-Control: no-store`. Requests do not use cookies or browser
CORS credentials. All IDs are opaque strings; timestamps are Unix milliseconds.
Optional fields may be omitted. Unknown write fields are rejected.

| HTTP | Code              | Meaning                                                      |
| ---- | ----------------- | ------------------------------------------------------------ |
| 400  | INVALID_REQUEST   | Invalid JSON, payload, argument or permission                |
| 401  | UNAUTHORIZED      | Missing, invalid, rotated or revoked token                   |
| 403  | FORBIDDEN         | Disabled/suspended bot, missing membership or permission     |
| 404  | NOT_FOUND         | Missing resource, invalid ID, unknown route/method           |
| 409  | CONFLICT          | Already answered interaction or incompatible event transport |
| 410  | EXPIRED           | Interaction response deadline passed                         |
| 413  | PAYLOAD_TOO_LARGE | Request exceeds upload or JSON limit                         |
| 422  | AUTOMOD_BLOCKED   | Server AutoMod rejected the content                          |
| 429  | RATE_LIMITED      | Wait the supplied retry interval                             |
| 500  | INTERNAL_ERROR    | Safe generic error; retry reads with backoff                 |

Use a stable `clientId` when retrying a message after an uncertain network
failure. The key is scoped to bot author and channel and returns the existing
message while that message exists. Never assume a failed network write did not
commit. Other writes are not automatically retried by the SDK.

## Permissions

Supported permission strings:

```text
view_channel send_messages read_message_history manage_messages
manage_channels manage_roles kick_members ban_members manage_server
mention_everyone add_reactions attach_files use_external_emojis create_polls
```

Defaults are `view_channel`, `send_messages`, and `read_message_history`.
Installation permissions form a ceiling. The bot's managed role and effective
server permissions must also grant the permission, and channel denies still
apply. Adding Administrator to any bot role never bypasses this ceiling.
Managers cannot delegate powers they lack. Role operations and moderation
must target members/roles strictly below the bot's highest role; the server
owner, the bot itself, and managed installation roles are protected.
Default-permission edits never silently expand existing installations.

Posting respects server locks, read-only/rules channels, timeouts, slow mode,
AutoMod, mention permissions and external emoji membership. Credentials,
owner suspension, server bans, role removal and channel access are rechecked
on every request and event delivery.

## Resource objects

```ts
type User = {
  id: string;
  username: string;
  name?: string;
  avatar?: string | null;
  bot?: boolean;
};
type Attachment = {
  storageId: string;
  name: string;
  size: number;
  mimeType: string;
  url?: string | null;
};
type Embed = {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
};
type Message = {
  id: string;
  channelId: string;
  serverId: string;
  author: User;
  content: string;
  createdAt: number;
  editedAt?: number;
  replyToId?: string;
  embeds?: Embed[];
  attachments?: Attachment[];
};
type Server = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: number;
  memberCount?: number;
};
type Channel = {
  id: string;
  serverId: string;
  name: string;
  topic?: string;
  kind: "text" | "voice" | "forum";
  permissions?: string[];
};
type Member = {
  id: string;
  user: User;
  nickname?: string;
  roleIds: string[];
  joinedAt: number;
};
type Role = {
  id: string;
  serverId?: string;
  name: string;
  color?: string;
  permissions: string[];
  position?: number;
};
```

Embeds allow 256-character titles, 2,000-character descriptions, HTTPS URLs,
`#RRGGBB` colors, and up to 10 fields (256-character names, 1,000-character values).
Kyro renders them as text and safe links, never developer-supplied HTML.

## Endpoints

All paths below are relative to the API base. Bodies are JSON except uploads.
All server/channel endpoints require installation; channel endpoints require
`view_channel` in addition to their listed permission.

| Method/path                                        | Parameters/body                                            | Result; additional permission                                       |
| -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| GET `/users/@me`                                   | None                                                       | User with `applicationId`                                           |
| POST `/gateway/heartbeat`                          | `{}`                                                       | `{online: true, timestamp}`; refresh every 45 seconds               |
| GET `/gateway`                                     | None                                                       | `{signingPublicKey, events, transport, retentionDays}`              |
| GET `/servers/:id`                                 | None                                                       | Server with memberCount                                             |
| GET `/servers/:id/channels`                        | None                                                       | `{channels: Channel[]}`; invisible channels omitted                 |
| POST `/servers/:id/channels`                       | `{name, topic?}`; lowercase name 1–80, topic ≤500          | Channel; manage_channels                                            |
| GET `/channels/:id`                                | None                                                       | Channel with effective permissions                                  |
| DELETE `/channels/:id`                             | None                                                       | `{deleted: true}`; manage_channels                                  |
| GET `/channels/:id/messages`                       | Query `limit` 1–100 (50 default), `before` timestamp       | `{messages: Message[], hasMore}` newest first; read_message_history |
| GET `/channels/:id/messages/:messageId`            | None                                                       | Message; read_message_history                                       |
| POST `/channels/:id/messages`                      | `{content?, embeds?, attachments?, replyToId?, clientId?}` | Message; send_messages, attach_files when applicable                |
| PATCH `/channels/:id/messages/:messageId`          | `{content?, embeds?}`; at least one                        | Message; send_messages; only own messages                           |
| DELETE `/channels/:id/messages/:messageId`         | None                                                       | `{deleted: true}`; manage_messages for another author's message     |
| POST `/channels/:id/messages/:messageId/reactions` | `{emoji}`; 1–100 characters                                | `{added: true}`; add_reactions; repeated adds are idempotent        |
| POST `/channels/:id/attachments`                   | Raw bytes; Content-Type; URL-encoded `X-Filename`          | Attachment; attach_files + send_messages                            |
| POST `/channels/:id/polls`                         | `{question, options, multiple?, durationMinutes?}`         | `{id, message}`; create_polls + send_messages                       |
| GET `/servers/:id/members/:userId`                 | None                                                       | Member                                                              |
| DELETE `/servers/:id/members/:userId`              | Optional `{reason}` ≤500                                   | `{removed: true}`; kick_members                                     |
| PUT `/servers/:id/bans/:userId`                    | Optional `{reason}` ≤500                                   | `{removed: true}`; ban_members; target must currently be a member   |
| POST `/servers/:id/roles`                          | `{name, permissions, color?}`; name 2–60                   | Role; manage_roles                                                  |
| PATCH `/servers/:id/roles/:roleId`                 | Partial `{name, permissions, color}`                       | Role; manage_roles                                                  |
| PUT `/servers/:id/members/:userId/roles`           | `{roleIds: string[]}` up to 100                            | `{roleIds}`; manage_roles                                           |
| GET `/applications/@me/commands`                   | Optional query `serverId`                                  | `{commands: Command[]}` in scope                                    |
| PUT `/applications/@me/commands`                   | `{commands: Command[], serverId?}`                         | `{commands}`; replaces scope, `[]` clears                           |
| POST `/interactions/:id/responses`                 | `{content?, embeds?, ephemeral?}`                          | `{id, messageId?, ephemeral}`; send_messages                        |
| GET `/events`                                      | Query `limit` 1–50, default 50                             | `{events: Event[], hasMore}`                                        |
| POST `/events/ack`                                 | `{eventIds: string[]}` up to 100                           | `{acknowledged}`                                                    |

Message content ≤2,000 characters, up to four embeds and six attachments. At
least one must be nonempty. Upload first, then use the returned Attachment in
the send body. Metadata is checked against storage; attachments must belong to
the bot and may be claimed once. Reply targets must be in the same channel.
Uploads use Kyro's existing 10 MiB limit and allowed media/document MIME types.

Poll questions contain 3–200 characters, with 2–10 distinct options of 1–100
characters. `multiple` defaults false. Optional duration is 5–10,080 minutes.

## Slash commands

```json
{
  "commands": [
    {
      "name": "avatar",
      "description": "Show a member's avatar",
      "permissions": [],
      "options": [
        {
          "name": "member",
          "description": "Choose a member",
          "type": "user",
          "required": true
        }
      ]
    }
  ]
}
```

Names match `[a-z][a-z0-9_-]{0,31}`. Descriptions contain 1–100 characters.
There may be 100 commands per global/server scope and 25 options per command.
Command and option names are unique within their scope. Required options
precede optional ones. Option types are `string`, `integer`, `boolean`, `user`.
Strings accept up to 1,000 characters; integers must be safe integers; user
IDs must identify current server members. Strings/integers can have up to 25
static `choices: [{name, value}]`, with values matching the option type.
Unknown arguments, wrong types and unavailable choices are rejected server-side.

Server commands override same-name global commands from that application.
The composer displays the application name to distinguish different bots.
Typing `/` filters available commands; the command dialog offers choices and
member selection. Dynamic remote option autocomplete is not implemented.
The command's `permissions` are requirements on the invoking human. They do
not grant additional powers to the bot.

`interactionCreate.data` contains `id`, `commandId`, `commandName`, `channelId`,
`serverId`, `user`, `options`, and `expiresAt`. Respond within 15 minutes.
Only the owning bot can respond. Identical repeated responses are idempotent;
changed responses return 409. `ephemeral: true` stores a private response read
only through the invoking user's authenticated query, never channel history
or other bots' events. Public responses become normal persistent bot messages.

## Events and webhooks

Events: `messageCreate`, `messageUpdate`, `messageDelete`, `memberJoin`,
`memberLeave`, `memberUpdate`, `serverCreate`, `serverUpdate`, `channelCreate`,
`channelDelete`, `roleCreate`, `roleUpdate`, `interactionCreate`.
`serverCreate` is also sent when the bot is installed, providing initial context.
Interactions are always delivered to their application, regardless of subscriptions.

Envelope: `{id, type, createdAt, serverId, channelId?, data}`. Message data is
Message; member/role/server/channel data uses the objects above. Delete events
contain resource IDs; memberLeave contains `{serverId, userId}`.

The originating database transaction persists the event and schedules fanout.
Delivery IDs are unique per application/event; channel visibility is captured
at creation and rechecked on delivery. Joining later does not expose old events.
Events and delivery records expire after seven days. Disable a configured
webhook URL before polling; the two transports cannot consume simultaneously.

Polling is at least once. Acknowledge only after successful durable processing.
Store processed event IDs in your database and commit side effects and that ID
atomically where possible. The SDK's default store remembers 10,000 IDs only in
memory. One active poller per application is recommended; multiple replicas
require your own shared lease and durable event store. At-least-once delivery
does not promise exactly-once external side effects.

Webhook requests are POST with the exact JSON envelope and headers:

```text
X-Kyro-Event-Id: <event id>
X-Kyro-Timestamp: <Unix milliseconds>
X-Kyro-Signature: <base64 Ed25519 signature>
```

Pin `signingPublicKey` from authenticated GET `/gateway`. Verify
`timestamp + "." + rawBody` before parsing, accept at most five minutes of
clock skew, and persist event IDs to reject replay. The SDK exports
`verifyWebhookSignature` and `createWebhookHandler` for this purpose.
Return 2xx only after durable acceptance. Kyro leases deliveries, records status
and attempt count, and retries failures up to eight times with exponential
backoff (five seconds initially, capped at one hour). Failed retained events
can be retried from the portal. Response bodies are never logged.

Only public HTTPS destinations on port 443 are supported. DNS is resolved and
pinned to a public IPv4 address; private/special addresses, URL credentials,
fragments and redirects are rejected. DNS and HTTP each have five-second
deadlines. IPv6-only webhook hosts are currently unsupported. Prefer polling
when developing on localhost.

## SDK and examples

`packages/kyro.js` is the official repository SDK source, **not an npm-published
package**. Build with `npm run build:sdk`, then install its local path in a
separate Node.js project. Node 22+ is recommended (minimum Node 20.3).
Set `KYRO_BOT_TOKEN` and `KYRO_BOT_API_URL` only in the external host environment.
See [SDK README](../packages/kyro.js/README.md),
[ping example](../packages/kyro.js/examples/ping.ts), and
[webhook example](../packages/kyro.js/examples/webhook.ts).

## Deployment and verification

Deploy the additive Convex schema/functions to the existing Kyro deployment,
then build the frontend with the corresponding `VITE_CONVEX_URL`.
`VITE_BOT_API_URL` can override the derived HTTP base. Keep the existing auth
configuration, auth keys, email/LiveKit services and storage configuration.

For webhooks set **server-only** `KYRO_BOT_EVENT_SIGNING_KEY` on Convex to a
cryptographically random 32-byte base64 value. Do not use a `VITE_` prefix.
Back up this key: replacing it changes all application signing public keys;
coordinate re-pinning with developers. Polling works without a signing key;
GET `/gateway` returns `signingPublicKey: null` until configured.
The one-minute Convex cron recovers due deliveries, clears stale presence,
and applies retention. Normal retries also use scheduled actions.

```sh
npm install
npm run gen:convex
npm run typecheck
npm run typecheck:sdk
npm run lint
npm run test:bots
npm run test:email
npm run test:voice
npm run build:sdk
npm run build
```

`test:bots` uses Convex's in-memory test implementation with multiple identities,
real function handlers and schema/index operations, plus SDK/signature tests.
For a real disposable local database, run `CONVEX_AGENT_MODE=anonymous npx convex
dev --codegen disable` (PowerShell: `$env:CONVEX_AGENT_MODE='anonymous'`). In another
terminal run `node scripts/configure-bot-test-backend.mjs`, wait for functions
to deploy, then `npm run test:bots:live`. This creates real password accounts,
servers, objects and messages only on an anonymous local deployment. It refuses
cloud deployments. The setup script regenerates local auth/signing keys; use
it only for disposable test data. No fixture/admin mutation is shipped in Kyro.

## Capacity and operational scope

Current explicit limits: 25 applications per owner (25 creations/day), 100
servers per bot, 100 bots per server, 100 commands per scope, 120 API requests
per bot/minute, five messages per bot/channel per five seconds, ten uploads per
minute, and 30 outbound webhooks per bot/minute. JSON bodies are capped at
64 KiB. Portal lists and recent audit/delivery views are bounded. Directory
discovery searches/sorts a maximum of 100 matching/recent active listings;
popular ordering applies to that result set. Increase capacity only after
load-testing Convex transaction/read limits and replacing bounded scans with
indexed counters/pagination as needed.

Statistics come from stored API counters, executed interactions, and live
installations. “Users reached” is the distinct non-bot membership union of
installed servers, not proof that each member viewed a bot message. Revoked or
deleted installations are excluded. Audit history and tombstoned bot identities
remain so old messages retain attribution.

This repository does not provision external bot hosting or publish the SDK.
Production rollout still requires the existing deployment's environment,
function deployment, and operational monitoring; local tests are not load tests.
