import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./functions";
import { botChannel, botError, botServer, messageDto, tableId } from "./botLib";
import { customEmojiIds } from "../lib/emoji";
import {
  parseMentions,
  parseRoleMentionIds,
  channelPermissions,
  hasPermission,
} from "../lib/permissions";
import { messageSchema, type BotMessageInput } from "../lib/botContract";
import { claimUpload, requireOwnedUpload } from "./uploadSecurity";
import { evaluateAutomod } from "./automod";
import {
  markRead,
  notify,
  requireServerAccess,
  isBlockedBetween,
  visiblePresence,
} from "./lib";

export async function validateBotMessage(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  channelId: Id<"channels">,
  input: BotMessageInput,
  editing = false,
) {
  const access = await botChannel(ctx, app, channelId, "send_messages");
  const now = Date.now();
  if (access.channel.kind && access.channel.kind !== "text")
    botError(400, "INVALID_CHANNEL", "Send messages in a text channel.");
  if ((access.member.communicationDisabledUntil ?? 0) > now)
    botError(403, "TIMED_OUT", "This bot is timed out.");
  if (
    (access.channel.readOnly ||
      (access.server.locked &&
        (access.server.lockedUntil === undefined ||
          access.server.lockedUntil > now))) &&
    !access.permissions.includes("manage_messages")
  )
    botError(
      403,
      "CHANNEL_LOCKED",
      "This channel is read-only or the server is locked.",
    );
  if (
    access.server.rulesChannelId === channelId &&
    !access.permissions.includes("manage_server")
  )
    botError(
      403,
      "MISSING_PERMISSION",
      "Manage server is required in the rules channel.",
    );
  if (
    (/(^|\s)@(everyone|here)\b/i.test(input.content) ||
      parseRoleMentionIds(input.content).length) &&
    !access.permissions.includes("mention_everyone")
  )
    botError(
      403,
      "MISSING_PERMISSION",
      "Mass and role mentions require mention_everyone.",
    );
  if (
    input.attachmentIds.length &&
    !access.permissions.includes("upload_attachments")
  )
    botError(
      403,
      "MISSING_PERMISSION",
      "Attachments require upload_attachments.",
    );
  for (const id of customEmojiIds(input.content)) {
    const emoji = await ctx.db.get(tableId(ctx, "serverEmojis", id));
    if (!emoji) botError(400, "INVALID_EMOJI", "Custom emoji not found.");
    if (emoji.serverId !== access.server._id) {
      if (!access.permissions.includes("use_external_emojis"))
        botError(
          403,
          "MISSING_PERMISSION",
          "External emoji require use_external_emojis.",
        );
      await botServer(ctx, app, emoji.serverId);
    }
  }
  const text = [
    input.content,
    ...input.embeds.map((e) =>
      [
        e.title,
        e.description,
        ...(e.fields ?? []).flatMap((f) => [f.name, f.value]),
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");
  const result = await evaluateAutomod(ctx, {
    server: access.server,
    channel: access.channel,
    member: access.member,
    permissions: access.permissions,
    userId: app.botUserId,
    content: text,
  });
  if (result) botError(403, "AUTOMOD_BLOCKED", result.reason);
  if (!editing) {
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("authorId", app.botUserId))
      .order("desc")
      .take(5);
    if (recent.length >= 5 && recent[4].createdAt > now - 5000)
      botError(
        429,
        "RATE_LIMITED",
        "Bots may send five messages per five seconds.",
      );
    const mine = await ctx.db
      .query("messages")
      .withIndex("by_container", (q) => q.eq("containerId", channelId))
      .order("desc")
      .take(100);
    const last = mine.find((m) => m.authorId === app.botUserId);
    if (last && last.createdAt > now - (access.channel.slowMode ?? 0) * 1000)
      botError(429, "SLOW_MODE", "Channel slow mode is active.");
  }
  if (input.replyToId) {
    const parent = await ctx.db.get(tableId(ctx, "messages", input.replyToId));
    if (!parent || parent.containerId !== channelId)
      botError(
        400,
        "INVALID_REPLY",
        "Reply must reference a message in this channel.",
      );
  }
  return access;
}
export async function sendBotMessage(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  channelId: Id<"channels">,
  raw: unknown,
) {
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success)
    botError(
      400,
      "INVALID_MESSAGE",
      parsed.error.issues[0]?.message ?? "Invalid message.",
    );
  const input = parsed.data;
  await botChannel(ctx, app, channelId, "send_messages");
  if (input.nonce) {
    const old = await ctx.db
      .query("messages")
      .withIndex("by_container_client", (q) =>
        q
          .eq("containerId", channelId)
          .eq("clientId", `bot:${app._id}:${input.nonce}`),
      )
      .first();
    if (old) return messageDto(ctx, old);
  }
  const access = await validateBotMessage(ctx, app, channelId, input);
  const attachments = await Promise.all(
    input.attachmentIds.map(async (value) => {
      const storageId = tableId(ctx, "_storage", value);
      const upload = await requireOwnedUpload(ctx, app.botUserId, storageId);
      if (upload.claimType)
        botError(409, "UPLOAD_CLAIMED", "Attachment is already in use.");
      return {
        storageId,
        name: upload.name,
        size: upload.size,
        mimeType: upload.mimeType,
      };
    }),
  );
  const now = Date.now();
  const id = await ctx.db.insert("messages", {
    containerType: "channel",
    containerId: channelId,
    authorId: app.botUserId,
    content: input.content.trim(),
    embeds: input.embeds,
    attachments,
    replyToId: input.replyToId
      ? tableId(ctx, "messages", input.replyToId)
      : undefined,
    clientId: input.nonce ? `bot:${app._id}:${input.nonce}` : undefined,
    createdAt: now,
  });
  for (const attachment of attachments)
    await claimUpload(ctx, app.botUserId, attachment.storageId, "message", id);
  await ctx.db.patch(channelId, {
    lastMessageAt: now,
    lastMessageSenderId: app.botUserId,
  });
  await markRead(ctx, app.botUserId, `channel:${channelId}`, now);
  const targets = new Set<Id<"users">>();
  for (const username of parseMentions(input.content)) {
    const target = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (target) targets.add(target._id);
  }
  const mass = /(^|\s)@everyone\b/i.test(input.content);
  const here = /(^|\s)@here\b/i.test(input.content);
  const roleIds = parseRoleMentionIds(input.content);
  if (mass || here || roleIds.length) {
    const members = await ctx.db
      .query("serverMembers")
      .withIndex("by_server", (q) => q.eq("serverId", access.server._id))
      .take(1000);
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      if (
        mass ||
        member.roleIds.some((id) => roleIds.includes(id)) ||
        (here && user && visiblePresence(user, false) !== "offline")
      )
        targets.add(member.userId);
    }
  }
  for (const targetId of targets) {
    const target = await ctx.db.get(targetId);
    if (
      !target ||
      target.deletedAt ||
      target.botApplicationId ||
      (await isBlockedBetween(ctx, targetId, app.botUserId))
    )
      continue;
    const member = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", access.server._id).eq("userId", target._id),
      )
      .first();
    if (!member || member.muted) continue;
    const setting = await ctx.db
      .query("channelNotificationSettings")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", targetId).eq("channelId", channelId),
      )
      .unique();
    if (setting?.level === "none") continue;
    try {
      const targetAccess = await requireServerAccess(
        ctx,
        access.server._id,
        targetId,
      );
      const permissions =
        targetId === access.server.ownerId
          ? targetAccess.permissions
          : channelPermissions(
              targetAccess.permissions,
              member.roleIds,
              access.roles.find((r) => r.isDefault)?._id ?? null,
              access.channel.permissionOverwrites,
            );
      if (!hasPermission(permissions, "view_channel")) continue;
    } catch {
      continue;
    }
    await notify(ctx, {
      userId: target._id,
      type: "mention",
      title: `${app.name} mentioned you`,
      body: input.content.slice(0, 160),
      actorId: app.botUserId,
      containerKey: channelId,
      link: `/dashboard/s/${access.server._id}/c/${channelId}`,
    });
  }
  return messageDto(ctx, (await ctx.db.get(id))!);
}
