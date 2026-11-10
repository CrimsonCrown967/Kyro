// Real local Convex database, auth, HTTP, storage, scheduler and SDK smoke test.
// Deliberately refuses cloud deployments; never writes to Kyro production.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { KyroClient } from "../../packages/kyro.js/dist/index.js";

const config = JSON.parse(
  await readFile(
    new URL("../../.convex/local/default/config.json", import.meta.url),
    "utf8",
  ),
);
assert.ok(
  config.deploymentName?.startsWith("anonymous-"),
  "Live tests require a disposable anonymous local deployment",
);
assert.ok(
  Number.isInteger(config.ports.cloud) && Number.isInteger(config.ports.site),
);
const cloud = `http://127.0.0.1:${config.ports.cloud}`;
const apiBase = `http://127.0.0.1:${config.ports.site}/bot-api/v1`;
const suffix = randomBytes(5).toString("hex");
const credential = () => {
  const token = `kyro_bot_${randomBytes(32).toString("hex")}`;
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
};
async function account(role) {
  const client = new ConvexHttpClient(cloud, { logger: false });
  const password = randomBytes(24).toString("base64url");
  const email = `${role}_${suffix}@kyro-seed.invalid`;
  const result = await client.action("auth:signIn", {
    provider: "password",
    params: { flow: "signUp", email, password },
  });
  assert.ok(result.tokens?.token, "Sign-up returns a session");
  client.setAuth(result.tokens.token);
  await client.mutation("users:claimProfile", {
    username: `${role}_${suffix}`,
    name: `${role} integration test`,
  });
  const user = await client.query("users:me", {});
  const signedIn = await new ConvexHttpClient(cloud, { logger: false }).action(
    "auth:signIn",
    { provider: "password", params: { flow: "signIn", email, password } },
  );
  assert.ok(
    signedIn.tokens?.token,
    "Existing password sign-in remains functional",
  );
  return { client, user };
}
async function until(fn, label) {
  for (let i = 0; i < 40; i++) {
    const value = await fn();
    if (value) return value;
    await delay(500);
  }
  throw new Error(`Timed out: ${label}`);
}
const developer = await account("developer");
const admin = await account("admin");
const member = await account("member");
console.log(
  "PASS: three real password accounts, sign-in and profile onboarding",
);
const serverId = await admin.client.mutation("servers:create", {
  name: `Bot integration ${suffix}`,
  isPublic: true,
});
await member.client.mutation("servers:join", { serverId });
const { channels } = await admin.client.query("channels:list", { serverId });
const channelId = channels[0].id;
const secret = credential();
const applicationId = await developer.client.mutation(
  "botApplications:create",
  {
    name: `Test Bot ${suffix}`,
    username: `bot_${suffix}`,
    description: "Local test bot",
    tokenHash: secret.tokenHash,
  },
);
assert.equal(
  await member.client.query("botApplications:get", { applicationId }),
  null,
);
await assert.rejects(
  member.client.mutation("botApplications:install", {
    applicationId,
    serverId,
    permissions: [],
  }),
);
const permissions = [
  "view_channel",
  "send_messages",
  "read_message_history",
  "add_reactions",
  "attach_files",
  "create_polls",
  "manage_roles",
  "manage_channels",
  "manage_messages",
];
const installationId = await admin.client.mutation("botApplications:install", {
  applicationId,
  serverId,
  permissions,
});
console.log(
  "PASS: owner-only applications and administrator-only installations",
);

