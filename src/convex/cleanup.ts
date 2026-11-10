import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./functions";
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
  const thread = await ctx.db
    .query("threads")
    .withIndex("by_parent", (q) => q.eq("parentMessageId", message._id))
    .unique();
  if (thread) {
    const replies = await ctx.db
      .query("threadMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
      .collect();
    for (const reply of replies) await ctx.db.delete(reply._id);
    await ctx.db.delete(thread._id);
  }
  const poll = await ctx.db
    .query("polls")
    .withIndex("by_message", (q) => q.eq("messageId", message._id))
    .unique();
  if (poll) {
    const votes = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", poll._id))
      .collect();
    for (const vote of votes) await ctx.db.delete(vote._id);
    await ctx.db.delete(poll._id);
  }
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
  const forumPosts = await ctx.db
    .query("forumPosts")
    .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
    .collect();
  for (const post of forumPosts) {
    const comments = await ctx.db
      .query("forumComments")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .collect();
    for (const comment of comments) await ctx.db.delete(comment._id);
    await ctx.db.delete(post._id);
  }
  const notificationSettings = await ctx.db
    .query("channelNotificationSettings")
    .withIndex("by_channel_level", (q) => q.eq("channelId", channel._id))
    .collect();
  for (const setting of notificationSettings) await ctx.db.delete(setting._id);
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
    applications,
    automodSettings,
    automodEvents,
    moderationCases,
    botCommands,
    templates,
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
    ctx.db
      .query("joinApplications")
      .withIndex("by_server_status", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("serverAutomod")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("automodEvents")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("moderationCases")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("serverBotCommands")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect(),
    ctx.db
      .query("serverTemplates")
      .withIndex("by_source", (q) => q.eq("sourceServerId", serverId))
      .collect(),
  ]);
  for (const channel of channels) await deleteChannelData(ctx, channel);
  for (const emoji of emojis) {
    await deleteClaimedUpload(ctx, emoji.storageId, "server_emoji", emoji._id);
    await ctx.db.delete(emoji._id);
  }
  for (const template of templates) {
    await ctx.db.patch(template._id, { sourceServerId: undefined });
  }
  for (const row of [
    ...categories,
    ...roles,
    ...members,
    ...invites,
    ...bans,
    ...audits,
    ...reports,
    ...applications,
    ...automodSettings,
    ...automodEvents,
    ...moderationCases,
    ...botCommands,
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
