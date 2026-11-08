import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { PERMISSIONS } from "../lib/permissions";
import { can, requireProfile, requireServerAccess, requireUser } from "./lib";
import {
  claimUpload,
  deleteClaimedUpload,
  requireOwnedUpload,
} from "./uploadSecurity";

const EMOJI_NAME = /^[a-zA-Z0-9_]{2,32}$/;
const MAX_SERVER_EMOJIS = 100;
const MAX_ACCOUNT_EMOJIS = 200;
const MAX_FAVORITE_EMOJIS = 100;
const EMOJI_MIME_TYPES = new Set([
  "image/png",
  "image/apng",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

async function makePreferenceRoom(ctx: MutationCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("emojiPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("asc")
    .take(MAX_ACCOUNT_EMOJIS);
  if (rows.length < MAX_ACCOUNT_EMOJIS) return true;
  const disposable = rows.find((row) => !row.favorite);
  if (!disposable) return false;
  await ctx.db.delete(disposable._id);
  return true;
}

/** Custom emojis belonging to one community. */
export const forServer = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    const rows = await ctx.db
      .query("serverEmojis")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    return {
      canManage:
        can(access.permissions, PERMISSIONS.MANAGE_EMOJIS) ||
        can(access.permissions, PERMISSIONS.MANAGE_SERVER),
      emojis: await Promise.all(
        rows
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(async (emoji) => ({
            id: emoji._id as string,
            name: emoji.name,
            url: await ctx.storage.getUrl(emoji.storageId),
            animated: emoji.animated,
            serverId: emoji.serverId as string,
            serverName: access.server.name,
          })),
      ),
    };
  },
});

/** Every emoji from communities the signed-in member belongs to. */
export const available = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const memberships = await ctx.db
      .query("serverMembers")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .take(100);
    const groups = await Promise.all(
      memberships.map(async (membership) => {
        const server = await ctx.db.get(membership.serverId);
        if (!server) return [];
        const rows = await ctx.db
          .query("serverEmojis")
          .withIndex("by_server", (q) => q.eq("serverId", membership.serverId))
          .take(MAX_SERVER_EMOJIS);
        return await Promise.all(
          rows.map(async (emoji) => ({
            id: emoji._id as string,
            name: emoji.name,
            url: await ctx.storage.getUrl(emoji.storageId),
            animated: emoji.animated,
            serverId: server._id as string,
            serverName: server.name,
          })),
        );
      }),
    );
    return groups.flat().slice(0, 500);
  },
});

/** Recent and favourite emoji tokens for the signed-in account. */
export const preferences = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const [recentRows, favoriteRows] = await Promise.all([
      ctx.db
        .query("emojiPreferences")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .order("desc")
        .take(64),
      ctx.db
        .query("emojiPreferences")
        .withIndex("by_user_favorite", (q) =>
          q.eq("userId", id).eq("favorite", true),
        )
        .order("desc")
        .take(MAX_FAVORITE_EMOJIS),
    ]);
    return {
      recent: recentRows
        .filter((row) => row.useCount > 0)
        .slice(0, 32)
        .map((row) => row.emoji),
      favorites: favoriteRows.map((row) => row.emoji),
    };
  },
});

export const recordUse = mutation({
  args: { emoji: v.string() },
  handler: async (ctx, { emoji }) => {
    const { id } = await requireUser(ctx);
    const clean = emoji.trim().slice(0, 100);
    if (!clean) return;
    const existing = await ctx.db
      .query("emojiPreferences")
      .withIndex("by_user_emoji", (q) => q.eq("userId", id).eq("emoji", clean))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        useCount: existing.useCount + 1,
        lastUsedAt: Date.now(),
      });
      return;
    }
    if (!(await makePreferenceRoom(ctx, id))) return;
    await ctx.db.insert("emojiPreferences", {
      userId: id,
      emoji: clean,
      favorite: false,
      useCount: 1,
      lastUsedAt: Date.now(),
    });
  },
});