const bot = new KyroClient({
  token: secret.token,
  apiBase,
  pollIntervalMs: 1000,
});
const failures = [];
bot.on("error", (e) => failures.push(e.code ?? "sdk-error"));
bot.on("messageCreate", async (message) => {
  if (!message.author.bot && message.content === "!ping")
    await message.reply({
      content: "Pong from external SDK",
      clientId: `reply:${message.id}`,
    });
});
bot.on("interactionCreate", async (interaction) => {
  await interaction.reply({ content: "Private pong", ephemeral: true });
});
try {
  await bot.registerCommands([
    {
      name: "ping",
      description: "Test private responses",
      options: [
        {
          name: "count",
          description: "A count",
          type: "integer",
          required: true,
        },
      ],
    },
  ]);
  await bot.login();
  assert.equal(
    (await developer.client.query("botApplications:get", { applicationId }))
      .online,
    true,
  );
  await member.client.mutation("messages:send", {
    containerType: "channel",
    containerId: channelId,
    content: "!ping",
  });
  const reply = await until(
    async () =>
      (await bot.getMessages(channelId)).messages.find(
        (m) => m.content === "Pong from external SDK",
      ),
    "message event and reply",
  );
  await reply.edit("Edited SDK response");
  await reply.react("👍");
  console.log(
    "PASS: durable message events, external SDK reply/edit/reaction and presence",
  );
  const commands = await member.client.query("botCommands:listForChannel", {
    channelId,
  });
  await assert.rejects(
    member.client.mutation("botCommands:invoke", {
      channelId,
      commandId: commands[0].id,
      options: { count: "wrong" },
    }),
  );
  await member.client.mutation("botCommands:invoke", {
    channelId,
    commandId: commands[0].id,
    options: { count: 1 },
  });
  await until(
    async () =>
      (
        await member.client.query("botCommands:ownInteractions", { channelId })
      ).find((i) => i.response?.content === "Private pong"),
    "private response",
  );
  assert.equal(
    (await admin.client.query("botCommands:ownInteractions", { channelId }))
      .length,
    0,
  );
  assert.equal(
    (await bot.getMessages(channelId)).messages.some(
      (m) => m.content === "Private pong",
    ),
    false,
  );
  console.log(
    "PASS: persistent typed slash commands and private interaction responses",
  );
  const attachment = await bot.uploadAttachment(channelId, {
    name: "test file.txt",
    data: new TextEncoder().encode("Live storage test"),
    mimeType: "text/plain",
  });
  assert.equal(attachment.name, "test file.txt");
  const attached = await bot.sendMessage(channelId, {
    content: "A real attachment",
    attachments: [attachment],
  });
  assert.ok(attached.data.attachments[0].url);
  const poll = await bot.createPoll(channelId, {
    question: "Does the database work?",
    options: ["Yes", "Confirmed"],
  });
  assert.ok(poll.id);
  const role = await bot.createRole(serverId, {
    name: "Bot managed role",
    permissions: ["send_messages"],
  });
  await bot.updateRole(serverId, role.id, { color: "#5865F2" });
  await assert.rejects(
    bot.createRole(serverId, {
      name: "Forbidden",
      permissions: ["ban_members"],
    }),
  );
  console.log(
    "PASS: real storage upload, poll persistence, role management and escalation denial",
  );
  const uploadUrl = await developer.client.mutation(
    "files:generateUploadUrl",
    {},
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  const uploaded = await (
    await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    })
  ).json();
  await developer.client.mutation("files:registerUpload", {
    storageId: uploaded.storageId,
    name: "icon.png",
  });
  await developer.client.mutation("botApplications:update", {
    applicationId,
    iconStorageId: uploaded.storageId,
    discoverable: true,
  });
  assert.ok(
    (await developer.client.query("botApplications:get", { applicationId }))
      .iconUrl,
  );
  assert.ok(
    (await member.client.query("botApplications:directory", {})).some(
      (a) => a.id === applicationId,
    ),
  );
  await member.client.mutation("botApplications:report", {
    applicationId,
    reason: "Integration test report for the local bot.",
  });
  const stats = await developer.client.query("botApplications:analytics", {
    applicationId,
  });
  assert.equal(stats.commandsExecuted, 1);
  assert.equal(stats.usersReached, 2);
  assert.ok(stats.apiRequests > 0);
  console.log(
    "PASS: application media, public directory, abuse report and recorded analytics",
  );
  await admin.client.mutation("botApplications:updateInstallation", {
    installationId,
    permissions: ["view_channel"],
  });
  await assert.rejects(
    bot.sendMessage(channelId, "Denied"),
    (e) => e.status === 403,
  );
  const replacement = credential();
  await developer.client.mutation("botApplications:rotateToken", {
    applicationId,
    tokenHash: replacement.tokenHash,
  });
  const revoked = await fetch(`${apiBase}/users/@me`, {
    headers: { Authorization: `Bot ${secret.token}` },
  });
  assert.equal(revoked.status, 401);
  await admin.client.mutation("botApplications:uninstall", { installationId });
  await developer.client.mutation("botApplications:remove", {
    applicationId,
    confirmation: `Test Bot ${suffix}`,
  });
  assert.equal(
    await developer.client.query("botApplications:get", { applicationId }),
    null,
  );
  console.log(
    "PASS: immediate permission revocation, token rotation, uninstall and deletion",
  );
  assert.ok(
    failures.every((code) => code === "UNAUTHORIZED"),
    "Only deliberate token revocation may stop the SDK",
  );
} finally {
  await bot.destroy();
}
console.log(
  "Live bot integration checks passed on the disposable local database.",
);
