import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import {
  ALL_PERMISSIONS,
  CHANNEL_PERMISSIONS,
  channelPermissions,
  PERMISSIONS,
} from "../lib/permissions";
import {
  can,
  MAX_BADGE_NOTIFICATIONS,
  logAudit,
  requireProfile,
  requireServerAccess,
  requireUser,
} from "./lib";
import { deleteChannelData } from "./cleanup";

const CHANNEL_NAME = /^[a-z0-9][a-z0-9-_]{0,99}$/i;

type ChannelOverwrite = {
  roleId: Doc<"serverRoles">["_id"];
  allow: string[];
  deny: string[];
};

const VALID_CHANNEL_PERMISSIONS = new Set<string>(CHANNEL_PERMISSIONS);

/** Validate role overrides so a channel can only reference its own roles. */
async function sanitizeOverwrites(
  ctx: Parameters<typeof requireServerAccess>[0],
  serverId: Doc<"servers">["_id"],
  overwrites: readonly {
    roleId: Doc<"serverRoles">["_id"];
    allow: string[];
    deny: string[];
  }[],
): Promise<ChannelOverwrite[]> {
  if (overwrites.length > 100) {
    throw new Error("A channel can have up to 100 role overrides.");
  }
  const seen = new Set<string>();
  const sanitized: ChannelOverwrite[] = [];
  for (const overwrite of overwrites) {
    if (seen.has(overwrite.roleId)) {
      throw new Error("A role can only have one channel override.");
    }
    seen.add(overwrite.roleId);
    const role = await ctx.db.get(overwrite.roleId);
    if (!role || role.serverId !== serverId) {
      throw new Error("That role isn't in this community.");
    }
    const allow = Array.from(new Set<string>(overwrite.allow)).filter(
      (permission) => VALID_CHANNEL_PERMISSIONS.has(permission),
    );
    const deny = Array.from(new Set<string>(overwrite.deny)).filter(
      (permission) =>
        VALID_CHANNEL_PERMISSIONS.has(permission) &&
        !allow.includes(permission),
    );
    if (allow.length > 0 || deny.length > 0) {
      sanitized.push({ roleId: overwrite.roleId, allow, deny });
    }
  }
  return sanitized;
}

async function requireCategoryInServer(
  ctx: Parameters<typeof requireServerAccess>[0],
  categoryId: Doc<"categories">["_id"],
  serverId: Doc<"servers">["_id"],
) {
  const category = await ctx.db.get(categoryId);
  if (!category || category.serverId !== serverId) {
    throw new Error("That category isn't in this community.");
  }
  return category;
}

/** Sidebar payload: categories, channels, unread flags and my permissions. */
export const list = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    const [
      categories,
      channels,
      reads,
      roles,
      notificationSettings,
      mentionNotifications,
      replyNotifications,
    ] = await Promise.all([
      ctx.db
        .query("categories")
        .withIndex("by_server_position", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("channels")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("reads")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
      ctx.db
        .query("serverRoles")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("channelNotificationSettings")
        .withIndex("by_user_channel", (q) => q.eq("userId", id))
        .collect(),
      ctx.db
        .query("notifications")
        .withIndex("by_user_unread_type", (q) =>
          q.eq("userId", id).eq("read", false).eq("type", "mention"),
        )
        .order("desc")
        .take(MAX_BADGE_NOTIFICATIONS),
      ctx.db
        .query("notifications")
        .withIndex("by_user_unread_type", (q) =>
          q.eq("userId", id).eq("read", false).eq("type", "reply"),
        )
        .order("desc")
        .take(MAX_BADGE_NOTIFICATIONS),
    ]);
    const readMap = new Map(reads.map((read) => [read.key, read.lastReadAt]));
    const notificationMap = new Map(
      notificationSettings.map((setting) => [setting.channelId, setting.level]),
    );
    const mentionMap = new Map<string, number>();
    for (const notification of [
      ...mentionNotifications,
      ...replyNotifications,
    ]) {
      if (notification.containerKey) {
        mentionMap.set(
          notification.containerKey,
          (mentionMap.get(notification.containerKey) ?? 0) + 1,
        );
      }
    }
    const everyoneRole = roles.find((role) => role.isDefault) ?? null;
    const effective = new Map(
      channels.map((channel) => [
        channel._id,
        access.server.ownerId === id
          ? [...ALL_PERMISSIONS]
          : channelPermissions(
              access.permissions,
              access.member.roleIds,
              everyoneRole?._id ?? null,
              channel.permissionOverwrites,
            ),
      ]),
    );
    const visibleChannels = channels.filter((channel) =>
      (effective.get(channel._id) ?? []).includes(PERMISSIONS.VIEW_CHANNEL),
    );

    return {
      permissions: access.permissions,
      isOwner: access.server.ownerId === id,
      categories: categories
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((category) => ({
          id: category._id as string,
          name: category.name,
          position: category.position,
        })),
      channels: visibleChannels
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((channel) => ({
          id: channel._id as string,
          name: channel.name,
          topic: channel.topic ?? null,
          categoryId: (channel.categoryId as string | undefined) ?? null,
          position: channel.position,
          readOnly: channel.readOnly === true,
          kind:
            channel.kind === "voice"
              ? ("voice" as const)
              : channel.kind === "forum"
                ? ("forum" as const)
                : ("text" as const),
          isRules: access.server.rulesChannelId === channel._id,
          slowMode: channel.slowMode ?? 0,
          permissions: effective.get(channel._id) ?? access.permissions,
          permissionOverwrites: (channel.permissionOverwrites ?? []).map(
            (overwrite) => ({
              roleId: overwrite.roleId as string,
              allow: overwrite.allow,
              deny: overwrite.deny,
            }),
          ),
          lastMessageAt: channel.lastMessageAt ?? 0,
          lastMessageSenderId:
            (channel.lastMessageSenderId as string | undefined) ?? null,
          notificationLevel:
            notificationMap.get(channel._id) ?? ("mentions" as const),
          mentionCount: mentionMap.get(channel._id) ?? 0,
          unread:
            (channel.lastMessageAt ?? 0) > (readMap.get(channel._id) ?? 0),
        })),
    };
  },
});

