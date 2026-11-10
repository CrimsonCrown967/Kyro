import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { KyroClient } from "../sdk/kyro.js/dist/index.js";

// Refuse remote deployments: this integration harness creates actual test accounts.
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
const url = `http://127.0.0.1:${config.ports.cloud}`;
const site = `http://127.0.0.1:${config.ports.site}`;
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
function setLocalEnv(name, value) {
  const run = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", "env", "set", name],
    { input: value, encoding: "utf8", windowsHide: true },
  );
  if (run.status !== 0) throw new Error(`Failed to configure local ${name}`);
}
if (process.argv.includes("--configure-auth")) {
  const localEnvironment = readFileSync(".env.local", "utf8");
  const selectedDeployment = localEnvironment.match(
    /^CONVEX_DEPLOYMENT=["']?([^\s#"']+)/m,
  )?.[1];
  assert.equal(
    selectedDeployment,
    "anonymous:anonymous-agent",
    "Auth setup requires the disposable local deployment. It cannot run with a cloud deployment selected.",
  );
  assert(
    !process.env.CONVEX_DEPLOY_KEY &&
      !process.env.CONVEX_SELF_HOSTED_URL &&
      (!process.env.CONVEX_DEPLOYMENT ||
        process.env.CONVEX_DEPLOYMENT === "anonymous:anonymous-agent"),
    "Remove remote Convex deployment overrides before local auth setup.",
  );
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  setLocalEnv(
    "JWT_PRIVATE_KEY",
    privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  );
  setLocalEnv(
    "JWKS",
    JSON.stringify({
      keys: [
        { ...publicKey.export({ format: "jwk" }), use: "sig", alg: "RS256" },
      ],
    }),
  );
  const webhook = generateKeyPairSync("ed25519");
  setLocalEnv(
    "KYRO_BOT_WEBHOOK_PRIVATE_KEY",
    webhook.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
  );
}
const suffix = randomBytes(4).toString("hex");
const password = randomBytes(24).toString("base64url");
const client = new ConvexHttpClient(url);
const ownerEmail = `owner_${suffix}@kyro-test.invalid`;
const otherEmail = `other_${suffix}@kyro-test.invalid`;
const owner = await client.action(api.users.createAccount.createAccount, {
  email: ownerEmail,
  password,
  username: `owner_${suffix}`,
  name: "Bot platform owner",
});
const other = await client.action(api.users.createAccount.createAccount, {
  email: otherEmail,
  password,
  username: `other_${suffix}`,
  name: "Bot platform member",
});
async function signIn(email) {
  const authenticated = new ConvexHttpClient(url);
  const result = await authenticated.action(api.auth.signIn, {
    provider: "password",
    params: { flow: "signIn", email, password },
  });
  assert(result.tokens?.token, "Password sign-in must return an access token");
  authenticated.setAuth(result.tokens.token);
  return authenticated;
}
const ownerClient = await signIn(ownerEmail);
const otherClient = await signIn(otherEmail);
const serverId = await ownerClient.mutation(api.servers.create, {
  name: `Bot integration ${suffix}`,
  isPublic: true,
});
await otherClient.mutation(api.servers.join, { serverId });
const channels = await ownerClient.query(api.channels.list, { serverId });
const channelId = channels.channels[0].id;
const token = `kyro_bot_${randomBytes(32).toString("hex")}`;
const tokenHash = createHash("sha256").update(token).digest("hex");
const applicationId = await ownerClient.mutation(api.botApplications.create, {
  name: `Orbit ${suffix}`,
  username: `orbit_${suffix}`,
  description: "A real integration-test bot",
  tokenHash,
});
await assert.rejects(
  otherClient.query(api.botApplications.get, { applicationId }),
);
await assert.rejects(
  otherClient.mutation(api.botApplications.install, {
    applicationId,
    serverId,
    permissions: ["send_messages"],
  }),
);
const permissions = [
  "view_channel",
  "send_messages",
  "read_message_history",
  "add_reactions",
  "create_polls",
  "upload_attachments",
  "manage_channels",
  "manage_roles",
  "manage_messages",
  "kick_members",
  "ban_members",
  "manage_server",
];
await ownerClient.mutation(api.botApplications.install, {
  applicationId,
  serverId,
  permissions,
});
await ownerClient.mutation(api.botApplications.events, {
  applicationId,
  events: [
    "messageCreate",
    "messageUpdate",
    "messageDelete",
    "interactionCreate",
    "channelCreate",
    "channelDelete",
    "roleCreate",
    "roleUpdate",
    "serverUpdate",
    "memberJoin",
    "memberLeave",
    "memberUpdate",
  ],
  deliveryMode: "poll",
  webhookUrl: "",
});
const sdk = new KyroClient({ token, baseUrl: `${site}/api/bots/v1` });
const sent = await sdk.sendMessage(channelId, {
  content: "Integration message",
  embeds: [{ title: "Orbit status", description: "Ready" }],
  nonce: `first_${suffix}`,
});
assert.equal(
  (
    await sdk.sendMessage(channelId, {
      content: "Retry",
      nonce: `first_${suffix}`,
    })
  ).id,
  sent.id,
);
await sent.edit("Edited through kyro.js");
await sent.react("👍");
await sdk.createPoll(channelId, sent.id, {
  question: "Test poll?",
  options: ["Yes", "No"],
});
const attachment = await sdk.upload(
  channelId,
  new Blob(["hello"], { type: "text/plain" }),
  "hello.txt",
);
await sdk.sendMessage(channelId, {
  content: "File attached",
  attachmentIds: [attachment],
});
const command = await sdk.registerCommand({
  name: "ping",
  description: "Integration ping",
  options: [
    {
      name: "count",
      description: "An integer",
      type: "integer",
      required: true,
    },
  ],
});
const interactionId = await otherClient.mutation(api.botCommands.execute, {
  channelId,
  commandId: command.id,
  options: { count: 2 },
});
await sdk.respond(interactionId, { content: "Private pong", ephemeral: true });
assert.equal(
  (await otherClient.query(api.botCommands.responses, { channelId }))[0]
    .response,
  "Private pong",
);
assert.equal(
  (await ownerClient.query(api.botCommands.responses, { channelId })).length,
  0,
);
await ownerClient.mutation(api.messages.send, {
  containerType: "channel",
  containerId: channelId,
  content: "!ping",
  clientId: `human_${suffix}`,
});
const events = await sdk.request("GET", "/events");
assert(
  events.events.some(
    (event) => event.type === "messageCreate" && event.data.content === "!ping",
  ),
);
await sdk.request("POST", "/events/ack", {
  ids: events.events.map((e) => e.id),
});
const info = await ownerClient.query(api.botApplications.get, {
  applicationId,
});
await ownerClient.mutation(api.botApplications.update, {
  applicationId,
  name: info.name,
  description: info.description,
  username: info.username,
  botDescription: info.botDescription,
  enabled: true,
  discoverable: true,
  category: "Utilities",
  permissions,
});
assert(
  (
    await otherClient.query(api.botApplications.directory, { search: suffix })
  ).some((bot) => bot.id === applicationId),
);
await otherClient.mutation(api.botApplications.report, {
  applicationId,
  reason: "Integration test abuse-report submission.",
});
await assert.rejects(sdk.kick(serverId, owner.userId));
const changed = await sdk.request("POST", `/servers/${serverId}/channels`, {
  name: "bot-created",
});
await sdk.request("DELETE", `/channels/${changed.id}`);
// The browser harness uses these local-only credentials; the file is gitignored.
writeFileSync(
  ".env.bots-browser.local",
  JSON.stringify({
    ownerEmail,
    otherEmail,
    password,
    applicationId,
    serverId,
    channelId,
    url,
    site,
  }),
  { mode: 0o600 },
);
console.log(
  "PASS: live Convex accounts, ownership, consent, SDK messages/embeds/edits/reactions/polls/uploads, typed interactions, ephemeral privacy, events/ack, directory, reports and channel management.",
);
console.log(
  `Local test application ${applicationId}; server ${serverId}. No production data was used.`,
);
