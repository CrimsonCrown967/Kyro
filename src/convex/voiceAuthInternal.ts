import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./functions";
import {
  channelPermissions,
  hasPermission,
  PERMISSIONS,
} from "../lib/permissions";
import {
  activeSiteBan,
  getServerAccess,
  requireConversationAccess,
} from "./lib";

const TICKET_TTL_MS = 60_000;
const SESSION_TTL_MS = 45_000;

async function cleanExpired(ctx: MutationCtx) {
  const rows = await ctx.db
    .query("livekitTickets")
    .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
    .take(100);
  for (const row of rows) await ctx.db.delete(row._id);
}

async function channelAccess(
  ctx: MutationCtx,
  userId: Id<"users">,
  channelId: Id<"channels">,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel || channel.kind !== "voice") {
    throw new Error("That voice channel no longer exists.");
  }
  const access = await getServerAccess(ctx, channel.serverId, userId);
  if (!access) throw new Error("You are not a member of this community.");
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
  if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL)) {
    throw new Error("You cannot view that voice channel.");
  }
  return { channel, access, permissions };
}

async function rolePosition(
  ctx: MutationCtx,
  server: Doc<"servers">,
  member: Doc<"serverMembers">,
) {
  if (server.ownerId === member.userId) return Number.POSITIVE_INFINITY;
  const roles = await Promise.all(
    member.roleIds.map((roleId) => ctx.db.get(roleId)),
  );
  return Math.max(0, ...roles.map((role) => role?.position ?? 0));
}

function roomIdentity(userId: Id<"users">) {
  return `user_${userId}`;
}

export const createJoinTicket = internalMutation({
  args: {
    userId: v.id("users"),
    ticketHash: v.string(),
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, args) => {
    await cleanExpired(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user || user.deletedAt !== undefined || !user.username) {
      throw new Error("That Kyro account cannot join voice.");
    }
    if (await activeSiteBan(ctx, args.userId)) {
      throw new Error("Banned accounts cannot join voice.");
    }

    let roomName: string;
    let canManage = false;
    let canPublishSources: Array<
      "microphone" | "camera" | "screen_share" | "screen_share_audio"
    > = [];

    if (args.containerType === "channel") {
      const channelId = args.containerId as Id<"channels">;
      const { access, permissions } = await channelAccess(
        ctx,
        args.userId,
        channelId,
      );
      if (!hasPermission(permissions, PERMISSIONS.CONNECT_VOICE)) {
        throw new Error(
          "You do not have permission to join that voice channel.",
        );
      }
      const communicationDisabled =
        (access.member.communicationDisabledUntil ?? 0) > Date.now();
      if (
        !communicationDisabled &&
        hasPermission(permissions, PERMISSIONS.SPEAK_VOICE)
      ) {
        canPublishSources.push("microphone");
      }
      if (hasPermission(permissions, PERMISSIONS.VIDEO)) {
        canPublishSources.push("camera");
      }
      if (hasPermission(permissions, PERMISSIONS.SHARE_SCREEN)) {
        canPublishSources.push("screen_share", "screen_share_audio");
      }
      canManage = hasPermission(permissions, PERMISSIONS.MANAGE_VOICE);
      roomName = `kyro_channel_${channelId}`;
    } else {
      const conversationId = args.containerId as Id<"conversations">;
      const conversation = await requireConversationAccess(
        ctx,
        conversationId,
        args.userId,
      );
      const call = await ctx.db
        .query("calls")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .order("desc")
        .first();
      if (
        !call ||
        call.endedAt ||
        (!call.answeredAt && Date.now() - call.startedAt > 5 * 60_000) ||
        (call.callerId !== args.userId && !call.calleeIds.includes(args.userId))
      ) {
        throw new Error("There is no active call you can join.");
      }
      if (call.callerId !== args.userId && !call.answeredAt) {
        throw new Error("Accept the call before joining.");
      }
      if (!conversation.participantIds.includes(args.userId)) {
        throw new Error("You are not part of that conversation.");
      }
      canPublishSources = [
        "microphone",
        "camera",
        "screen_share",
        "screen_share_audio",
      ];
      roomName = `kyro_call_${call._id}`;
    }

    const avatarUrl = user.avatarStorageId
      ? await ctx.storage.getUrl(user.avatarStorageId)
      : null;
    const now = Date.now();
    const expiresAt = now + TICKET_TTL_MS;
    await ctx.db.insert("livekitTickets", {
      ticketHash: args.ticketHash,
      purpose: "join",
      userId: args.userId,
      roomName,
      identity: roomIdentity(args.userId),
      displayName: user.name ?? user.username,
      metadata: JSON.stringify({
        userId: args.userId,
        username: user.username,
        avatarUrl,
      }),
      canPublishSources,
      canManage,
      expiresAt,
      createdAt: now,
    });
    return { roomName, canManage, expiresAt };
  },
});

export const createModerationTicket = internalMutation({
  args: {
    userId: v.id("users"),
    ticketHash: v.string(),
    channelId: v.id("channels"),
    targetUserId: v.id("users"),
    action: v.union(v.literal("mute"), v.literal("disconnect")),
    trackSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await cleanExpired(ctx);
    if (args.userId === args.targetUserId) {
      throw new Error("Use your own voice controls for that.");
    }
    const actorUser = await ctx.db.get(args.userId);
    if (!actorUser || actorUser.deletedAt !== undefined) {
      throw new Error("Your account cannot manage voice.");
    }
    if (await activeSiteBan(ctx, args.userId)) {
      throw new Error("Banned accounts cannot manage voice.");
    }
    const { channel, access, permissions } = await channelAccess(
      ctx,
      args.userId,
      args.channelId,
    );
    if (!hasPermission(permissions, PERMISSIONS.MANAGE_VOICE)) {
      throw new Error("You do not have permission to manage voice.");
    }
    const targetMember = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", channel.serverId).eq("userId", args.targetUserId),
      )
      .unique();
    if (!targetMember) throw new Error("That participant is not a member.");
    if (access.server.ownerId !== args.userId) {
      const [actorTop, targetTop] = await Promise.all([
        rolePosition(ctx, access.server, access.member),
        rolePosition(ctx, access.server, targetMember),
      ]);
      if (targetTop >= actorTop) {
        throw new Error(
          "You cannot manage someone with an equal or higher role.",
        );
      }
    }
    const seat = await ctx.db
      .query("voiceSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.targetUserId))
      .filter((q) =>
        q.and(
          q.eq(q.field("containerType"), "channel"),
          q.eq(q.field("containerId"), args.channelId),
        ),
      )
      .first();
    if (!seat || seat.lastSeenAt <= Date.now() - SESSION_TTL_MS) {
      throw new Error("That participant is no longer in voice.");
    }
    if (
      args.action === "mute" &&
      (!args.trackSid || !/^[a-zA-Z0-9_-]{1,100}$/.test(args.trackSid))
    ) {
      throw new Error("The microphone track is not available.");
    }
    const now = Date.now();
    const expiresAt = now + TICKET_TTL_MS;
    await ctx.db.insert("livekitTickets", {
      ticketHash: args.ticketHash,
      purpose: "moderate",
      userId: args.userId,
      roomName: `kyro_channel_${args.channelId}`,
      identity: roomIdentity(args.userId),
      displayName: actorUser.name ?? actorUser.username ?? "Kyro moderator",
      metadata: "{}",
      canPublishSources: [],
      canManage: true,
      action: args.action,
      targetIdentity: roomIdentity(args.targetUserId),
      trackSid: args.trackSid,
      expiresAt,
      createdAt: now,
    });
    return { expiresAt };
  },
});