export const create = mutation({
  args: {
    serverId: v.id("servers"),
    name: v.string(),
    topic: v.optional(v.string()),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    permissionOverwrites: v.optional(
      v.array(
        v.object({
          roleId: v.id("serverRoles"),
          allow: v.array(v.string()),
          deny: v.array(v.string()),
        }),
      ),
    ),
    /** Voice hosts audio; forum hosts tagged long-form discussions. */
    kind: v.optional(
      v.union(v.literal("text"), v.literal("voice"), v.literal("forum")),
    ),
  },
  handler: async (
    ctx,
    { serverId, name, topic, categoryId, kind, permissionOverwrites },
  ) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      throw new Error("You don't have permission to create channels.");
    }
    const clean = name.trim();
    if (!CHANNEL_NAME.test(clean)) {
      throw new Error(
        "Channel names use letters, numbers, dashes and underscores.",
      );
    }
    if (categoryId) {
      await requireCategoryInServer(ctx, categoryId, serverId);
    }
    const existing = await ctx.db
      .query("channels")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    if (
      existing.some(
        (channel) =>
          channel.name.toLowerCase() === clean.toLowerCase() &&
          (!categoryId || channel.categoryId === categoryId),
      )
    ) {
      throw new Error("There's already a channel with that name.");
    }
    const siblings = existing.filter((channel) =>
      categoryId === undefined || categoryId === null
        ? !channel.categoryId
        : channel.categoryId === categoryId,
    );
    const overwrites = permissionOverwrites
      ? await sanitizeOverwrites(ctx, serverId, permissionOverwrites)
      : [];
    const channelId = await ctx.db.insert("channels", {
      serverId,
      categoryId: categoryId ?? undefined,
      name: clean,
      topic: topic?.trim().slice(0, 300) || undefined,
      kind: kind === "voice" ? "voice" : kind === "forum" ? "forum" : undefined,
      position: siblings.length,
      permissionOverwrites: overwrites.length > 0 ? overwrites : undefined,
      createdAt: Date.now(),
      createdById: id,
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "channel.create",
      targetType: "channel",
      targetId: channelId,
      details: `#${clean}`,
    });
    return channelId;
  },
});

