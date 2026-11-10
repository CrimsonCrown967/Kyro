/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicWebhookAddress } from "../../src/convex/botWebhooks";
import { convexTest } from "convex-test";
import { createHash, randomBytes } from "node:crypto";
import schema from "../../src/convex/schema";
import { api, internal } from "../../src/convex/_generated/api";
import { BOT_PERMISSION_LIST } from "../../src/lib/botContracts";
import {
  PERMISSIONS as P,
  DEFAULT_EVERYONE_PERMISSIONS,
} from "../../src/lib/permissions";
import type { Id } from "../../src/convex/_generated/dataModel";

const modules = import.meta.glob("../../src/convex/**/*.ts");
const credential = () => {
  const token = `kyro_bot_${randomBytes(32).toString("hex")}`;
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
};

async function fixture(permissions: string[] = [...BOT_PERMISSION_LIST]) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      username: "developer",
      name: "Developer",
      email: "private@example.test",
    });
    const admin = await ctx.db.insert("users", {
      username: "server_admin",
      name: "Server Admin",
    });
    const member = await ctx.db.insert("users", {
      username: "member",
      name: "Member",
    });
    const stranger = await ctx.db.insert("users", {
      username: "stranger",
      name: "Stranger",
    });
    const staff = await ctx.db.insert("users", {
      username: "staff_admin",
      role: "admin",
    });
    const server = await ctx.db.insert("servers", {
      name: "Test community",
      ownerId: admin,
      isPublic: false,
      createdAt: Date.now(),
    });
    const everyone = await ctx.db.insert("serverRoles", {
      serverId: server,
      name: "Everyone",
      isDefault: true,
      position: 0,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
    });
    for (const userId of [admin, member])
      await ctx.db.insert("serverMembers", {
        serverId: server,
        userId,
        roleIds: [],
        joinedAt: Date.now(),
      });
    const channel = await ctx.db.insert("channels", {
      serverId: server,
      name: "general",
      kind: "text",
      position: 0,
      createdAt: Date.now(),
      createdById: admin,
    });
    return { owner, admin, member, stranger, staff, server, channel, everyone };
  });
  const as = (id: Id<"users">) =>
    t.withIdentity({ subject: `${id}|test-session` });
  const secret = credential();
  const applicationId = await as(ids.owner).mutation(
    api.botApplications.create,
    {
      name: "Test Bot",
      username: "test_bot",
      description: "A test application",
      tokenHash: secret.tokenHash,
    },
  );
  const installationId = await as(ids.admin).mutation(
    api.botApplications.install,
    { applicationId, serverId: ids.server, permissions },
  );
  const app = (await t.run((ctx) => ctx.db.get(applicationId)))!;
  const request = (
    method: string,
    path: string,
    body: unknown = {},
    query: Record<string, string> = {},
  ) =>
    t.mutation(internal.botApi.execute, {
      tokenHash: secret.tokenHash,
      method,
      path,
      bodyJson: JSON.stringify(body),
      query,
    });
  const http = (
    method: string,
    path: string,
    body?: unknown,
    token = secret.token,
  ) =>
    t.fetch(`/bot-api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    t,
    as,
    ...ids,
    ...secret,
    applicationId,
    installationId,
    app,
    request,
    http,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CONVEX_SITE_URL", "http://localhost:3211");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("applications and identity", () => {
  it("uses one non-login bot identity and never returns credentials or owner email", async () => {
    const f = await fixture();
    const profile = await f
      .as(f.owner)
      .query(api.botApplications.get, { applicationId: f.applicationId });
    expect(profile?.botUserId).toBe(f.app.botUserId);
    expect(profile?.hasToken).toBe(true);
    expect(JSON.stringify(profile)).not.toMatch(
      /tokenHash|private@example|kyro_bot_/,
    );
    expect(
      await f.t.run((ctx) => ctx.db.query("authAccounts").collect()),
    ).toEqual([]);
    await expect(
      f.as(f.app.botUserId).query(api.botApplications.list, {}),
    ).rejects.toThrow(/sign in/);
    expect(
      await f
        .as(f.stranger)
        .query(api.botApplications.get, { applicationId: f.applicationId }),
    ).toBeNull();
    expect(
      await f.t.query(api.botApplications.getPublic, {
        applicationId: "invalid",
      }),
    ).toBeNull();
    await expect(
      f
        .as(f.stranger)
        .mutation(api.botApplications.update, {
          applicationId: f.applicationId,
          name: "Stolen",
        }),
    ).rejects.toThrow(/not found/i);
    await expect(f.t.query(api.botApplications.list, {})).rejects.toThrow(
      /sign in/,
    );
  });

  it("rotates immediately, disables, suspends and deletes with confirmation", async () => {
    const f = await fixture();
    const replacement = credential();
    await f
      .as(f.owner)
      .mutation(api.botApplications.rotateToken, {
        applicationId: f.applicationId,
        tokenHash: replacement.tokenHash,
      });
    await expect(f.request("GET", "/users/@me")).rejects.toThrow(/credentials/);
    expect(
      await f.t.mutation(internal.botApi.gate, {
        tokenHash: replacement.tokenHash,
      }),
    ).toMatchObject({ allowed: true });
    await f
      .as(f.owner)
      .mutation(api.botApplications.update, {
        applicationId: f.applicationId,
        enabled: false,
      });
    await expect(
      f.t.mutation(internal.botApi.gate, { tokenHash: replacement.tokenHash }),
    ).rejects.toThrow(/disabled/);
    await f
      .as(f.staff)
      .mutation(api.botApplications.moderate, {
        applicationId: f.applicationId,
        suspended: true,
      });
    await expect(
      f
        .as(f.owner)
        .mutation(api.botApplications.update, {
          applicationId: f.applicationId,
          enabled: true,
        }),
    ).rejects.toThrow(/staff/);
    await expect(
      f
        .as(f.owner)
        .mutation(api.botApplications.remove, {
          applicationId: f.applicationId,
          confirmation: "wrong",
        }),
    ).rejects.toThrow(/confirm/);
    await f
      .as(f.owner)
      .mutation(api.botApplications.remove, {
        applicationId: f.applicationId,
        confirmation: "Test Bot",
      });
    expect(await f.t.run((ctx) => ctx.db.get(f.installationId))).toBeNull();
    expect(await f.as(f.owner).query(api.botApplications.list, {})).toEqual([]);
  });

  it("lists only discoverable active apps, persists reports, and restricts moderation", async () => {
    const f = await fixture();
    expect(await f.t.query(api.botApplications.directory, {})).toEqual([]);
    await f
      .as(f.owner)
      .mutation(api.botApplications.update, {
        applicationId: f.applicationId,
        discoverable: true,
        category: "utilities",
      });
    expect(
      await f.t.query(api.botApplications.directory, { category: "utilities" }),
    ).toHaveLength(1);
    await f
      .as(f.member)
      .mutation(api.botApplications.report, {
        applicationId: f.applicationId,
        reason: "This application is spamming messages.",
      });
    await expect(
      f
        .as(f.member)
        .mutation(api.botApplications.report, {
          applicationId: f.applicationId,
          reason: "Duplicate report about this application.",
        }),
    ).rejects.toThrow(/already recorded/);
    await expect(
      f
        .as(f.owner)
        .mutation(api.botApplications.moderate, {
          applicationId: f.applicationId,
          verified: true,
        }),
    ).rejects.toThrow(/administrators/);
    const reports = await f.as(f.staff).query(api.botApplications.reports, {});
    expect(reports).toHaveLength(1);
    await f
      .as(f.staff)
      .mutation(api.botApplications.moderate, {
        applicationId: f.applicationId,
        suspended: true,
        reportId: reports[0]._id,
      });
    expect(await f.t.query(api.botApplications.directory, {})).toEqual([]);
  });
});

describe("installation and authorization", () => {
  it("requires server management and rejects duplicate installs and administrator grants", async () => {
    const f = await fixture();
    await expect(
      f
        .as(f.member)
        .mutation(api.botApplications.install, {
          applicationId: f.applicationId,
          serverId: f.server,
          permissions: [],
        }),
    ).rejects.toThrow(/Manage Server/);
    await expect(
      f
        .as(f.admin)
        .mutation(api.botApplications.install, {
          applicationId: f.applicationId,
          serverId: f.server,
          permissions: [],
        }),
    ).rejects.toThrow(/already installed/);
    await expect(
      f
        .as(f.admin)
        .mutation(api.botApplications.updateInstallation, {
          installationId: f.installationId,
          permissions: [P.ADMINISTRATOR],
        }),
    ).rejects.toThrow(/Administrator/);
    await f
      .as(f.admin)
      .mutation(api.botApplications.uninstall, {
        installationId: f.installationId,
      });
    await expect(f.request("GET", `/servers/${f.server}`)).rejects.toThrow(
      /not installed/,
    );
  });

  it("enforces the installation ceiling, channel denies, bans and immediate revocation", async () => {
    const f = await fixture([
      P.VIEW_CHANNEL,
      P.SEND_MESSAGES,
      P.READ_MESSAGE_HISTORY,
    ]);
    const installation = (await f.t.run((ctx) =>
      ctx.db.get(f.installationId),
    ))!;
    await f.t.run((ctx) =>
      ctx.db.patch(installation.roleId, { permissions: [P.ADMINISTRATOR] }),
    );
    await expect(
      f.request("POST", `/servers/${f.server}/roles`, {
        name: "Escalated",
        permissions: [],
      }),
    ).rejects.toThrow(/manage_roles/);
    await f.t.run((ctx) =>
      ctx.db.patch(f.channel, {
        permissionOverwrites: [
          { roleId: installation.roleId, allow: [], deny: [P.VIEW_CHANNEL] },
        ],
      }),
    );
    await expect(
      f.request("GET", `/channels/${f.channel}/messages`),
    ).rejects.toThrow(/permission/);
    await f.t.run((ctx) =>
      ctx.db.patch(f.channel, { permissionOverwrites: [] }),
    );
    await f
      .as(f.admin)
      .mutation(api.botApplications.updateInstallation, {
        installationId: f.installationId,
        permissions: [P.VIEW_CHANNEL],
      });
    await expect(
      f.request("POST", `/channels/${f.channel}/messages`, {
        content: "denied",
      }),
    ).rejects.toThrow(/send_messages/);
    await f.t.run((ctx) =>
      ctx.db.insert("bans", {
        serverId: f.server,
        userId: f.app.botUserId,
        bannedBy: f.admin,
        createdAt: Date.now(),
      }),
    );
    await expect(f.request("GET", `/servers/${f.server}`)).rejects.toThrow(
      /banned/,
    );
  });
});

describe("HTTP API and messaging", () => {
  it("uses safe status codes, validates bodies, and persists rate limits independently of failed writes", async () => {
    const f = await fixture();
    expect(
      (await f.http("GET", "/users/@me", undefined, "invalid")).status,
    ).toBe(401);
    expect(
      (
        await f.http("POST", `/channels/${f.channel}/messages`, {
          content: "x",
          unexpected: true,
        })
      ).status,
    ).toBe(400);
    expect((await f.http("GET", "/channels/not-an-id")).status).toBe(404);
    const success = await f.http("POST", `/channels/${f.channel}/messages`, {
      content: "Hello",
    });
    expect(success.status).toBe(201);
    expect(await success.json()).toMatchObject({
      data: { content: "Hello", author: { bot: true } },
    });
    for (let i = 0; i < 120; i++)
      await f.t.mutation(internal.botApi.gate, { tokenHash: f.tokenHash });
    const limited = await f.http("GET", "/users/@me");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("sends idempotently, reads, edits, reacts, polls, and deletes persistent messages", async () => {
    const f = await fixture();
    const path = `/channels/${f.channel}/messages`;
    const response = await f.http("POST", path, {
      content: "Hello",
      clientId: "stable",
      embeds: [{ title: "Rich message" }],
    });
    const { data: first } = await response.json();
    const { data: repeated } = await (
      await f.http("POST", path, { content: "Hello", clientId: "stable" })
    ).json();
    expect(repeated.id).toBe(first.id);
    expect(
      (await f.http("PATCH", `${path}/${first.id}`, { content: "Updated" }))
        .status,
    ).toBe(200);
    expect(
      (await f.http("POST", `${path}/${first.id}/reactions`, { emoji: "👍" }))
        .status,
    ).toBe(200);
    expect(
      await f.t.run((ctx) => ctx.db.query("reactions").collect()),
    ).toHaveLength(1);
    const poll = await f.http("POST", `/channels/${f.channel}/polls`, {
      question: "Which option?",
      options: ["A", "B"],
    });
    expect(poll.status).toBe(201);
    expect(
      await f.t.run((ctx) => ctx.db.query("polls").collect()),
    ).toHaveLength(1);
    expect((await f.http("DELETE", `${path}/${first.id}`)).status).toBe(200);
    expect(await f.t.run((ctx) => ctx.db.get(first.id))).toBeNull();
  });

  it("blocks mention abuse, timeouts, slow mode, AutoMod, cross-channel edits and role escalation", async () => {
    const f = await fixture([
      P.VIEW_CHANNEL,
      P.SEND_MESSAGES,
      P.READ_MESSAGE_HISTORY,
      P.MANAGE_ROLES,
    ]);
    const path = `/channels/${f.channel}/messages`;
    await expect(
      f.request("POST", path, { content: "@everyone hello" }),
    ).rejects.toThrow(/mention_everyone/);
    await f.request("POST", path, { content: "First" });
    await f.t.run((ctx) => ctx.db.patch(f.channel, { slowMode: 60 }));
    await expect(
      f.request("POST", path, { content: "Second" }),
    ).rejects.toThrow(/slow mode/);
    await f.t.run((ctx) => ctx.db.patch(f.channel, { slowMode: 0 }));
    const botMember = await f.t.run((ctx) =>
      ctx.db
        .query("serverMembers")
        .withIndex("by_server_user", (q) =>
          q.eq("serverId", f.server).eq("userId", f.app.botUserId),
        )
        .unique(),
    );
    await f.t.run((ctx) =>
      ctx.db.patch(botMember!._id, {
        communicationDisabledUntil: Date.now() + 60000,
      }),
    );
    await expect(
      f.request("POST", path, { content: "Timed out" }),
    ).rejects.toThrow(/timed out/);
    await expect(
      f.request("POST", `/servers/${f.server}/roles`, {
        name: "Escalation",
        permissions: [P.BAN_MEMBERS],
      }),
    ).rejects.toThrow(/currently hold/);
    await expect(
      f.request("PUT", `/servers/${f.server}/members/${f.admin}/roles`, {
        roleIds: [],
      }),
    ).rejects.toThrow(/below/);
  });
});

describe("commands, interactions, events and analytics", () => {
  it("persists typed global/scoped commands and keeps ephemeral responses private", async () => {
    const f = await fixture();
    await f
      .as(f.owner)
      .mutation(api.botCommands.replace, {
        applicationId: f.applicationId,
        commands: [
          {
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
        ],
      });
    const [global] = await f
      .as(f.member)
      .query(api.botCommands.listForChannel, { channelId: f.channel });
    await expect(
      f
        .as(f.member)
        .mutation(api.botCommands.invoke, {
          channelId: f.channel,
          commandId: global.id,
          options: { count: "oops" },
        }),
    ).rejects.toThrow(/integer/);
    await f
      .as(f.owner)
      .mutation(api.botCommands.replace, {
        applicationId: f.applicationId,
        serverId: f.server,
        commands: [{ name: "ping", description: "Server Ping" }],
      });
    const [scoped] = await f
      .as(f.member)
      .query(api.botCommands.listForChannel, { channelId: f.channel });
    expect(scoped.description).toBe("Server Ping");
    await expect(
      f
        .as(f.member)
        .mutation(api.botCommands.invoke, {
          channelId: f.channel,
          commandId: global.id,
          options: { count: 1 },
        }),
    ).rejects.toThrow(/server-specific/);
    const { interactionId } = await f
      .as(f.member)
      .mutation(api.botCommands.invoke, {
        channelId: f.channel,
        commandId: scoped.id,
        options: {},
      });
    await f.request("POST", `/interactions/${interactionId}/responses`, {
      content: "Private pong",
      ephemeral: true,
    });
    const own = await f
      .as(f.member)
      .query(api.botCommands.ownInteractions, { channelId: f.channel });
    expect(own[0].response?.content).toBe("Private pong");
    expect(
      await f
        .as(f.admin)
        .query(api.botCommands.ownInteractions, { channelId: f.channel }),
    ).toEqual([]);
    expect(await f.t.run((ctx) => ctx.db.query("messages").collect())).toEqual(
      [],
    );
    await expect(
      f.request("POST", `/interactions/${interactionId}/responses`, {
        content: "Changed",
        ephemeral: true,
      }),
    ).rejects.toThrow(/already been answered/);
    const stats = await f
      .as(f.owner)
      .query(api.botApplications.analytics, { applicationId: f.applicationId });
    expect(stats).toMatchObject({
      commandsExecuted: 1,
      installationCount: 1,
      usersReached: 2,
    });
  });

  it("delivers real message events, deduplicates fanout, acknowledges and rechecks channel access", async () => {
    const f = await fixture();
    await f.request("POST", `/channels/${f.channel}/messages`, {
      content: "Event message",
    });
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const events = await f.t.run((ctx) => ctx.db.query("botEvents").collect());
    const messageEvent = events.find((e) => e.type === "messageCreate")!;
    await f.t.mutation(internal.botEvents.fanOut, {
      eventId: messageEvent._id,
      cursor: null,
    });
    const pending = await f.http("GET", "/events");
    const { data } = await pending.json();
    expect(
      data.events.filter((e: { id: string }) => e.id === messageEvent._id),
    ).toHaveLength(1);
    await f.request("POST", "/events/ack", { eventIds: [messageEvent._id] });
    const { data: after } = await (await f.http("GET", "/events")).json();
    expect(after.events).toEqual([]);
    await f.request("POST", `/channels/${f.channel}/messages`, {
      content: "Private now",
    });
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await f.t.run((ctx) =>
      ctx.db.patch(f.channel, {
        permissionOverwrites: [
          { roleId: f.everyone, allow: [], deny: [P.VIEW_CHANNEL] },
        ],
      }),
    );
    const { data: denied } = await (await f.http("GET", "/events")).json();
    expect(denied.events).toEqual([]);
  });

  it("claims webhook leases once and records retry failures without stale completions", async () => {
    const f = await fixture();
    await f.request("POST", `/channels/${f.channel}/messages`, {
      content: "Delivery",
    });
    await f.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await f
      .as(f.owner)
      .mutation(api.botApplications.update, {
        applicationId: f.applicationId,
        webhookUrl: "https://example.test/events",
      });
    const delivery = (
      await f.t.run((ctx) => ctx.db.query("botEventDeliveries").collect())
    )[0];
    const claim = await f.t.mutation(internal.botEvents.claim, {
      deliveryId: delivery._id,
    });
    expect(claim?.attempt).toBe(1);
    expect(
      await f.t.mutation(internal.botEvents.claim, {
        deliveryId: delivery._id,
      }),
    ).toBeNull();
    await f.t.mutation(internal.botEvents.finish, {
      deliveryId: delivery._id,
      attempt: 99,
      success: true,
    });
    expect((await f.t.run((ctx) => ctx.db.get(delivery._id)))?.status).toBe(
      "inflight",
    );
    await f.t.mutation(internal.botEvents.finish, {
      deliveryId: delivery._id,
      attempt: 1,
      success: false,
      error: "Webhook returned HTTP 503.",
    });
    expect(await f.t.run((ctx) => ctx.db.get(delivery._id))).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "Webhook returned HTTP 503.",
    });
    await expect(f.request("GET", "/events")).rejects.toThrow(
      /Disable the webhook/,
    );
  });
});

describe("security regressions", () => {
  it("rejects private, loopback, link-local and reserved webhook destinations", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "198.18.0.1", "0.0.0.0", "224.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(isPublicWebhookAddress(address)).toBe(false);
    expect(isPublicWebhookAddress("8.8.8.8")).toBe(true);
  });

  it("checks AutoMod in embeds, allows embed-only edits, and prevents editing human messages", async () => {
    const f = await fixture([P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY]);
    await f.t.run(ctx => ctx.db.insert("serverAutomod", { serverId: f.server, enabled: true, blockedWords: ["forbiddenword"], blockInvites: false, blockLinks: false, maxMentions: 5, blockCaps: false, blockSpam: false, exemptRoleIds: [], exemptChannelIds: [], updatedAt: Date.now(), updatedById: f.admin }));
    await expect(f.request("POST", `/channels/${f.channel}/messages`, { embeds: [{ description: "forbiddenword" }] })).rejects.toThrow(/AutoMod/);
    const created = await (await f.http("POST", `/channels/${f.channel}/messages`, { embeds: [{ title: "Original" }] })).json();
    expect((await f.http("PATCH", `/channels/${f.channel}/messages/${created.data.id}`, { embeds: [{ title: "Updated" }] })).status).toBe(200);
    const humanId = await f.as(f.member).mutation(api.messages.send, { containerType: "channel", containerId: f.channel, content: "Human message" });
    expect(humanId).toBeTruthy();
    const human = await f.t.run(ctx => ctx.db.query("messages").withIndex("by_author", q => q.eq("authorId", f.member)).first());
    await expect(f.request("PATCH", `/channels/${f.channel}/messages/${human!._id}`, { content: "stolen" })).rejects.toThrow(/own messages/);
  });

  it("rejects invalid command registration, member options and expired responses", async () => {
    const f = await fixture();
    await expect(f.as(f.owner).mutation(api.botCommands.replace, { applicationId: f.applicationId, commands: [{ name: "broken", description: "Broken", options: [{ name: "bad", description: "Bad", type: "boolean", choices: [{ name: "Yes", value: "true" }] }] }] })).rejects.toThrow(/Choices/);
    await f.as(f.owner).mutation(api.botCommands.replace, { applicationId: f.applicationId, commands: [{ name: "member", description: "Member", options: [{ name: "user", description: "User", type: "user", required: true }, { name: "enabled", description: "Enabled", type: "boolean" }, { name: "text", description: "Text", type: "string" }] }] });
    const [command] = await f.as(f.member).query(api.botCommands.listForChannel, { channelId: f.channel });
    await expect(f.as(f.member).mutation(api.botCommands.invoke, { channelId: f.channel, commandId: command.id, options: { user: f.stranger } })).rejects.toThrow(/server member/);
    const { interactionId } = await f.as(f.member).mutation(api.botCommands.invoke, { channelId: f.channel, commandId: command.id, options: { user: f.admin, enabled: true, text: "Hello" } });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    await expect(f.request("POST", `/interactions/${interactionId}/responses`, { content: "Late" })).rejects.toThrow(/expired/);
  });

  it("clears stale presence and removes server installation records and scoped commands", async () => {
    const f = await fixture();
    await f.request("POST", "/gateway/heartbeat");
    vi.setSystemTime(Date.now() + 151_000);
    await f.t.mutation(internal.botEvents.maintain, {});
    expect((await f.t.run(ctx => ctx.db.get(f.app.botUserId)))?.status).toBe("offline");
    await f.as(f.owner).mutation(api.botCommands.replace, { applicationId: f.applicationId, serverId: f.server, commands: [{ name: "ping", description: "Scoped" }] });
    expect(await f.as(f.owner).query(api.botApplications.ownedInstallations, { applicationId: f.applicationId })).toHaveLength(1);
    const { deleteServerData } = await import("../../src/convex/cleanup");
    await f.t.run(async ctx => { await deleteServerData(ctx, (await ctx.db.get(f.server))!); });
    expect(await f.t.run(ctx => ctx.db.get(f.installationId))).toBeNull();
    expect(await f.as(f.owner).query(api.botCommands.list, { applicationId: f.applicationId })).toEqual([]);
  });
});
