import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import {
  can,
  hydrateUsers,
  MAX_MESSAGE_LENGTH,
  requireActiveUser,
  requireConversationAccess,
  requireServerAccess,
  requireUser,
  type Ctx,
} from "./lib";
import { channelPermissions, PERMISSIONS } from "../lib/permissions";

type ThreadAccess = {
  thread: Doc<"threads">;
  canSend: boolean;
  canManage: boolean;
  timeoutUntil: number | null;
};

async function sourcePermissions(
  ctx: Ctx,
  userId: Id<"users">,
  sourceType: "channel" | "conversation",
  sourceId: string,
) {
  if (sourceType === "conversation") {
    await requireConversationAccess(
      ctx,
      sourceId as Id<"conversations">,
      userId,
      { enforceBlocks: false },
    );
    return { canSend: true, canManage: false, timeoutUntil: null };
  }
  const channel = await ctx.db.get(sourceId as Id<"channels">);
  if (!channel) throw new Error("That channel no longer exists.");
  const access = await requireServerAccess(ctx, channel.serverId, userId);
  const defaultRole = await ctx.db
    .query("serverRoles")
    .withIndex("by_server_default", (q) =>
      q.eq("serverId", channel.serverId).eq("isDefault", true),
    )
    .first();
  const permissions =
    access.server.ownerId === userId
      ? access.permissions
      : channelPermissions(
          access.permissions,
          access.member.roleIds,
          defaultRole?._id ?? null,
          channel.permissionOverwrites,
        );
  if (!permissions.includes(PERMISSIONS.VIEW_CHANNEL)) {
    throw new Error("You don't have permission to view this thread.");
  }
  return {
    canSend:
      (access.member.communicationDisabledUntil ?? 0) <= Date.now() &&
      !channel.readOnly &&
      can(permissions, PERMISSIONS.SEND_MESSAGES),
    canManage: can(permissions, PERMISSIONS.MANAGE_MESSAGES),
    timeoutUntil: access.member.communicationDisabledUntil ?? null,
  };
}

async function requireThreadAccess(
  ctx: Ctx,
  userId: Id<"users">,
  threadId: Id<"threads">,
): Promise<ThreadAccess> {
  const thread = await ctx.db.get(threadId);
  if (!thread) throw new Error("That thread no longer exists.");
  const permissions = await sourcePermissions(
    ctx,
    userId,
    thread.sourceType,
    thread.sourceId,
  );
  return { thread, ...permissions };
}

export const openForMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const { id } = await requireActiveUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("That message no longer exists.");
    const permissions = await sourcePermissions(
      ctx,
      id,
      message.containerType,
      message.containerId,
    );
    if (!permissions.canSend) {
      throw new Error("You can't start a thread from this message.");
    }
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_parent", (q) => q.eq("parentMessageId", messageId))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("threads", {
      parentMessageId: messageId,
      sourceType: message.containerType,
      sourceId: message.containerId,
      title: message.content.trim().slice(0, 80) || "Message thread",
      createdById: id,
      createdAt: now,
      lastMessageAt: now,
      replyCount: 0,
    });
  },
});

export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const { id } = await requireUser(ctx);
    const { thread, canSend, canManage } = await requireThreadAccess(
      ctx,
      id,
      threadId,
    );
    const parent = await ctx.db.get(thread.parentMessageId);
    const parentAuthors = await hydrateUsers(
      ctx,
      parent ? [parent.authorId] : [],
      id,
    );
    return {
      id: thread._id as string,
      title: thread.title,
      locked: thread.locked === true,
      canSend,
      canManage: canManage || thread.createdById === id,
      replyCount: thread.replyCount,
      parent: parent
        ? {
            id: parent._id as string,
            content: parent.content,
            author: parentAuthors.get(parent.authorId) ?? null,
          }
        : null,
    };
  },
});

export const listMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const { id } = await requireUser(ctx);
    await requireThreadAccess(ctx, id, threadId);
    const rows = await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .take(200);
    const authors = await hydrateUsers(
      ctx,
      rows.map((row) => row.authorId),
      id,
    );
    return rows.map((row) => ({
      id: row._id as string,
      content: row.content,
      createdAt: row.createdAt,
      editedAt: row.editedAt ?? null,
      authorId: row.authorId as string,
      author: authors.get(row.authorId) ?? null,
    }));
  },
});

export const send = mutation({
  args: { threadId: v.id("threads"), content: v.string() },
  handler: async (ctx, { threadId, content }) => {
    const { id } = await requireActiveUser(ctx);
    const access = await requireThreadAccess(ctx, id, threadId);
    if (access.thread.locked && !access.canManage) {
      throw new Error("This thread is locked.");
    }
    if ((access.timeoutUntil ?? 0) > Date.now() && !access.canManage) {
      throw new Error(
        `You're timed out in this community until ${new Date(access.timeoutUntil!).toUTCString()}.`,
      );
    }
    if (!access.canSend && !access.canManage) {
      throw new Error("You can't reply in this thread.");
    }
    const clean = content.trim();
    if (!clean) throw new Error("Write a reply first.");
    if (clean.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Replies are limited to ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }
    const now = Date.now();
    const idInserted = await ctx.db.insert("threadMessages", {
      threadId,
      authorId: id,
      content: clean,
      createdAt: now,
    });
    await ctx.db.patch(threadId, {
      lastMessageAt: now,
      replyCount: access.thread.replyCount + 1,
    });
    return idInserted;
  },
});

export const toggleLock = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const { id } = await requireActiveUser(ctx);
    const access = await requireThreadAccess(ctx, id, threadId);
    if (!access.canManage && access.thread.createdById !== id) {
      throw new Error("You can't lock this thread.");
    }
    const locked = access.thread.locked !== true;
    await ctx.db.patch(threadId, { locked: locked || undefined });
    return { locked };
  },
});
