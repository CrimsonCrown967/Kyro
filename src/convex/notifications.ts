import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { hydrateUsers, requireServerAccess, requireUser } from "./lib";

/** Notification inbox for the signed-in user. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const { id } = await requireUser(ctx);
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .order("desc")
      .take(Math.min(limit ?? 40, 100));
    const actors = await hydrateUsers(
      ctx,
      notes.map((note) => note.actorId),
      id,
    );
    return notes.map((note) => ({
      id: note._id as string,
      type: note.type,
      title: note.title,
      body: note.body ?? null,
      link: note.link ?? null,
      containerKey: note.containerKey ?? null,
      read: note.read,
      createdAt: note.createdAt,
      actor: note.actorId ? (actors.get(note.actorId) ?? null) : null,
    }));
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    return (
      await ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", id).eq("read", false),
        )
        .collect()
    ).length;
  },
});

/**
 * Unread mentions and replies only — the number shown in the browser title.
 * Ordinary unread DMs, friend requests and system notes deliberately do not
 * count, so the tab stays quiet unless someone actually referenced you.
 */
export const mentionCount = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", id).eq("read", false))
      .collect();
    return notes.filter(
      (note) => note.type === "mention" || note.type === "reply",
    ).length;
  },
});

export const markRead = mutation({
  args: { ids: v.array(v.id("notifications")) },
  handler: async (ctx, { ids }) => {
    const { id } = await requireUser(ctx);
    for (const noteId of ids.slice(0, 100)) {
      const note = await ctx.db.get(noteId);
      if (note && note.userId === id && !note.read) {
        await ctx.db.patch(noteId, { read: true });
      }
    }
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", id).eq("read", false))
      .take(200);
    for (const note of notes) await ctx.db.patch(note._id, { read: true });
  },
});

export const channelPreference = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const { id } = await requireUser(ctx);
    const channel = await ctx.db.get(channelId);
    if (!channel) return "mentions" as const;
    await requireServerAccess(ctx, channel.serverId, id);
    const setting = await ctx.db
      .query("channelNotificationSettings")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", id).eq("channelId", channelId),
      )
      .unique();
    return setting?.level ?? ("mentions" as const);
  },
});

export const setChannelPreference = mutation({
  args: {
    channelId: v.id("channels"),
    level: v.union(v.literal("all"), v.literal("mentions"), v.literal("none")),
  },
  handler: async (ctx, { channelId, level }) => {
    const { id } = await requireUser(ctx);
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new Error("That channel no longer exists.");
    await requireServerAccess(ctx, channel.serverId, id);
    const existing = await ctx.db
      .query("channelNotificationSettings")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", id).eq("channelId", channelId),
      )
      .unique();
    if (level === "mentions") {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) {
      await ctx.db.patch(existing._id, { level, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("channelNotificationSettings", {
        userId: id,
        channelId,
        level,
        updatedAt: Date.now(),
      });
    }
  },
});