export const update = mutation({
  args: {
    channelId: v.id("channels"),
    name: v.optional(v.string()),
    topic: v.optional(v.string()),
    slowMode: v.optional(v.number()),
    readOnly: v.optional(v.boolean()),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    permissionOverwrites: v.optional(
      v.array(
        v.object({
          roleId: v.id("serverRoles"),
          allow: v.array(v.string()),
          deny: v.array(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { id } = await requireProfile(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error("That channel doesn't exist.");
    const access = await requireServerAccess(ctx, channel.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      throw new Error("You don't have permission to edit channels.");
    }
    const patch: Partial<Doc<"channels">> = {};
    if (args.name !== undefined) {
      const clean = args.name.trim();
      if (!CHANNEL_NAME.test(clean)) {
        throw new Error(
          "Channel names use letters, numbers, dashes and underscores.",
        );
      }
      patch.name = clean;
    }
    if (args.topic !== undefined) patch.topic = args.topic.trim().slice(0, 300);
    if (args.slowMode !== undefined) {
      if (args.slowMode < 0 || args.slowMode > 21600) {
        throw new Error("Slow mode must be between 0 and 21600 seconds.");
      }
      patch.slowMode = Math.floor(args.slowMode);
    }
    if (args.readOnly !== undefined) patch.readOnly = args.readOnly;
    if (args.categoryId !== undefined) {
      if (args.categoryId) {
        await requireCategoryInServer(ctx, args.categoryId, channel.serverId);
      }
      patch.categoryId = args.categoryId ?? undefined;
    }
    if (args.permissionOverwrites !== undefined) {
      const sanitized = await sanitizeOverwrites(
        ctx,
        channel.serverId,
        args.permissionOverwrites,
      );
      patch.permissionOverwrites = sanitized.length > 0 ? sanitized : undefined;
    }
    await ctx.db.patch(args.channelId, patch);
    await logAudit(ctx, {
      serverId: channel.serverId,
      actorId: id,
      action: "channel.update",
      targetType: "channel",
      targetId: args.channelId,
      details: Object.keys(args)
        .filter((key) => key !== "channelId")
        .join(", "),
    });
  },
});

export const remove = mutation({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const { id } = await requireProfile(ctx);
    const channel = await ctx.db.get(channelId);
    if (!channel) return;
    const access = await requireServerAccess(ctx, channel.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      throw new Error("You don't have permission to delete channels.");
    }
    await deleteChannelData(ctx, channel);
    await logAudit(ctx, {
      serverId: channel.serverId,
      actorId: id,
      action: "channel.delete",
      targetType: "channel",
      targetId: channelId,
      details: `#${channel.name}`,
    });
  },
});

export const createCategory = mutation({
  args: { serverId: v.id("servers"), name: v.string() },
  handler: async (ctx, { serverId, name }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      throw new Error("You don't have permission to manage categories.");
    }
    const clean = name.trim().slice(0, 60);
    if (clean.length < 2) throw new Error("Category names need 2+ characters.");
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    const categoryId = await ctx.db.insert("categories", {
      serverId,
      name: clean,
      position: existing.length,
      createdAt: Date.now(),
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "category.create",
      targetType: "category",
      targetId: categoryId,
      details: clean,
    });
    return categoryId;
  },
});

export const updateCategory = mutation({
  args: { categoryId: v.id("categories"), name: v.string() },
  handler: async (ctx, { categoryId, name }) => {
    const { id } = await requireProfile(ctx);
    const category = await ctx.db.get(categoryId);
    if (!category) throw new Error("That category doesn't exist.");
    const access = await requireServerAccess(ctx, category.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      throw new Error("You don't have permission to manage categories.");
    }
    const clean = name.trim().slice(0, 60);
    if (clean.length < 2) throw new Error("Category names need 2+ characters.");
    await ctx.db.patch(categoryId, { name: clean });
  },
});

export const deleteCategory = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const { id } = await requireProfile(ctx);
    const category = await ctx.db.get(categoryId);
    if (!category) return;
    const access = await requireServerAccess(ctx, category.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      throw new Error("You don't have permission to manage categories.");
    }
    const children = await ctx.db
      .query("channels")
      .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
      .collect();
    for (const child of children)
      await ctx.db.patch(child._id, { categoryId: undefined });
    await ctx.db.delete(categoryId);
    await logAudit(ctx, {
      serverId: category.serverId,
      actorId: id,
      action: "category.delete",
      targetType: "category",
      targetId: categoryId,
      details: category.name,
    });
  },
});

/** Drag-and-drop persistence for the channel sidebar. */
export const reorder = mutation({
  args: {
    serverId: v.id("servers"),
    categories: v.array(
      v.object({ id: v.id("categories"), position: v.number() }),
    ),
    channels: v.array(
      v.object({
        id: v.id("channels"),
        position: v.number(),
        categoryId: v.union(v.id("categories"), v.null()),
      }),
    ),
  },
  handler: async (ctx, { serverId, categories, channels }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      throw new Error("You don't have permission to reorder channels.");
    }
    if (categories.length > 200 || channels.length > 500) {
      throw new Error("Too many items were included in that reorder request.");
    }
    const seenCategories = new Set<string>();
    for (const entry of categories) {
      if (seenCategories.has(entry.id)) {
        throw new Error("A category was included more than once.");
      }
      seenCategories.add(entry.id);
      const category = await ctx.db.get(entry.id);
      if (!category || category.serverId !== serverId) {
        throw new Error("A category isn't in this community.");
      }
      if (!Number.isSafeInteger(entry.position) || entry.position < 0) {
        throw new Error("Category positions must be non-negative integers.");
      }
      await ctx.db.patch(entry.id, { position: entry.position });
    }
    const seenChannels = new Set<string>();
    for (const entry of channels) {
      if (seenChannels.has(entry.id)) {
        throw new Error("A channel was included more than once.");
      }
      seenChannels.add(entry.id);
      const channel = await ctx.db.get(entry.id);
      if (!channel || channel.serverId !== serverId) {
        throw new Error("A channel isn't in this community.");
      }
      if (entry.categoryId) {
        await requireCategoryInServer(ctx, entry.categoryId, serverId);
      }
      if (!Number.isSafeInteger(entry.position) || entry.position < 0) {
        throw new Error("Channel positions must be non-negative integers.");
      }
      await ctx.db.patch(entry.id, {
        position: entry.position,
        categoryId: entry.categoryId ?? undefined,
      });
    }
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "channel.reorder",
      details: `${channels.length} channels reorganised`,
    });
  },
});
