import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  can,
  hydrateUsers,
  MAX_MESSAGE_LENGTH,
  requireActiveUser,
  requireServerAccess,
  requireUser,
  type Ctx,
} from "./lib";
import { channelPermissions, PERMISSIONS } from "../lib/permissions";

async function requireForumAccess(
  ctx: Ctx,
  userId: Id<"users">,
  channelId: Id<"channels">,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel || channel.kind !== "forum") {
    throw new Error("That forum channel doesn't exist.");
  }
  const access = await requireServerAccess(ctx, channel.serverId, userId);
  const defaultRole = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
    .filter((q) => q.eq(q.field("isDefault"), true))
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
    throw new Error("You don't have permission to view this forum.");
  }
  return {
    channel,
    canPost:
      (access.member.communicationDisabledUntil ?? 0) <= Date.now() &&
      can(permissions, PERMISSIONS.SEND_MESSAGES) &&
      !channel.readOnly,
    canManage: can(permissions, PERMISSIONS.MANAGE_MESSAGES),
    timeoutUntil: access.member.communicationDisabledUntil ?? null,
  };
}

function cleanTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) =>
          tag
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, ""),
        )
        .filter(Boolean),
    ),
  ).slice(0, 5);
}

export const list = query({
  args: {
    channelId: v.id("channels"),
    search: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, { channelId, search, tag }) => {
    const { id } = await requireUser(ctx);
    const access = await requireForumAccess(ctx, id, channelId);
    let rows = await ctx.db
      .query("forumPosts")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .order("desc")
      .take(200);
    const needle = search?.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (post) =>
          post.title.toLowerCase().includes(needle) ||
          post.content.toLowerCase().includes(needle),
      );
    }
    if (tag) rows = rows.filter((post) => post.tags.includes(tag));
    rows.sort(
      (a, b) =>
        Number(b.pinned === true) - Number(a.pinned === true) ||
        b.lastCommentAt - a.lastCommentAt,
    );
    const authors = await hydrateUsers(
      ctx,
      rows.map((post) => post.authorId),
      id,
    );
    return {
      channel: {
        id: access.channel._id as string,
        name: access.channel.name,
        topic: access.channel.topic ?? null,
      },
      canPost: access.canPost,
      canManage: access.canManage,
      posts: rows.map((post) => ({
        id: post._id as string,
        title: post.title,
        excerpt: post.content.slice(0, 220),
        tags: post.tags,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        lastCommentAt: post.lastCommentAt,
        commentCount: post.commentCount,
        locked: post.locked === true,
        pinned: post.pinned === true,
        author: authors.get(post.authorId) ?? null,
      })),
    };
  },
});

export const get = query({
  args: { postId: v.id("forumPosts") },
  handler: async (ctx, { postId }) => {
    const { id } = await requireUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post) return null;
    const access = await requireForumAccess(ctx, id, post.channelId);
    const comments = await ctx.db
      .query("forumComments")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .order("asc")
      .take(500);
    const authors = await hydrateUsers(
      ctx,
      [post.authorId, ...comments.map((comment) => comment.authorId)],
      id,
    );
    return {
      id: post._id as string,
      channelId: post.channelId as string,
      title: post.title,
      content: post.content,
      tags: post.tags,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      locked: post.locked === true,
      pinned: post.pinned === true,
      canComment: access.canPost,
      canManage: access.canManage || post.authorId === id,
      author: authors.get(post.authorId) ?? null,
      comments: comments.map((comment) => ({
        id: comment._id as string,
        content: comment.content,
        createdAt: comment.createdAt,
        editedAt: comment.editedAt ?? null,
        authorId: comment.authorId as string,
        author: authors.get(comment.authorId) ?? null,
      })),
    };
  },
});

export const createPost = mutation({
  args: {
    channelId: v.id("channels"),
    title: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, { channelId, title, content, tags }) => {
    const { id } = await requireActiveUser(ctx);
    const access = await requireForumAccess(ctx, id, channelId);
    if ((access.timeoutUntil ?? 0) > Date.now() && !access.canManage) {
      throw new Error(
        `You're timed out in this community until ${new Date(access.timeoutUntil!).toUTCString()}.`,
      );
    }
    if (!access.canPost) throw new Error("You can't post in this forum.");
    const cleanTitle = title.trim().slice(0, 120);
    const cleanContent = content.trim();
    if (cleanTitle.length < 3)
      throw new Error("Post titles need 3+ characters.");
    if (!cleanContent) throw new Error("Write something in your post.");
    if (cleanContent.length > 10_000) {
      throw new Error("Forum posts are limited to 10,000 characters.");
    }
    const now = Date.now();
    return await ctx.db.insert("forumPosts", {
      channelId,
      serverId: access.channel.serverId,
      authorId: id,
      title: cleanTitle,
      content: cleanContent,
      tags: cleanTags(tags),
      createdAt: now,
      updatedAt: now,
      lastCommentAt: now,
      commentCount: 0,
    });
  },
});

export const addComment = mutation({
  args: { postId: v.id("forumPosts"), content: v.string() },
  handler: async (ctx, { postId, content }) => {
    const { id } = await requireActiveUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("That post no longer exists.");
    const access = await requireForumAccess(ctx, id, post.channelId);
    if (post.locked && !access.canManage)
      throw new Error("This post is locked.");
    if ((access.timeoutUntil ?? 0) > Date.now() && !access.canManage) {
      throw new Error(
        `You're timed out in this community until ${new Date(access.timeoutUntil!).toUTCString()}.`,
      );
    }
    if (!access.canPost && !access.canManage) {
      throw new Error("You can't comment in this forum.");
    }
    const clean = content.trim();
    if (!clean) throw new Error("Write a comment first.");
    if (clean.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Comments are limited to ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }
    const now = Date.now();
    const commentId = await ctx.db.insert("forumComments", {
      postId,
      authorId: id,
      content: clean,
      createdAt: now,
    });
    await ctx.db.patch(postId, {
      lastCommentAt: now,
      updatedAt: now,
      commentCount: post.commentCount + 1,
    });
    return commentId;
  },
});

export const togglePinned = mutation({
  args: { postId: v.id("forumPosts") },
  handler: async (ctx, { postId }) => {
    const { id } = await requireActiveUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("That post no longer exists.");
    const access = await requireForumAccess(ctx, id, post.channelId);
    if (!access.canManage) throw new Error("You can't pin forum posts.");
    const pinned = post.pinned !== true;
    await ctx.db.patch(postId, { pinned: pinned || undefined });
    return { pinned };
  },
});

export const toggleLocked = mutation({
  args: { postId: v.id("forumPosts") },
  handler: async (ctx, { postId }) => {
    const { id } = await requireActiveUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("That post no longer exists.");
    const access = await requireForumAccess(ctx, id, post.channelId);
    if (!access.canManage && post.authorId !== id) {
      throw new Error("You can't lock this post.");
    }
    const locked = post.locked !== true;
    await ctx.db.patch(postId, { locked: locked || undefined });
    return { locked };
  },
});