export const setFavorite = mutation({
  args: { emoji: v.string(), favorite: v.boolean() },
  handler: async (ctx, { emoji, favorite }) => {
    const { id } = await requireUser(ctx);
    const clean = emoji.trim().slice(0, 100);
    if (!clean) throw new Error("Choose an emoji first.");
    const existing = await ctx.db
      .query("emojiPreferences")
      .withIndex("by_user_emoji", (q) => q.eq("userId", id).eq("emoji", clean))
      .unique();
    if (existing) {
      if (favorite && !existing.favorite) {
        const favorites = await ctx.db
          .query("emojiPreferences")
          .withIndex("by_user_favorite", (q) =>
            q.eq("userId", id).eq("favorite", true),
          )
          .take(MAX_FAVORITE_EMOJIS);
        if (favorites.length >= MAX_FAVORITE_EMOJIS) {
          throw new Error(
            `You can favorite up to ${MAX_FAVORITE_EMOJIS} emojis.`,
          );
        }
      }
      await ctx.db.patch(existing._id, { favorite, lastUsedAt: Date.now() });
      return;
    }
    if (!favorite) return;
    const favorites = await ctx.db
      .query("emojiPreferences")
      .withIndex("by_user_favorite", (q) =>
        q.eq("userId", id).eq("favorite", true),
      )
      .take(MAX_FAVORITE_EMOJIS);
    if (favorites.length >= MAX_FAVORITE_EMOJIS) {
      throw new Error(`You can favorite up to ${MAX_FAVORITE_EMOJIS} emojis.`);
    }
    if (!(await makePreferenceRoom(ctx, id))) {
      throw new Error("Remove an emoji favorite before adding another.");
    }
    await ctx.db.insert("emojiPreferences", {
      userId: id,
      emoji: clean,
      favorite,
      useCount: 0,
      lastUsedAt: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    serverId: v.id("servers"),
    name: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { serverId, name, storageId }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (
      !can(access.permissions, PERMISSIONS.MANAGE_EMOJIS) &&
      !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error("You don't have permission to manage server emojis.");
    }
    const clean = name.trim().toLowerCase();
    if (!EMOJI_NAME.test(clean)) {
      throw new Error("Emoji names use 2–32 letters, numbers, or underscores.");
    }
    const existing = await ctx.db
      .query("serverEmojis")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    if (existing.length >= MAX_SERVER_EMOJIS) {
      throw new Error(
        `A server can have up to ${MAX_SERVER_EMOJIS} custom emojis.`,
      );
    }
    if (existing.some((emoji) => emoji.name === clean)) {
      throw new Error("That emoji name is already in use.");
    }
    const upload = await requireOwnedUpload(ctx, id, storageId, {
      imageOnly: true,
    });
    if (upload.size > 1024 * 1024) {
      throw new Error("Custom emoji files must be 1 MB or smaller.");
    }
    const mimeType = upload.mimeType.toLowerCase().split(";", 1)[0].trim();
    if (!EMOJI_MIME_TYPES.has(mimeType)) {
      throw new Error("Custom emojis must be PNG, APNG, JPEG, WebP, or GIF.");
    }
    const emojiId = await ctx.db.insert("serverEmojis", {
      serverId,
      name: clean,
      storageId,
      animated: mimeType === "image/gif" || mimeType === "image/apng",
      createdById: id,
      createdAt: Date.now(),
    });
    await claimUpload(ctx, id, storageId, "server_emoji", emojiId, {
      imageOnly: true,
    });
    return emojiId;
  },
});

export const remove = mutation({
  args: { emojiId: v.id("serverEmojis") },
  handler: async (ctx, { emojiId }) => {
    const { id } = await requireProfile(ctx);
    const emoji = await ctx.db.get(emojiId);
    if (!emoji) return;
    const access = await requireServerAccess(ctx, emoji.serverId, id);
    if (
      !can(access.permissions, PERMISSIONS.MANAGE_EMOJIS) &&
      !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error("You don't have permission to manage server emojis.");
    }
    await deleteClaimedUpload(ctx, emoji.storageId, "server_emoji", emoji._id);
    await ctx.db.delete(emoji._id);
  },
});
