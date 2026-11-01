import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { deleteClaimedUpload } from "./uploadSecurity";

/** Delete a message and every object that exists only because it exists. */
export async function deleteMessageData(
  ctx: MutationCtx,
  message: Doc<"messages">,
): Promise<void> {
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_message", (q) => q.eq("messageId", message._id))
    .collect();
  for (const reaction of reactions) await ctx.db.delete(reaction._id);
  for (const attachment of message.attachments ?? []) {
    await deleteClaimedUpload(
      ctx,
      attachment.storageId,
      "message",
      message._id,
    );
  }
  await clearMessageReferences(ctx, message._id);
  await ctx.db.delete(message._id);
}

async function deleteContainerMetadata(
  ctx: MutationCtx,
  containerType: "channel" | "conversation",
  containerId: string,
): Promise<void> {
  const [sessions, signals, typing, reads, notifications] = await Promise.all([
    ctx.db
      .query("voiceSessions")
      .withIndex("by_container", (q) =>
        q.eq("containerType", containerType).eq("containerId", containerId),
      )
      .collect(),
    ctx.db
      .query("voiceSignals")
      .withIndex("by_container", (q) =>
        q.eq("containerKey", `${containerType}:${containerId}`),
      )
      .collect(),
    ctx.db
      .query("typing")
      .withIndex("by_key", (q) => q.eq("key", containerId))
      .collect(),
    ctx.db
      .query("reads")
      .withIndex("by_key", (q) => q.eq("key", containerId))
      .collect(),
    ctx.db
      .query("notifications")
      .withIndex("by_container", (q) => q.eq("containerKey", containerId))
      .collect(),
  ]);
  for (const row of [
    ...sessions,
    ...signals,
    ...typing,
    ...reads,
    ...notifications,
  ]) {
    await ctx.db.delete(row._id);
  }
}

export async function deleteChannelData(
  ctx: MutationCtx,
  channel: Doc<"channels">,
): Promise<void> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_container", (q) => q.eq("containerId", channel._id))
    .collect();
  for (const message of messages) await deleteMessageData(ctx, message);
  await deleteContainerMetadata(ctx, "channel", channel._id);
  await ctx.db.delete(channel._id);
}

export async function deleteConversationData(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
): Promise<void> {
  const [messages, members, calls] = await Promise.all([
    ctx.db
      .query("messages")
      .withIndex("by_container", (q) => q.eq("containerId", conversation._id))
      .collect(),
    ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .collect(),
    ctx.db
      .query("calls")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .collect(),
  ]);
  for (const message of messages) await deleteMessageData(ctx, message);
  for (const row of [...members, ...calls]) await ctx.db.delete(row._id);
  await deleteContainerMetadata(ctx, "conversation", conversation._id);
  await ctx.db.delete(conversation._id);
}

export async function deleteServerData(
  ctx: MutationCtx,
  server: Doc<"servers">,
): Promise<void> {
  const serverId = server._id;
  const [
    channels,
    categories,
    roles,
    members,
    invites,
    bans,
    audits,
    reports,
    emojis,
  ] = await Promise.all([
    ctx.db
      .query("channels")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("categories")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("serverRoles")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("serverMembers")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("invites")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("bans")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("auditLogs")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("reports")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("serverEmojis")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
  ]);
  for (const channel of channels) await deleteChannelData(ctx, channel);
  for (const emoji of emojis) {
    await deleteClaimedUpload(ctx, emoji.storageId, "server_emoji", emoji._id);
    await ctx.db.delete(emoji._id);
  }
  for (const row of [
    ...categories,
    ...roles,
    ...members,
    ...invites,
    ...bans,
    ...audits,
    ...reports,
  ]) {
    await ctx.db.delete(row._id);
  }
  await deleteClaimedUpload(ctx, server.iconStorageId, "server_icon", serverId);
  await deleteClaimedUpload(
    ctx,
    server.bannerStorageId,
    "server_banner",
    serverId,
  );
  await ctx.db.delete(serverId);
}

/** Clear references to a deleted message from records that can outlive it. */
export async function clearMessageReferences(
  ctx: MutationCtx,
  messageId: Id<"messages">,
): Promise<void> {
  const reports = await ctx.db
    .query("reports")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .collect();
  for (const report of reports) {
    await ctx.db.patch(report._id, { messageId: undefined });
  }
}
