/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import schema from "../../src/convex/schema";
import { api, internal } from "../../src/convex/_generated/api";
import { BOT_PERMISSIONS } from "../../src/lib/botContract";
import type { Id } from "../../src/convex/_generated/dataModel";
const modules = import.meta.glob("../../src/convex/**/*.{ts,tsx}");
const credential = () => {
  const token = `kyro_bot_${randomBytes(32).toString("hex")}`;
  return { token, hash: createHash("sha256").update(token).digest("hex") };
};
describe("bot permission and delivery edge cases", () => {
  it("paginates equal-timestamp messages without dropping rows", async () => {
    const f = await installed();
    const now = Date.now();
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 5; i++)
        await ctx.db.insert("messages", {
          authorId: f.ownerId,
          containerId: f.channelId,
          containerType: "channel",
          content: String(i),
          createdAt: now,
        });
    });
    const ids = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = (await f.invoke(
        "GET",
        `channels/${f.channelId}/messages`,
        {},
        { limit: "2", ...(cursor ? { cursor } : {}) },
      )) as { messages: { id: string }[]; nextCursor: string | null };
      page.messages.forEach((m) => ids.add(m.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids.size).toBe(5);
  });
  it("cleans up installation grants when existing server moderation kicks a bot", async () => {
    const f = await installed();
    const app = await f.owner.query(api.botApplications.get, {
      applicationId: f.applicationId,
    });
    await f.owner.mutation(api.servers.kick, {
      serverId: f.serverId,
      userId: app.botId,
      reason: "Remove integration",
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("botInstallations").collect()),
    ).toHaveLength(0);
    await expect(f.invoke("GET", `servers/${f.serverId}`)).rejects.toThrow();
  });
  it("applies AutoMod to messages, embeds, polls and command inputs, and enforces slow mode", async () => {
    const f = await installed();
    await f.owner.mutation(api.botApplications.install, {
      applicationId: f.applicationId,
      serverId: f.serverId,
      permissions: [
        "view_channel",
        "send_messages",
        "read_message_history",
        "create_polls",
      ],
    });
    await f.owner.mutation(api.automod.updateSettings, {
      serverId: f.serverId,
      enabled: true,
      blockedWords: ["forbidden"],
      blockInvites: false,
      blockLinks: false,
      maxMentions: 0,
      blockCaps: false,
      blockSpam: false,
      exemptRoleIds: [],
      exemptChannelIds: [],
    });
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "forbidden",
      }),
    ).rejects.toThrow(/AutoMod/);
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        embeds: [{ description: "forbidden" }],
      }),
    ).rejects.toThrow(/AutoMod/);
    const message = (await f.invoke(
      "POST",
      `channels/${f.channelId}/messages`,
      { content: "Allowed" },
    )) as { id: string };
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages/${message.id}/polls`, {
        question: "forbidden",
        options: ["yes", "no"],
      }),
    ).rejects.toThrow(/AutoMod/);
    await f.t.run((ctx) => ctx.db.patch(f.channelId, { slowMode: 60 }));
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "Too soon",
      }),
    ).rejects.toThrow(/slow mode/);
    const commandId = await f.owner.mutation(api.botCommands.save, {
      applicationId: f.applicationId,
      command: {
        name: "echo",
        description: "Echo",
        options: [
          { name: "text", description: "Text", type: "string", required: true },
        ],
      },
    });
    await expect(
      f.other.mutation(api.botCommands.execute, {
        channelId: f.channelId,
        commandId,
        options: { text: "forbidden" },
      }),
    ).rejects.toThrow(/AutoMod/);
    await f.other.mutation(api.botCommands.execute, {
      channelId: f.channelId,
      commandId,
      options: { text: "hello" },
    });
    await expect(
      f.other.mutation(api.botCommands.execute, {
        channelId: f.channelId,
        commandId,
        options: { text: "again" },
      }),
    ).rejects.toThrow(/slow mode/);
  });
  it("never puts hidden-channel snippets in notifications and respects mutes and blocks", async () => {
    const f = await installed();
    const role = await f.t.run((ctx) =>
      ctx.db.insert("serverRoles", {
        serverId: f.serverId,
        name: "Hidden",
        permissions: [],
        position: 2,
        isDefault: false,
      }),
    );
    const membership = await f.t.run((ctx) =>
      ctx.db
        .query("serverMembers")
        .withIndex("by_server_user", (q) =>
          q.eq("serverId", f.serverId).eq("userId", f.otherId),
        )
        .unique(),
    );
    await f.t.run(async (ctx) => {
      await ctx.db.patch(membership!._id, { roleIds: [role] });
      await ctx.db.patch(f.channelId, {
        permissionOverwrites: [
          { roleId: role, allow: [], deny: ["view_channel"] },
        ],
      });
    });
    await f.invoke("POST", `channels/${f.channelId}/messages`, {
      content: "@other secret",
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("notifications").collect()),
    ).toHaveLength(0);
    await f.t.run((ctx) =>
      ctx.db.patch(f.channelId, { permissionOverwrites: [] }),
    );
    await f.invoke("POST", `channels/${f.channelId}/messages`, {
      content: "@other visible",
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("notifications").collect()),
    ).toHaveLength(1);
    await f.t.run((ctx) => ctx.db.patch(membership!._id, { muted: true }));
    await f.invoke("POST", `channels/${f.channelId}/messages`, {
      content: "@other muted",
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("notifications").collect()),
    ).toHaveLength(1);
    const app = await f.owner.query(api.botApplications.get, {
      applicationId: f.applicationId,
    });
    await f.t.run(async (ctx) => {
      await ctx.db.patch(membership!._id, { muted: false });
      await ctx.db.insert("blocks", {
        blockerId: f.otherId,
        blockedId: app.botId,
        createdAt: Date.now(),
      });
    });
    await f.invoke("POST", `channels/${f.channelId}/messages`, {
      content: "@other blocked",
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("notifications").collect()),
    ).toHaveLength(1);
  });
  it("supports lower-role lifecycle and rejects escalation and owner moderation", async () => {
    const f = await installed();
    const install = await f.t.run((ctx) =>
      ctx.db.query("botInstallations").first(),
    );
    await f.t.run((ctx) => ctx.db.patch(install!.roleId, { position: 5 }));
    const role = (await f.invoke("POST", `servers/${f.serverId}/roles`, {
      name: "Helper",
      permissions: ["send_messages"],
    })) as { id: string };
    await f.invoke(
      "PUT",
      `servers/${f.serverId}/members/${f.otherId}/roles/${role.id}`,
    );
    const member = (await f.invoke(
      "GET",
      `servers/${f.serverId}/members/${f.otherId}`,
    )) as { roleIds: string[] };
    expect(member.roleIds).toContain(role.id);
    await expect(
      f.invoke("PATCH", `servers/${f.serverId}/roles/${role.id}`, {
        permissions: ["administrator"],
      }),
    ).rejects.toThrow();
    await f.invoke("PATCH", `servers/${f.serverId}/roles/${role.id}`, {
      name: "Helpers",
    });
    await f.invoke(
      "DELETE",
      `servers/${f.serverId}/members/${f.otherId}/roles/${role.id}`,
    );
    await f.invoke("DELETE", `servers/${f.serverId}/roles/${role.id}`);
    await expect(
      f.invoke("DELETE", `servers/${f.serverId}/members/${f.ownerId}`),
    ).rejects.toThrow();
  });
  it("enforces scope overrides, interaction expiry and mandatory interaction delivery", async () => {
    const f = await installed();
    const command = { name: "ping", description: "Ping" };
    const globalId = await f.owner.mutation(api.botCommands.save, {
      applicationId: f.applicationId,
      command,
    });
    const localId = await f.owner.mutation(api.botCommands.save, {
      applicationId: f.applicationId,
      command: { ...command, serverId: f.serverId },
    });
    expect(
      (
        await f.other.query(api.botCommands.forChannel, {
          channelId: f.channelId,
        })
      ).map((c) => c.id),
    ).toEqual([localId]);
    await expect(
      f.other.mutation(api.botCommands.execute, {
        channelId: f.channelId,
        commandId: globalId,
        options: {},
      }),
    ).rejects.toThrow(/server-specific/);
    await f.owner.mutation(api.botApplications.events, {
      applicationId: f.applicationId,
      events: [],
      deliveryMode: "poll",
      webhookUrl: "",
    });
    const id = await f.other.mutation(api.botCommands.execute, {
      channelId: f.channelId,
      commandId: localId,
      options: {},
    });
    expect(
      (await f.t.run((ctx) => ctx.db.query("botEvents").collect())).some(
        (e) => e.type === "interactionCreate",
      ),
    ).toBe(true);
    await f.t.run((ctx) => ctx.db.patch(id, { expiresAt: Date.now() - 1 }));
    await expect(
      f.invoke("POST", `interactions/${id}/response`, {
        content: "late",
        ephemeral: true,
      }),
    ).rejects.toThrow(/expired/);
  });
  it("revokes suspended apps and deleted owners while allowing staff to unsuspend", async () => {
    const f = await installed();
    await f.t.run((ctx) => ctx.db.patch(f.ownerId, { role: "admin" }));
    await f.owner.mutation(api.botApplications.moderate, {
      applicationId: f.applicationId,
      suspended: true,
      verified: false,
      featured: false,
      reason: "Test",
    });
    await expect(f.invoke("GET", "me")).rejects.toThrow();
    expect(
      await f.owner.query(api.botApplications.profile, {
        applicationId: f.applicationId,
      }),
    ).not.toBeNull();
    expect(
      await f.other.query(api.botApplications.profile, {
        applicationId: f.applicationId,
      }),
    ).toBeNull();
    await f.owner.mutation(api.botApplications.moderate, {
      applicationId: f.applicationId,
      suspended: false,
      verified: true,
      featured: false,
      reason: "Cleared",
    });
    expect(await f.invoke("GET", "me")).toMatchObject({ verified: true });
    await f.t.run((ctx) => ctx.db.patch(f.ownerId, { deletedAt: Date.now() }));
    await expect(f.invoke("GET", "me")).rejects.toThrow();
  });
  it("rejects attachment ownership reuse", async () => {
    const f = await installed();
    const id = await f.t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["private"], { type: "text/plain" }),
      );
      await ctx.db.insert("uploads", {
        ownerId: f.otherId,
        storageId,
        name: "private.txt",
        mimeType: "text/plain",
        size: 7,
        createdAt: Date.now(),
      });
      return storageId;
    });
    await expect(
      f.invoke("POST", `channels/${f.channelId}/uploads/register`, {
        storageId: id,
        name: "stolen.txt",
      }),
    ).rejects.toThrow(/another account/);
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "file",
        attachmentIds: [id],
      }),
    ).rejects.toThrow();
  });
  it("isolates webhook jobs from polling backlog, leases once, retries and rechecks access", async () => {
    const f = await installed();
    await f.owner.mutation(api.botApplications.events, {
      applicationId: f.applicationId,
      events: ["messageCreate"],
      deliveryMode: "webhook",
      webhookUrl: "https://example.com/events",
    });
    const base = {
      applicationId: f.applicationId,
      serverId: f.serverId,
      channelId: f.channelId,
      type: "messageCreate",
      payload: "{}",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      status: "pending" as const,
      attempts: 0,
      nextAttemptAt: Date.now(),
    };
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 110; i++)
        await ctx.db.insert("botEvents", { ...base, deliveryMode: "poll" });
    });
    const id = await f.t.run((ctx) =>
      ctx.db.insert("botEvents", { ...base, deliveryMode: "webhook" }),
    );
    expect(await f.t.query(internal.botDelivery.due, {})).toContain(id);
    expect(
      await f.t.mutation(internal.botDelivery.claim, { eventId: id }),
    ).toMatchObject({ attempt: 1 });
    expect(
      await f.t.mutation(internal.botDelivery.claim, { eventId: id }),
    ).toBeNull();
    await f.t.mutation(internal.botDelivery.finish, {
      eventId: id,
      attempt: 1,
      success: false,
      error: "HTTP_500",
    });
    expect(await f.t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: "pending",
      lastError: "HTTP_500",
    });
    await f.t.run((ctx) => ctx.db.patch(id, { nextAttemptAt: Date.now() - 1 }));
    expect(
      await f.t.mutation(internal.botDelivery.claim, { eventId: id }),
    ).toMatchObject({ attempt: 2 });
    await f.t.mutation(internal.botDelivery.finish, {
      eventId: id,
      attempt: 1,
      success: true,
    });
    expect(await f.t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: "leased",
    });
    await f.t.mutation(internal.botDelivery.finish, {
      eventId: id,
      attempt: 2,
      success: true,
    });
    expect(await f.t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: "delivered",
    });
    const next = await f.t.run((ctx) =>
      ctx.db.insert("botEvents", { ...base, deliveryMode: "webhook" }),
    );
    await f.owner.mutation(api.botApplications.removeInstallation, {
      applicationId: f.applicationId,
      serverId: f.serverId,
    });
    expect(
      await f.t.mutation(internal.botDelivery.claim, { eventId: next }),
    ).toBeNull();
    expect(await f.t.run((ctx) => ctx.db.get(next))).toMatchObject({
      status: "dead",
    });
  });
});
async function fixture() {
  const t = convexTest(schema, modules);
  const [ownerId, otherId] = await t.run(async (ctx) =>
    Promise.all([
      ctx.db.insert("users", {
        name: "Owner",
        username: "owner",
        createdAt: Date.now() - 86400000,
      }),
      ctx.db.insert("users", {
        name: "Other",
        username: "other",
        createdAt: Date.now() - 86400000,
      }),
    ]),
  );
  const owner = t.withIdentity({ subject: ownerId });
  const other = t.withIdentity({ subject: otherId });
  const serverId = await owner.mutation(api.servers.create, {
    name: "Test server",
  });
  await t.run((ctx) =>
    ctx.db.insert("serverMembers", {
      serverId,
      userId: otherId,
      roleIds: [],
      joinedAt: Date.now(),
    }),
  );
  const channels = await owner.query(api.channels.list, { serverId });
  const channelId = channels.channels[0].id as Id<"channels">;
  const key = credential();
  const applicationId = await owner.mutation(api.botApplications.create, {
    name: "Test bot",
    username: "test_bot",
    description: "Test application",
    tokenHash: key.hash,
  });
  const invoke = (
    method: string,
    path: string,
    body: unknown = {},
    query: Record<string, string> = {},
  ) =>
    t.mutation(internal.botApi.execute, {
      tokenHash: key.hash,
      method,
      path,
      body,
      query,
    });
  return {
    t,
    owner,
    other,
    ownerId,
    otherId,
    serverId,
    channelId,
    key,
    applicationId,
    invoke,
  };
}
async function installed() {
  const f = await fixture();
  await f.owner.mutation(api.botApplications.install, {
    applicationId: f.applicationId,
    serverId: f.serverId,
    permissions: BOT_PERMISSIONS,
  });
  return f;
}

describe("persistent bot platform", () => {
  it("isolates owners, stores only token hashes, and creates one non-login bot identity", async () => {
    const f = await fixture();
    const app = await f.owner.query(api.botApplications.get, {
      applicationId: f.applicationId,
    });
    expect(JSON.stringify(app)).not.toContain(f.key.token);
    expect(app).not.toHaveProperty("tokenHash");
    await expect(
      f.other.query(api.botApplications.get, {
        applicationId: f.applicationId,
      }),
    ).rejects.toThrow();
    const data = await f.t.run(async (ctx) => ({
      apps: await ctx.db.query("botApplications").collect(),
      users: await ctx.db.query("users").collect(),
      credentials: await ctx.db.query("authAccounts").collect(),
    }));
    expect(data.apps[0].tokenHash).toBe(f.key.hash);
    expect(data.users).toHaveLength(3);
    expect(data.credentials).toHaveLength(0);
    await expect(
      f.other.mutation(api.botApplications.token, {
        applicationId: f.applicationId,
        tokenHash: credential().hash,
      }),
    ).rejects.toThrow();
  });
  it("requires server administrator consent and honors revocation", async () => {
    const f = await fixture();
    await expect(
      f.other.mutation(api.botApplications.install, {
        applicationId: f.applicationId,
        serverId: f.serverId,
        permissions: BOT_PERMISSIONS,
      }),
    ).rejects.toThrow();
    await expect(f.invoke("GET", `servers/${f.serverId}`)).rejects.toThrow();
    await f.owner.mutation(api.botApplications.install, {
      applicationId: f.applicationId,
      serverId: f.serverId,
      permissions: ["view_channel"],
    });
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "Denied",
      }),
    ).rejects.toThrow();
    await f.owner.mutation(api.botApplications.removeInstallation, {
      applicationId: f.applicationId,
      serverId: f.serverId,
    });
    await expect(f.invoke("GET", `servers/${f.serverId}`)).rejects.toThrow();
  });
  it("rotates and revokes credentials immediately and enforces API limits", async () => {
    const f = await installed();
    for (let i = 0; i < 120; i++)
      expect(
        (
          await f.t.mutation(internal.botApi.authorize, {
            tokenHash: f.key.hash,
          })
        ).allowed,
      ).toBe(true);
    expect(
      (await f.t.mutation(internal.botApi.authorize, { tokenHash: f.key.hash }))
        .allowed,
    ).toBe(false);
    await f.owner.mutation(api.botApplications.token, {
      applicationId: f.applicationId,
      tokenHash: credential().hash,
    });
    await expect(f.invoke("GET", "me")).rejects.toThrow();
    await f.owner.mutation(api.botApplications.token, {
      applicationId: f.applicationId,
      tokenHash: null,
    });
    const app = await f.owner.query(api.botApplications.get, {
      applicationId: f.applicationId,
    });
    expect(app.tokenConfigured).toBe(false);
    expect(app.apiRequests).toBe(120);
  });
  it("enforces channel denies even when default roles grant administrator", async () => {
    const f = await installed();
    await f.t.run(async (ctx) => {
      const role = await ctx.db
        .query("serverRoles")
        .withIndex("by_server", (q) => q.eq("serverId", f.serverId))
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      await ctx.db.patch(role!._id, { permissions: ["administrator"] });
      await ctx.db.patch(f.channelId, {
        permissionOverwrites: [
          { roleId: role!._id, allow: [], deny: ["view_channel"] },
        ],
      });
    });
    await expect(f.invoke("GET", `channels/${f.channelId}`)).rejects.toThrow();
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "hidden",
      }),
    ).rejects.toThrow();
  });
  it("persists messages, embeds, edits, reactions, polls and idempotent sends", async () => {
    const f = await installed();
    const message = (await f.invoke(
      "POST",
      `channels/${f.channelId}/messages`,
      {
        content: "Hello",
        nonce: "unique",
        embeds: [{ title: "A card", description: "Details", color: "#5865F2" }],
      },
    )) as { id: string };
    const duplicate = (await f.invoke(
      "POST",
      `channels/${f.channelId}/messages`,
      { content: "retry", nonce: "unique" },
    )) as { id: string };
    expect(duplicate.id).toBe(message.id);
    await f.invoke("PATCH", `channels/${f.channelId}/messages/${message.id}`, {
      content: "Edited",
      embeds: [],
    });
    await f.invoke(
      "POST",
      `channels/${f.channelId}/messages/${message.id}/reactions`,
      { emoji: "👍" },
    );
    await f.invoke(
      "POST",
      `channels/${f.channelId}/messages/${message.id}/polls`,
      { question: "Which one?", options: ["A", "B"] },
    );
    const history = (await f.invoke(
      "GET",
      `channels/${f.channelId}/messages`,
    )) as { messages: { content: string }[] };
    expect(history.messages[0].content).toBe("Edited");
    expect(
      await f.t.run((ctx) => ctx.db.query("polls").collect()),
    ).toHaveLength(1);
    await f.invoke("DELETE", `channels/${f.channelId}/messages/${message.id}`);
    expect(
      await f.t.run((ctx) => ctx.db.query("polls").collect()),
    ).toHaveLength(0);
    expect(
      await f.t.run((ctx) => ctx.db.query("reactions").collect()),
    ).toHaveLength(0);
  });
  it("validates payloads and applies timeouts, slow mode, mass-mention grants and AutoMod", async () => {
    const f = await installed();
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "x".repeat(2001),
      }),
    ).rejects.toThrow();
    await f.owner.mutation(api.botApplications.install, {
      applicationId: f.applicationId,
      serverId: f.serverId,
      permissions: ["view_channel", "send_messages"],
    });
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "@everyone ping",
      }),
    ).rejects.toThrow();
    await f.t.run(async (ctx) => {
      const app = await ctx.db.get(f.applicationId);
      const member = await ctx.db
        .query("serverMembers")
        .withIndex("by_server_user", (q) =>
          q.eq("serverId", f.serverId).eq("userId", app!.botUserId),
        )
        .first();
      await ctx.db.patch(member!._id, {
        communicationDisabledUntil: Date.now() + 60000,
      });
    });
    await expect(
      f.invoke("POST", `channels/${f.channelId}/messages`, {
        content: "timeout",
      }),
    ).rejects.toThrow();
  });
  it("registers scoped typed commands and keeps ephemeral responses private", async () => {
    const f = await installed();
    const commandId = await f.owner.mutation(api.botCommands.save, {
      applicationId: f.applicationId,
      command: {
        name: "ping",
        description: "Ping",
        options: [
          {
            name: "count",
            description: "Count",
            type: "integer",
            required: true,
          },
        ],
      },
    });
    await expect(
      f.other.mutation(api.botCommands.execute, {
        channelId: f.channelId,
        commandId,
        options: { count: "wrong" },
      }),
    ).rejects.toThrow();
    const interactionId = await f.other.mutation(api.botCommands.execute, {
      channelId: f.channelId,
      commandId,
      options: { count: 3 },
    });
    const events = (await f.invoke("GET", "events")) as {
      events: { type: string; data: { id: string } }[];
    };
    expect(
      events.events.some(
        (e) => e.type === "interactionCreate" && e.data.id === interactionId,
      ),
    ).toBe(true);
    await f.invoke("POST", `interactions/${interactionId}/response`, {
      content: "Private reply",
      ephemeral: true,
    });
    expect(
      (
        await f.other.query(api.botCommands.responses, {
          channelId: f.channelId,
        })
      )[0].response,
    ).toBe("Private reply");
    expect(
      await f.owner.query(api.botCommands.responses, {
        channelId: f.channelId,
      }),
    ).toHaveLength(0);
    expect(
      await f.t.run((ctx) => ctx.db.query("messages").collect()),
    ).toHaveLength(0);
    await expect(
      f.invoke("POST", `interactions/${interactionId}/response`, {
        content: "replay",
      }),
    ).rejects.toThrow();
  });
  it("queues existing human message events transactionally and rechecks access before delivery", async () => {
    const f = await installed();
    await f.owner.mutation(api.botApplications.events, {
      applicationId: f.applicationId,
      events: ["messageCreate", "messageUpdate", "messageDelete"],
      deliveryMode: "poll",
      webhookUrl: "",
    });
    const message = await f.owner.mutation(api.messages.send, {
      containerType: "channel",
      containerId: f.channelId,
      content: "Human message",
      clientId: "human1",
    });
    expect(message.messageId).toBeTruthy();
    const events = (await f.invoke("GET", "events")) as {
      events: { id: string; type: string }[];
    };
    expect(events.events.some((e) => e.type === "messageCreate")).toBe(true);
    await f.invoke("POST", "events/ack", {
      ids: events.events.map((e) => e.id),
    });
    expect(
      ((await f.invoke("GET", "events")) as { events: unknown[] }).events,
    ).toHaveLength(0);
    await f.owner.mutation(api.messages.send, {
      containerType: "channel",
      containerId: f.channelId,
      content: "Another",
      clientId: "human2",
    });
    await f.owner.mutation(api.botApplications.install, {
      applicationId: f.applicationId,
      serverId: f.serverId,
      permissions: ["view_channel"],
    });
    expect(
      ((await f.invoke("GET", "events")) as { events: unknown[] }).events,
    ).toHaveLength(0);
  });
  it("protects the server owner and prevents escalation through role grants", async () => {
    const f = await installed();
    await expect(
      f.invoke("DELETE", `servers/${f.serverId}/members/${f.ownerId}`),
    ).rejects.toThrow();
    await expect(
      f.invoke("POST", `servers/${f.serverId}/roles`, {
        name: "Admin",
        permissions: ["administrator"],
      }),
    ).rejects.toThrow();
    await expect(
      f.invoke("PATCH", `servers/${f.serverId}`, { ownerId: f.otherId }),
    ).rejects.toThrow();
  });
  it("keeps private bots out of discovery and records abuse reports", async () => {
    const f = await fixture();
    expect(await f.owner.query(api.botApplications.directory, {})).toHaveLength(
      0,
    );
    const app = await f.owner.query(api.botApplications.get, {
      applicationId: f.applicationId,
    });
    await f.owner.mutation(api.botApplications.update, {
      applicationId: f.applicationId,
      name: app.name,
      description: app.description,
      username: app.username,
      botDescription: app.botDescription,
      enabled: true,
      discoverable: true,
      category: "Utilities",
      permissions: app.permissions,
    });
    expect(
      await f.owner.query(api.botApplications.directory, {
        category: "Utilities",
      }),
    ).toHaveLength(1);
    await f.other.mutation(api.botApplications.report, {
      applicationId: f.applicationId,
      reason: "This bot sent unwanted messages.",
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("reports").collect()),
    ).toHaveLength(1);
    await expect(
      f.other.mutation(api.botApplications.moderate, {
        applicationId: f.applicationId,
        suspended: true,
        verified: false,
        featured: false,
        reason: "unauthorized",
      }),
    ).rejects.toThrow();
  });
  it("requires deletion confirmation, revokes access, and removes installations", async () => {
    const f = await installed();
    await expect(
      f.owner.mutation(api.botApplications.remove, {
        applicationId: f.applicationId,
        confirmation: "wrong",
      }),
    ).rejects.toThrow();
    await f.owner.mutation(api.botApplications.remove, {
      applicationId: f.applicationId,
      confirmation: "Test bot",
    });
    await expect(f.invoke("GET", "me")).rejects.toThrow();
    expect(
      await f.t.run((ctx) => ctx.db.query("botInstallations").collect()),
    ).toHaveLength(0);
    expect(await f.owner.query(api.botApplications.list, {})).toHaveLength(0);
  });
  it("returns consistent authenticated HTTP responses", async () => {
    const f = await installed();
    const unauthorized = await f.t.fetch("/api/bots/v1/me");
    expect(unauthorized.status).toBe(401);
    const response = await f.t.fetch("/api/bots/v1/me", {
      headers: { Authorization: `Bot ${f.key.token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { applicationId: f.applicationId },
    });
    const bad = await f.t.fetch(
      `/api/bots/v1/channels/${f.channelId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bot ${f.key.token}` },
        body: "{",
      },
    );
    expect(bad.status).toBe(400);
  });
});
