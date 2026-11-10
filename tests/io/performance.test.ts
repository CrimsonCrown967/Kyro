/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../../src/convex/schema";
import { api, internal } from "../../src/convex/_generated/api";
import { botTriggers } from "../../src/convex/botEvents";
import { visiblePresence } from "../../src/convex/lib";

const modules = import.meta.glob("../../src/convex/**/*.{ts,tsx}");
afterEach(() => vi.useRealTimers());

async function fixture() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      username: "io_test",
      email: "io_test@kyro-seed.invalid",
      name: "IO Test",
      role: "admin",
    }),
  );
  return { t, userId, user: t.withIdentity({ subject: userId }) };
}

describe("database I/O regressions", () => {
  it("renews a small lease without rewriting the user or counter documents, including old 15s clients", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const { t, user, userId } = await fixture();
    await user.mutation(api.users.heartbeat, { device: "desktop" });
    const original = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      lease: await ctx.db.query("userPresence").first(),
      counters: await ctx.db.query("metrics").collect(),
    }));
    vi.setSystemTime(now + 15_000);
    await user.mutation(api.users.heartbeat, { device: "desktop" });
    expect(await t.run((ctx) => ctx.db.query("userPresence").first())).toEqual(
      original.lease,
    );
    vi.setSystemTime(now + 60_000);
    await user.mutation(api.users.heartbeat, { device: "desktop" });
    expect(await t.run((ctx) => ctx.db.get(userId))).toEqual(original.user);
    expect(await t.run((ctx) => ctx.db.query("metrics").collect())).toEqual(
      original.counters,
    );
    expect(
      (await t.run((ctx) => ctx.db.query("userPresence").first()))
        ?.lastHeartbeatAt,
    ).toBe(now + 60_000);
    expect(await t.query(api.platformStats.get, {})).toEqual({
      users: 1,
      communities: 0,
      onlineMembers: 1,
    });
    vi.setSystemTime(now + 211_000);
    expect(await t.mutation(internal.presence.expire, {})).toEqual({
      expired: 1,
    });
    const disconnected = await t.run((ctx) => ctx.db.get(userId));
    expect(visiblePresence(disconnected!, false)).toBe("offline");
    expect(disconnected?.lastSeen).toBe(now + 60_000);
    expect((await t.query(api.platformStats.get, {})).onlineMembers).toBe(0);
    expect(await t.mutation(internal.presence.expire, {})).toEqual({
      expired: 0,
    });
  });

  it("keeps explicit status and privacy changes consistent with counters", async () => {
    const { t, user, userId } = await fixture();
    await user.mutation(api.users.setPresence, { status: "invisible" });
    expect((await t.query(api.platformStats.get, {})).onlineMembers).toBe(0);
    expect(
      visiblePresence((await t.run((ctx) => ctx.db.get(userId)))!, true),
    ).toBe("invisible");
    await user.mutation(api.users.setPresence, { status: "dnd" });
    expect((await t.query(api.platformStats.get, {})).onlineMembers).toBe(1);
    await user.mutation(api.users.updatePrivacy, { showPresence: false });
    expect((await t.query(api.platformStats.get, {})).onlineMembers).toBe(0);
    await user.mutation(api.users.setPresence, { status: "offline" });
    expect(
      await t.run((ctx) => ctx.db.query("userPresence").first()),
    ).toBeNull();
  });

  it("backfills counters idempotently and keeps inserts, edits, deletions and membership counts accurate", async () => {
    const { t, userId } = await fixture();
    const seeded = await t.run(async (ctx) => {
      const serverId = await ctx.db.insert("servers", {
        ownerId: userId,
        name: "Example",
        tag: "test",
        isPublic: true,
        createdAt: 1,
      });
      const memberId = await ctx.db.insert("serverMembers", {
        serverId,
        userId,
        roleIds: [],
        joinedAt: 1,
      });
      const conversationId = await ctx.db.insert("conversations", {
        type: "dm",
        participantIds: [userId],
        createdAt: 1,
        ownerId: userId,
      });
      const messageId = await ctx.db.insert("messages", {
        authorId: userId,
        containerId: conversationId,
        containerType: "conversation",
        content: "first",
        createdAt: 1,
      });
      return { serverId, memberId, messageId, conversationId };
    });
    for (let pass = 0; pass < 2; pass++)
      for (const table of [
        "users",
        "servers",
        "messages",
        "serverMembers",
      ] as const)
        await t.mutation(internal.ioMaintenance.backfill, { table });
    expect(await t.query(api.platformStats.get, {})).toEqual({
      users: 1,
      communities: 1,
      onlineMembers: 0,
    });
    expect((await t.query(internal.ioMaintenance.status, {})).messages).toBe(1);
    expect(
      (
        await t
          .withIdentity({ subject: userId })
          .query(api.servers.previewByTag, { tag: "TeSt" })
      )?.memberCount,
    ).toBe(1);
    const owner = t.withIdentity({ subject: userId });
    await owner.mutation(api.users.heartbeat, { device: "desktop" });
    expect(
      (await owner.query(api.servers.get, { serverId: seeded.serverId }))
        .onlineCount,
    ).toBe(1);
    await owner.mutation(api.users.updatePrivacy, { showPresence: false });
    expect(
      (await owner.query(api.servers.get, { serverId: seeded.serverId }))
        .onlineCount,
    ).toBe(0);
    await t.run(async (ctx) => {
      const { db } = botTriggers.wrapDB(ctx);
      await db.patch(seeded.messageId, { content: "edited" });
      await db.insert("messages", {
        authorId: userId,
        containerId: seeded.conversationId,
        containerType: "conversation",
        content: "second",
        createdAt: 2,
      });
      await db.delete(seeded.messageId);
      await db.delete(seeded.memberId);
    });
    expect((await t.query(internal.ioMaintenance.status, {})).messages).toBe(1);
    expect(
      (
        await t
          .withIdentity({ subject: userId })
          .query(api.servers.previewByTag, { tag: "test" })
      )?.memberCount,
    ).toBe(0);
  });

  it("makes read receipts idempotent and touches only that user's notifications in that conversation", async () => {
    vi.useFakeTimers();
    const { t, user, userId } = await fixture();
    const { conversationId, ownNote, otherNote } = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        type: "dm",
        participantIds: [userId],
        createdAt: 1,
        ownerId: userId,
        lastMessageAt: 500,
      });
      const ownNote = await ctx.db.insert("notifications", {
        userId,
        containerKey: conversationId,
        type: "mention",
        title: "Here",
        read: false,
        createdAt: 500,
      });
      const otherNote = await ctx.db.insert("notifications", {
        userId,
        containerKey: "another-conversation",
        type: "mention",
        title: "Elsewhere",
        read: false,
        createdAt: 500,
      });
      return { conversationId, ownNote, otherNote };
    });
    await user.mutation(api.messages.markContainerRead, {
      containerType: "conversation",
      containerId: conversationId,
    });
    const read = await t.run((ctx) => ctx.db.query("reads").first());
    vi.setSystemTime(Date.now() + 5000);
    await user.mutation(api.messages.markContainerRead, {
      containerType: "conversation",
      containerId: conversationId,
    });
    expect(await t.run((ctx) => ctx.db.query("reads").first())).toEqual(read);
    expect((await t.run((ctx) => ctx.db.get(ownNote)))?.read).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(otherNote)))?.read).toBe(false);
  });

  it("processes expired bans once and does not confuse permanent, active or lifted bans", async () => {
    const { t, userId } = await fixture();
    const now = Date.now();
    const ids = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.insert("siteBans", {
          userId,
          bannedById: userId,
          reason: "expired",
          createdAt: 1,
          expiresAt: now - 1,
        }),
        ctx.db.insert("siteBans", {
          userId,
          bannedById: userId,
          reason: "permanent",
          createdAt: 1,
        }),
        ctx.db.insert("siteBans", {
          userId,
          bannedById: userId,
          reason: "active",
          createdAt: 1,
          expiresAt: now + 60000,
        }),
        ctx.db.insert("siteBans", {
          userId,
          bannedById: userId,
          reason: "lifted",
          createdAt: 1,
          expiresAt: now - 1,
          liftedAt: now - 2,
        }),
      ]),
    );
    await t.mutation(internal.emailOutbox.notifyExpiredBans, {});
    const processed = await t.run((ctx) => ctx.db.get(ids[0]));
    expect(processed?.expiryNotifiedAt).toBeGreaterThanOrEqual(now);
    await t.mutation(internal.emailOutbox.notifyExpiredBans, {});
    expect(await t.run((ctx) => ctx.db.get(ids[0]))).toEqual(processed);
    for (const id of ids.slice(1))
      expect(
        (await t.run((ctx) => ctx.db.get(id)))?.expiryNotifiedAt,
      ).toBeUndefined();
  });
  it("finishes a paginated backfill without double-counting a retried first page", async () => {
    vi.useFakeTimers();
    const { t, userId } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < 105; i++)
        await ctx.db.insert("messages", {
          authorId: userId,
          containerId: "migration-fixture",
          containerType: "conversation",
          content: `row ${i}`,
          createdAt: i,
        });
    });
    const first = await t.mutation(internal.ioMaintenance.backfill, {
      table: "messages",
    });
    expect(first.done).toBe(false);
    expect(first.processed).toBe(100);
    await t.mutation(internal.ioMaintenance.backfill, { table: "messages" });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const status = await t.query(internal.ioMaintenance.status, {});
    expect(status.messages).toBe(105);
    expect(status["backfill:messages"]).toBe(1);
  });

  it("bounds badge reads and coalesces repeated typing writes", async () => {
    vi.useFakeTimers();
    const { t, user, userId } = await fixture();
    const conversationId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("conversations", {
        type: "dm",
        participantIds: [userId],
        createdAt: 1,
      });
      for (let i = 0; i < 12; i++)
        await ctx.db.insert("notifications", {
          userId,
          type: "mention",
          title: "Ping",
          read: false,
          createdAt: i,
        });
      return id;
    });
    expect(await user.query(api.notifications.unreadCount, {})).toBe(10);
    await user.mutation(api.messages.setTyping, {
      containerType: "conversation",
      containerId: conversationId,
    });
    const original = await t.run((ctx) => ctx.db.query("typing").first());
    await user.mutation(api.messages.setTyping, {
      containerType: "conversation",
      containerId: conversationId,
    });
    expect(await t.run((ctx) => ctx.db.query("typing").collect())).toEqual([
      original,
    ]);
    vi.setSystemTime(Date.now() + 3000);
    await user.mutation(api.messages.setTyping, {
      containerType: "conversation",
      containerId: conversationId,
    });
    const next = await t.run((ctx) => ctx.db.query("typing").collect());
    expect(next).toHaveLength(1);
    expect(next[0]._id).toBe(original?._id);
    expect(next[0].expiresAt).toBeGreaterThan(original!.expiresAt + 2900);
    expect(next[0].expiresAt).toBeLessThan(original!.expiresAt + 3100);
  });
});
