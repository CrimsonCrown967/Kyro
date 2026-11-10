import { makeFunctionReference } from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { BotEventType } from "../lib/botContracts";
import { requireBotChannel } from "./botCore";
import { PERMISSIONS } from "../lib/permissions";

const fanOutRef = makeFunctionReference<"mutation">("botEvents:fanOut");
/** Written in the originating transaction. Fanout cannot race an uncommitted change. */
export async function emitBotEvent(
  ctx: MutationCtx,
  args: {
    type: BotEventType;
    serverId: Id<"servers">;
    channelId?: Id<"channels">;
    applicationId?: Id<"botApplications">;
    data: unknown;
  },
) {
  const installations = await ctx.db
    .query("botInstallations")
    .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
    .take(100);
  if (!installations.length) return null;
  const visibleToApplicationIds: Id<"botApplications">[] = [];
  if (args.channelId)
    for (const installation of installations) {
      const app = await ctx.db.get(installation.applicationId);
      if (!app || (args.applicationId && args.applicationId !== app._id))
        continue;
      try {
        await requireBotChannel(
          ctx,
          app,
          args.channelId,
          args.type.startsWith("message")
            ? PERMISSIONS.READ_MESSAGE_HISTORY
            : PERMISSIONS.VIEW_CHANNEL,
        );
        visibleToApplicationIds.push(app._id);
      } catch {
        /* Snapshot access before a channel can be removed or permissions changed. */
      }
    }
  const eventId = await ctx.db.insert("botEvents", {
    type: args.type,
    serverId: args.serverId,
    channelId: args.channelId,
    applicationId: args.applicationId,
    visibleToApplicationIds: args.channelId
      ? visibleToApplicationIds
      : undefined,
    dataJson: JSON.stringify(args.data),
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, fanOutRef, { eventId, cursor: null });
  return eventId;
}

/** Explicit public projections; never send raw users, audit details, or server documents. */
export async function emitAuditedBotEvent(
  ctx: MutationCtx,
  args: { serverId: Id<"servers">; action: string; targetId?: string },
) {
  const { action, serverId } = args;
  if (
    action === "member.leave" ||
    action === "member.kick" ||
    action === "member.ban"
  ) {
    await emitBotEvent(ctx, {
      type: "memberLeave",
      serverId,
      data: { serverId, userId: args.targetId },
    });
  } else if (
    [
      "member.join",
      "member.roles",
      "member.nickname",
      "member.timeout",
      "member.untimeout",
    ].includes(action)
  ) {
    const userId = args.targetId
      ? ctx.db.normalizeId("users", args.targetId)
      : null;
    const user = userId ? await ctx.db.get(userId) : null;
    const member = userId
      ? await ctx.db
          .query("serverMembers")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId).eq("userId", userId),
          )
          .unique()
      : null;
    if (user && member)
      await emitBotEvent(ctx, {
        type: action === "member.join" ? "memberJoin" : "memberUpdate",
        serverId,
        data: {
          id: member._id,
          serverId,
          user: {
            id: user._id,
            username: user.username ?? "member",
            name: user.name,
            bot: user.isBot === true,
          },
          nickname: member.nickname,
          roleIds: member.roleIds,
          joinedAt: member.joinedAt,
          communicationDisabledUntil: member.communicationDisabledUntil,
        },
      });
  } else if (["role.create", "role.update", "role.move"].includes(action)) {
    const roleId = args.targetId
      ? ctx.db.normalizeId("serverRoles", args.targetId)
      : null;
    const role = roleId ? await ctx.db.get(roleId) : null;
    if (role)
      await emitBotEvent(ctx, {
        type: action === "role.create" ? "roleCreate" : "roleUpdate",
        serverId,
        data: {
          id: role._id,
          serverId,
          name: role.name,
          color: role.color,
          permissions: role.permissions,
          position: role.position,
        },
      });
  } else if (action === "channel.create") {
    const channelId = args.targetId
      ? ctx.db.normalizeId("channels", args.targetId)
      : null;
    const channel = channelId ? await ctx.db.get(channelId) : null;
    if (channel)
      await emitBotEvent(ctx, {
        type: "channelCreate",
        serverId,
        channelId: channel._id,
        data: {
          id: channel._id,
          serverId,
          name: channel.name,
          topic: channel.topic,
          kind: channel.kind ?? "text",
        },
      });
  } else if (
    [
      "server.create",
      "server.update",
      "server.transfer_ownership",
      "server.lock",
      "server.unlock",
      "server.vanity",
    ].includes(action)
  ) {
    const server = await ctx.db.get(serverId);
    if (server)
      await emitBotEvent(ctx, {
        type: action === "server.create" ? "serverCreate" : "serverUpdate",
        serverId,
        data: {
          id: serverId,
          name: server.name,
          description: server.description,
          ownerId: server.ownerId,
          createdAt: server.createdAt,
        },
      });
  }
}

export async function emitMessageEvent(
  ctx: MutationCtx,
  type: "messageCreate" | "messageUpdate",
  messageId: Id<"messages">,
) {
  const message = await ctx.db.get(messageId);
  if (!message || message.containerType !== "channel") return;
  const channelId = ctx.db.normalizeId("channels", message.containerId);
  const channel = channelId ? await ctx.db.get(channelId) : null;
  const user = await ctx.db.get(message.authorId);
  if (!channel || !user) return;
  await emitBotEvent(ctx, {
    type,
    serverId: channel.serverId,
    channelId: channel._id,
    data: {
      id: messageId,
      channelId: channel._id,
      serverId: channel.serverId,
      content: message.content,
      author: {
        id: user._id,
        username: user.username ?? "member",
        name: user.name,
        avatar: user.avatarStorageId
          ? await ctx.storage.getUrl(user.avatarStorageId)
          : undefined,
        bot: user.isBot === true || message.kind === "bot_response",
      },
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      replyToId: message.replyToId,
      embeds: message.embeds,
      attachments: await Promise.all(
        (message.attachments ?? []).map(async (a) => ({
          ...a,
          url: await ctx.storage.getUrl(a.storageId),
        })),
      ),
    },
  });
}
