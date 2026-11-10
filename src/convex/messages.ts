import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { CUSTOM_EMOJI_TOKEN, customEmojiIds } from "../lib/emoji";
import {
  channelPermissions,
  parseMentions,
  parseRoleMentionIds,
  PERMISSIONS,
} from "../lib/permissions";
import {
  blockedUserIds,
  can,
  canSendDirectMessage,
  getUserByUsername,
  hydrateUsers,
  logAudit,
  markRead,
  MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  notify,
  PRESENCE_TIMEOUT_MS,
  isBlockedBetween,
  requireActiveUser,
  requireConversationAccess,
  requireProfile,
  requireServerAccess,
  requireUser,
  restrictionLevel,
  type Ctx,
} from "./lib";
import { deleteMessageData } from "./cleanup";
import { claimUpload, requireOwnedUpload } from "./uploadSecurity";
import { evaluateAutomod, recordAutomodEvent } from "./automod";

export type ContainerType = "channel" | "conversation";

const SENDER_COOLDOWN_MS = 5_000;
const DEFAULT_RATE_WINDOW_MESSAGES = 5;

type ReadAccess =
  | {
      kind: "channel";
      channel: Doc<"channels">;
      server: Doc<"servers">;
      member: Doc<"serverMembers">;
      permissions: string[];
    }
  | { kind: "conversation"; conversation: Doc<"conversations"> };

/** Read access to a channel or conversation, or a thrown error. */
async function requireReadAccess(
  ctx: Ctx,
  userId: Id<"users">,
  containerType: ContainerType,
  containerId: string,
): Promise<ReadAccess> {
  if (containerType === "channel") {
    const channel = await ctx.db.get(containerId as Id<"channels">);
    if (!channel) throw new Error("That channel no longer exists.");
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
      throw new Error("You don't have permission to view this channel.");
    }
    return {
      kind: "channel",
      channel,
      server: access.server,
      member: access.member,
      permissions,
    };
  }
  const conversation = await requireConversationAccess(
    ctx,
    containerId as Id<"conversations">,
    userId,
    { enforceBlocks: false },
  );
  return { kind: "conversation", conversation };
}

function containerLink(
  containerType: ContainerType,
  containerId: string,
  serverId?: string,
) {
  return containerType === "channel"
    ? `/dashboard/s/${serverId}/c/${containerId}`
    : `/dashboard/dm/${containerId}`;
}

async function channelNotificationLevel(
  ctx: Ctx,
  userId: Id<"users">,
  channelId: Id<"channels">,
): Promise<"all" | "mentions" | "none"> {
  const setting = await ctx.db
    .query("channelNotificationSettings")
    .withIndex("by_user_channel", (q) =>
      q.eq("userId", userId).eq("channelId", channelId),
    )
    .unique();
  return setting?.level ?? "mentions";
}

/**
 * Custom emojis travel as stable `<:name:id>` tokens. Only members of the
 * emoji's source community may send or react with it, even in another server
 * or a direct message.
 */
async function requireUsableCustomEmojis(
  ctx: Ctx,
  userId: Id<"users">,
  content: string,
): Promise<void> {
  const ids = customEmojiIds(content);
  await Promise.all(
    ids.map(async (emojiId) => {
      let emoji: Doc<"serverEmojis"> | null = null;
      try {
        emoji = await ctx.db.get(emojiId as Id<"serverEmojis">);
      } catch {
        // User-authored ids are untrusted and may not be valid Convex ids.
      }
      if (!emoji) throw new Error("That custom emoji is no longer available.");
      const membership = await ctx.db
        .query("serverMembers")
        .withIndex("by_server_user", (q) =>
          q.eq("serverId", emoji.serverId).eq("userId", userId),
        )
        .unique();
      if (!membership) {
        throw new Error(
          "You must be a member of the emoji's community to use it.",
        );
      }
    }),
  );
}

export const list = query({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { containerType, containerId, before, limit }) => {
    const { id: viewerId } = await requireUser(ctx);
    const listAccess = await requireReadAccess(
      ctx,
      viewerId,
      containerType,
      containerId,
    );

    const take = Math.min(limit ?? 50, 100);
    const blocked = await blockedUserIds(ctx, viewerId);
    const rows = (
      await ctx.db
        .query("messages")
        .withIndex("by_container", (q) =>
          before !== undefined
            ? q.eq("containerId", containerId).lt("createdAt", before)
            : q.eq("containerId", containerId),
        )
        .order("desc")
        .take(take * 2 + 1)
    ).filter((message) => !blocked.has(message.authorId));

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const authors = await hydrateUsers(
      ctx,
      page.map((message) => message.authorId),
      viewerId,
    );

    const replyIds = Array.from(
      new Set(
        page
          .map((message) => message.replyToId)
          .filter((id): id is Id<"messages"> => Boolean(id)),
      ),
    );
    const replyDocs = await Promise.all(replyIds.map((id) => ctx.db.get(id)));
    const replyMap = new Map<string, Doc<"messages">>();
    replyDocs.forEach((doc, index) => {
      if (
        doc &&
        doc.containerType === containerType &&
        doc.containerId === containerId &&
        !blocked.has(doc.authorId)
      ) {
        replyMap.set(replyIds[index], doc);
      }
    });
    const replyAuthors = await hydrateUsers(
      ctx,
      replyDocs
        .filter((doc): doc is Doc<"messages"> => Boolean(doc))
        .map((doc) => doc.authorId),
      viewerId,
    );

    const roleMentionIds = Array.from(
      new Set(
        [...page, ...replyDocs.filter((doc) => doc !== null)].flatMap(
          (message) => parseRoleMentionIds(message.content),
        ),
      ),
    );
    const roleMentionDocs = await Promise.all(
      roleMentionIds.map(async (rawId) => {
        const roleId = ctx.db.normalizeId("serverRoles", rawId);
        return roleId ? await ctx.db.get(roleId) : null;
      }),
    );
    const roleMentionMap = new Map(
      roleMentionDocs
        .filter(
          (role): role is Doc<"serverRoles"> =>
            role !== null &&
            listAccess.kind === "channel" &&
            role.serverId === listAccess.server._id,
        )
        .map((role) => [
          role._id as string,
          {
            id: role._id as string,
            name: role.name,
            color: role.color ?? null,
          },
        ]),
    );
    const roleMentionsFor = (content: string) =>
      parseRoleMentionIds(content)
        .map((roleId) => roleMentionMap.get(roleId))
        .filter((role): role is NonNullable<typeof role> => Boolean(role));
    const roleMentionExcerpt = (content: string) =>
      content.replace(/<@&([a-z0-9]+)>/g, (_token, roleId: string) => {
        const role = roleMentionMap.get(roleId);
        return role ? `@${role.name}` : "@unknown-role";
      });

    const emojiIds = Array.from(
      new Set(page.flatMap((message) => [...customEmojiIds(message.content)])),
    );
    const emojiDocs = await Promise.all(
      emojiIds.map(async (emojiId) => {
        // Message content is user-authored: a malformed `<:name:id>` token
        // must render as text, not break the whole channel query.
        try {
          return await ctx.db.get(emojiId as Id<"serverEmojis">);
        } catch {
          return null;
        }
      }),
    );
    const customEmojiMap = new Map(
      await Promise.all(
        emojiDocs
          .filter((emoji): emoji is Doc<"serverEmojis"> => emoji !== null)
          .map(
            async (emoji) =>
              [
                emoji._id as string,
                {
                  id: emoji._id as string,
                  name: emoji.name,
                  url: await ctx.storage.getUrl(emoji.storageId),
                  animated: emoji.animated,
                  serverId: emoji.serverId as string,
                },
              ] as const,
          ),
      ),
    );

    // Reaction emojis can be custom tokens too. Resolve each unique token once
    // so the reaction bar can render the image instead of raw markup.
    const reactionUrls = new Map<string, string | null>();
    const reactionEmojiUrl = async (emoji: string): Promise<string | null> => {
      if (reactionUrls.has(emoji)) return reactionUrls.get(emoji) ?? null;
      const emojiId = customEmojiIds(emoji)[0];
      let url: string | null = null;
      if (emojiId) {
        try {
          const doc = await ctx.db.get(emojiId as Id<"serverEmojis">);
          if (doc) url = await ctx.storage.getUrl(doc.storageId);
        } catch {
          url = null;
        }
      }
      reactionUrls.set(emoji, url);
      return url;
    };

    const hydrated = await Promise.all(
      page.map(async (message) => {
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect();
        const grouped = new Map<string, string[]>();
        for (const reaction of reactions) {
          const list = grouped.get(reaction.emoji) ?? [];
          list.push(reaction.userId);
          grouped.set(reaction.emoji, list);
        }
        const attachments = await Promise.all(
          (message.attachments ?? []).map(async (attachment) => ({
            ...attachment,
            url: await ctx.storage.getUrl(attachment.storageId),
          })),
        );
        const reply = message.replyToId
          ? (replyMap.get(message.replyToId) ?? null)
          : null;
        const thread = await ctx.db
          .query("threads")
          .withIndex("by_parent", (q) => q.eq("parentMessageId", message._id))
          .unique();
        const poll = await ctx.db
          .query("polls")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .unique();
        const pollVotes = poll
          ? await ctx.db
              .query("pollVotes")
              .withIndex("by_poll", (q) => q.eq("pollId", poll._id))
              .collect()
          : [];
        const myPollVote = pollVotes.find((vote) => vote.userId === viewerId);
        return {
          id: message._id,
          content: message.content,
          embeds: message.embeds ?? [],
          /** Call records render as their own system row in the timeline. */
          kind: message.kind ?? null,
          botName: message.botName ?? null,
          botCommand: message.botCommand ?? null,
          callDurationMs: message.callDurationMs ?? null,
          createdAt: message.createdAt,
          editedAt: message.editedAt ?? null,
          pinnedAt: message.pinnedAt ?? null,
          clientId: message.clientId ?? null,
          author: authors.get(message.authorId) ?? null,
          authorId: message.authorId as string,
          attachments,
          reactions: await Promise.all(
            Array.from(grouped.entries()).map(async ([emoji, userIds]) => ({
              emoji,
              userIds,
              count: userIds.length,
              mine: userIds.includes(viewerId),
              url: await reactionEmojiUrl(emoji),
            })),
          ),
          replyTo: reply
            ? {
                id: reply._id,
                excerpt: roleMentionExcerpt(reply.content).slice(0, 160),
                author: replyAuthors.get(reply.authorId) ?? null,
                botName:
                  reply.kind === "bot_response"
                    ? (reply.botName ?? "Kyro Bot")
                    : null,
              }
            : null,
          thread: thread
            ? {
                id: thread._id as string,
                replyCount: thread.replyCount,
                lastMessageAt: thread.lastMessageAt,
                locked: thread.locked === true,
              }
            : null,
          poll: poll
            ? {
                id: poll._id as string,
                question: poll.question,
                multiple: poll.multiple,
                closed:
                  poll.closedAt !== undefined ||
                  (poll.closesAt !== undefined && poll.closesAt <= Date.now()),
                closesAt: poll.closesAt ?? null,
                canClose: poll.createdById === viewerId,
                selectedOptionIds: myPollVote?.optionIds ?? [],
                totalVotes: pollVotes.length,
                options: poll.options.map((option) => ({
                  ...option,
                  votes: pollVotes.filter((vote) =>
                    vote.optionIds.includes(option.id),
                  ).length,
                })),
              }
            : null,
          customEmojis: customEmojiIds(message.content)
            .map((emojiId) => customEmojiMap.get(emojiId))
            .filter((emoji): emoji is NonNullable<typeof emoji> =>
              Boolean(emoji),
            ),
          roleMentions: roleMentionsFor(message.content),
        };
      }),
    );

    const read = await ctx.db
      .query("reads")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", viewerId).eq("key", containerId),
      )
      .unique();

    return {
      messages: hydrated.reverse(),
      hasMore,
      oldest: page.length > 0 ? page[page.length - 1].createdAt : null,
      lastReadAt: read?.lastReadAt ?? 0,
    };
  },
});

export const send = mutation({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
    content: v.string(),
    clientId: v.optional(v.string()),
    replyToId: v.optional(v.id("messages")),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          name: v.string(),
          size: v.number(),
          mimeType: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { id: userId, user } = await requireProfile(ctx);
    const accountLevel = await restrictionLevel(ctx, userId);
    if (accountLevel >= 3) {
      throw new Error("Your account is suspended while staff review it.");
    }
    if (accountLevel >= 2) {
      throw new Error(
        "Your account is limited — you can't send messages right now.",
      );
    }
    const content = args.content.trim();
    const requestedRoleMentions = parseRoleMentionIds(content);
    const attachmentInputs = args.attachments ?? [];
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }
    if (attachmentInputs.length > MAX_ATTACHMENTS) {
      throw new Error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    }
    if (!content && attachmentInputs.length === 0) {
      throw new Error("Write something or attach a file.");
    }
    if (args.clientId && args.clientId.length > 100) {
      throw new Error("That message identifier is not valid.");
    }

    const access = await requireReadAccess(
      ctx,
      userId,
      args.containerType,
      args.containerId,
    );
    await requireUsableCustomEmojis(ctx, userId, content);

    // Authorization comes before idempotency so a leaked container/client id
    // never acts as an existence oracle. A client id is also scoped to author.
    if (args.clientId) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_container_client", (q) =>
          q.eq("containerId", args.containerId).eq("clientId", args.clientId!),
        )
        .unique();
      if (existing) {
        if (
          existing.authorId !== userId ||
          existing.containerType !== args.containerType
        ) {
          throw new Error("That message identifier is already in use.");
        }
        return { messageId: existing._id, deduped: true, blocked: null };
      }
    }

    const ownedUploads = await Promise.all(
      attachmentInputs.map((attachment) =>
        requireOwnedUpload(ctx, userId, attachment.storageId),
      ),
    );
    const attachments = ownedUploads.map((upload) => ({
      storageId: upload.storageId,
      name: upload.name,
      size: upload.size,
      mimeType: upload.mimeType,
    }));

    let permissions: string[] = [];
    const mentionedRoles: Doc<"serverRoles">[] = [];
    let mutedServer = false;
    let serverId: Id<"servers"> | undefined;
    let dmConversation: Doc<"conversations"> | null = null;
    if (access.kind === "channel") {
      permissions = access.permissions;
      serverId = access.server._id;
      mutedServer = access.member.muted === true;
      const channel = access.channel;

      for (const rawRoleId of requestedRoleMentions) {
        const roleId = ctx.db.normalizeId("serverRoles", rawRoleId);
        const role = roleId ? await ctx.db.get(roleId) : null;
        if (!role || role.serverId !== access.server._id || role.isDefault) {
          throw new Error("That role mention is no longer available.");
        }
        if (
          !role.mentionable &&
          !can(permissions, PERMISSIONS.MENTION_EVERYONE)
        ) {
          throw new Error(`The @${role.name} role is not mentionable.`);
        }
        mentionedRoles.push(role);
      }

      const timeoutUntil = access.member.communicationDisabledUntil ?? 0;
      if (
        timeoutUntil > Date.now() &&
        access.server.ownerId !== userId &&
        !can(permissions, PERMISSIONS.MANAGE_MESSAGES)
      ) {
        throw new Error(
          `You're timed out in this community until ${new Date(timeoutUntil).toUTCString()}.`,
        );
      }

      if (channel.readOnly && !can(permissions, PERMISSIONS.MANAGE_MESSAGES)) {
        throw new Error("This channel is read-only.");
      }
      const lockedNow =
        access.server.locked === true &&
        (access.server.lockedUntil === undefined ||
          access.server.lockedUntil > Date.now());
      if (lockedNow && !can(permissions, PERMISSIONS.MANAGE_MESSAGES)) {
        throw new Error(
          "This community is locked — only staff can post right now.",
        );
      }
      if (
        access.server.rulesChannelId !== undefined &&
        channel._id === access.server.rulesChannelId &&
        access.server.ownerId !== userId &&
        !can(permissions, PERMISSIONS.MANAGE_SERVER)
      ) {
        throw new Error(
          "Only people who can manage this server can post in the rules channel.",
        );
      }
      const verification = access.server.verificationLevel ?? "none";
      if (verification !== "none") {
        const thresholds = {
          low: 5 * 60 * 1000,
          medium: 60 * 60 * 1000,
          high: 24 * 60 * 60 * 1000,
        } as const;
        const exempt =
          access.server.ownerId === userId ||
          access.member.roleIds.length > 0 ||
          can(permissions, PERMISSIONS.MANAGE_MESSAGES);
        const accountAge = Date.now() - (user.createdAt ?? Date.now());
        if (!exempt && accountAge < thresholds[verification]) {
          throw new Error(
            verification === "low"
              ? "This community needs accounts that are at least 5 minutes old to talk."
              : verification === "medium"
                ? "This community needs accounts that are at least 1 hour old to talk."
                : "This community needs accounts that are at least 1 day old to talk.",
          );
        }
      }
      if (!can(permissions, PERMISSIONS.SEND_MESSAGES)) {
        throw new Error("You don't have permission to send messages here.");
      }
      if (channel.slowMode && channel.slowMode > 0) {
        const recent = await ctx.db
          .query("messages")
          .withIndex("by_container", (q) =>
            q.eq("containerId", args.containerId),
          )
          .order("desc")
          .take(30);
        const mine = recent.find((message) => message.authorId === userId);
        if (mine) {
          const waitMs =
            channel.slowMode * 1000 - (Date.now() - mine.createdAt);
          if (waitMs > 0) {
            throw new Error(
              `Slow mode is on — wait ${Math.ceil(waitMs / 1000)}s before posting again.`,
            );
          }
        }
      }
      const automod = await evaluateAutomod(ctx, {
        server: access.server,
        channel,
        member: access.member,
        permissions,
        userId,
        content,
      });
      if (automod) {
        await recordAutomodEvent(ctx, {
          serverId: access.server._id,
          channelId: channel._id,
          userId,
          rule: automod.rule,
          content,
        });
        // Do not throw here: Convex rolls back every write in a mutation that
        // throws, including the AutoMod activity row above. Returning the
        // block result commits the event while still keeping the message out
        // of the channel.
        return {
          messageId: null,
          deduped: false,
          blocked: automod.reason,
        };
      }
    } else {
      if (requestedRoleMentions.length > 0) {
        throw new Error(
          "Role mentions can only be used in community channels.",
        );
      }
      dmConversation = access.conversation;
      if (
        dmConversation.type === "dm" &&
        dmConversation.participantIds.length === 2
      ) {
        const other = dmConversation.participantIds.find(
          (id) => id !== userId,
        )!;
        const check = await canSendDirectMessage(ctx, userId, other);
        if (!check.ok) throw new Error(check.reason);
      } else {
        for (const participantId of dmConversation.participantIds) {
          if (
            participantId !== userId &&
            (await isBlockedBetween(ctx, userId, participantId))
          ) {
            throw new Error(
              "You can't post in a group containing someone you blocked or who blocked you.",
            );
          }
        }
      }
    }

    let replyToId: Id<"messages"> | undefined;
    if (args.replyToId) {
      const reply = await ctx.db.get(args.replyToId);
      if (
        !reply ||
        reply.containerType !== args.containerType ||
        reply.containerId !== args.containerId
      ) {
        throw new Error(
          "You can only reply to a message in this conversation.",
        );
      }
      replyToId = reply._id;
    }

    // Cheap abuse guard: at most 5 posts per 5 seconds per account.
    const recentMine = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .order("desc")
      .take(DEFAULT_RATE_WINDOW_MESSAGES);
    const windowStart = Date.now() - SENDER_COOLDOWN_MS;
    // Only rate-limit once the window is actually full. `every()` on an empty
    // (or short) history is true, which would reject an account's first post.
    if (
      recentMine.length >= DEFAULT_RATE_WINDOW_MESSAGES &&
      recentMine.every((message) => message.createdAt > windowStart)
    ) {
      throw new Error("You're sending messages too quickly. Take a breath.");
    }

    const messageId = await ctx.db.insert("messages", {
      containerType: args.containerType,
      containerId: args.containerId,
      authorId: userId,
      content,
      createdAt: Date.now(),
      replyToId,
      clientId: args.clientId,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    for (const attachment of attachments) {
      await claimUpload(
        ctx,
        userId,
        attachment.storageId,
        "message",
        messageId,
      );
    }

    if (args.containerType === "channel") {
      await ctx.db.patch(args.containerId as Id<"channels">, {
        lastMessageAt: Date.now(),
        lastMessageSenderId: userId,
      });
    } else {
      await ctx.db.patch(args.containerId as Id<"conversations">, {
        lastMessageAt: Date.now(),
        lastMessagePreview: content.slice(0, 140),
        lastMessageSenderId: userId,
        updatedAt: Date.now(),
      });
    }
    await markRead(ctx, userId, args.containerId);

    // Mentions and replies notify real people, never the sender.
    const mentionedNames = new Set(
      parseMentions(content).filter(
        (name) => name !== "everyone" && name !== "here",
      ),
    );
    const notified = new Set<string>();
    const link = containerLink(args.containerType, args.containerId, serverId);

    if (args.containerType === "channel") {
      const mentionEveryone = /(^|\s)@everyone\b/i.test(content);
      const mentionHere = /(^|\s)@here\b/i.test(content);
      if (
        (mentionEveryone || mentionHere) &&
        !can(permissions, PERMISSIONS.MENTION_EVERYONE)
      ) {
        throw new Error(
          "You don't have permission to mention @everyone or @here.",
        );
      }

      if (mentionEveryone || mentionHere) {
        const memberships = await ctx.db
          .query("serverMembers")
          .withIndex("by_server", (q) => q.eq("serverId", serverId!))
          .take(1000);
        const now = Date.now();
        for (const membership of memberships) {
          if (
            membership.userId === userId ||
            membership.muted ||
            notified.has(membership.userId)
          ) {
            continue;
          }
          if (
            (await channelNotificationLevel(
              ctx,
              membership.userId,
              args.containerId as Id<"channels">,
            )) === "none"
          ) {
            continue;
          }
          const target = await ctx.db.get(membership.userId);
          if (!target || target.deletedAt !== undefined) continue;
          if (
            mentionHere &&
            (target.status === "invisible" ||
              target.status === "offline" ||
              target.lastSeen === undefined ||
              now - target.lastSeen > PRESENCE_TIMEOUT_MS)
          ) {
            continue;
          }
          notified.add(target._id);
          await notify(ctx, {
            userId: target._id,
            type: "mention",
            title: `${user.name ?? user.username} mentioned ${
              mentionEveryone ? "@everyone" : "@here"
            }`,
            body: content.slice(0, 160),
            actorId: userId,
            link,
            containerKey: args.containerId,
          });
        }
      }

      for (const username of mentionedNames) {
        const target = await getUserByUsername(ctx, username);
        if (!target || target._id === userId || notified.has(target._id))
          continue;
        const membership = await ctx.db
          .query("serverMembers")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId!).eq("userId", target._id),
          )
          .unique();
        if (!membership) continue;
        if (membership.muted) continue;
        if (
          (await channelNotificationLevel(
            ctx,
            target._id,
            args.containerId as Id<"channels">,
          )) === "none"
        ) {
          continue;
        }
        notified.add(target._id);
        await notify(ctx, {
          userId: target._id,
          type: "mention",
          title: `${user.name ?? user.username} mentioned you`,
          body: content.slice(0, 160),
          actorId: userId,
          link,
          containerKey: args.containerId,
        });
      }

      if (mentionedRoles.length > 0) {
        const memberships = await ctx.db
          .query("serverMembers")
          .withIndex("by_server", (q) => q.eq("serverId", serverId!))
          .take(1000);
        const roleMentionBody = mentionedRoles
          .reduce(
            (body, entry) =>
              body.split(`<@&${entry._id}>`).join(`@${entry.name}`),
            content,
          )
          .slice(0, 160);
        for (const role of mentionedRoles) {
          for (const membership of memberships) {
            if (
              membership.userId === userId ||
              membership.muted ||
              !membership.roleIds.includes(role._id) ||
              notified.has(membership.userId)
            ) {
              continue;
            }
            if (
              (await channelNotificationLevel(
                ctx,
                membership.userId,
                args.containerId as Id<"channels">,
              )) === "none"
            ) {
              continue;
            }
            const target = await ctx.db.get(membership.userId);
            if (!target || target.deletedAt !== undefined) continue;
            notified.add(target._id);
            await notify(ctx, {
              userId: target._id,
              type: "mention",
              title: `${user.name ?? user.username} mentioned @${role.name}`,
              body: roleMentionBody,
              actorId: userId,
              link,
              containerKey: args.containerId,
            });
          }
        }
      }

      // Members who explicitly subscribed to every message receive a normal
      // channel notification unless a mention above already notified them.
      const everyMessageSettings = await ctx.db
        .query("channelNotificationSettings")
        .withIndex("by_channel_level", (q) =>
          q
            .eq("channelId", args.containerId as Id<"channels">)
            .eq("level", "all"),
        )
        .take(500);
      for (const setting of everyMessageSettings) {
        if (setting.userId === userId || notified.has(setting.userId)) continue;
        const membership = await ctx.db
          .query("serverMembers")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId!).eq("userId", setting.userId),
          )
          .unique();
        if (!membership || membership.muted) continue;
        notified.add(setting.userId);
        await notify(ctx, {
          userId: setting.userId,
          type: "system",
          title: `${user.name ?? user.username} posted in a followed channel`,
          body: content.slice(0, 160),
          actorId: userId,
          link,
          containerKey: args.containerId,
        });
      }
    } else if (dmConversation) {
      for (const participantId of dmConversation.participantIds) {
        const target = await ctx.db.get(participantId);
        if (!target || !target.username) continue;
        if (!mentionedNames.has(target.username.toLowerCase())) continue;
        if (notified.has(target._id)) continue;
        notified.add(target._id);
        await notify(ctx, {
          userId: target._id,
          type: "mention",
          title: `${user.name ?? user.username} mentioned you`,
          body: content.slice(0, 160),
          actorId: userId,
          link,
          containerKey: args.containerId,
        });
      }
    }

    if (replyToId) {
      const replyTarget = await ctx.db.get(replyToId);
      if (
        replyTarget &&
        replyTarget.containerId === args.containerId &&
        replyTarget.kind !== "bot_response" &&
        replyTarget.authorId !== userId &&
        !notified.has(replyTarget.authorId)
      ) {
        const target = await ctx.db.get(replyTarget.authorId);
        const allowed =
          access.kind === "channel" ||
          (target !== null &&
            dmConversation !== null &&
            dmConversation.participantIds.includes(replyTarget.authorId));
        const targetChannelLevel =
          access.kind === "channel" && target
            ? await channelNotificationLevel(
                ctx,
                target._id,
                args.containerId as Id<"channels">,
              )
            : "mentions";
        if (allowed && !mutedServer && targetChannelLevel !== "none") {
          await notify(ctx, {
            userId: replyTarget.authorId,
            type: "reply",
            title: `${user.name ?? user.username} replied to you`,
            body: content.slice(0, 160),
            actorId: userId,
            link,
            containerKey: args.containerId,
          });
        }
      }
    }

    return { messageId, deduped: false, blocked: null };
  },
});

export const edit = mutation({
  args: { messageId: v.id("messages"), content: v.string() },
  handler: async (ctx, { messageId, content }) => {
    const { id: userId } = await requireActiveUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("That message no longer exists.");
    if (message.kind === "bot_response") {
      throw new Error("Bot responses can't be edited.");
    }
    if (message.authorId !== userId) {
      throw new Error("You can only edit your own messages.");
    }
    const access = await requireReadAccess(
      ctx,
      userId,
      message.containerType,
      message.containerId,
    );
    const trimmed = content.trim();
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }
    if (!trimmed) throw new Error("A message can't be empty.");
    await requireUsableCustomEmojis(ctx, userId, trimmed);
    const editedRoleMentions = parseRoleMentionIds(trimmed);
    if (editedRoleMentions.length > 0) {
      if (access.kind !== "channel") {
        throw new Error(
          "Role mentions can only be used in community channels.",
        );
      }
      for (const rawRoleId of editedRoleMentions) {
        const roleId = ctx.db.normalizeId("serverRoles", rawRoleId);
        const role = roleId ? await ctx.db.get(roleId) : null;
        if (!role || role.serverId !== access.server._id || role.isDefault) {
          throw new Error("That role mention is no longer available.");
        }
        if (
          !role.mentionable &&
          !can(access.permissions, PERMISSIONS.MENTION_EVERYONE)
        ) {
          throw new Error(`The @${role.name} role is not mentionable.`);
        }
      }
    }
    if (
      /(^|\s)@(everyone|here)\b/i.test(trimmed) &&
      access.kind === "channel" &&
      !can(access.permissions, PERMISSIONS.MENTION_EVERYONE)
    ) {
      throw new Error(
        "You don't have permission to mention @everyone or @here.",
      );
    }
    await ctx.db.patch(messageId, { content: trimmed, editedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const { id: userId } = await requireActiveUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) return;
    if (message.authorId !== userId) {
      if (message.containerType !== "channel") {
        throw new Error("You can only delete your own messages.");
      }
      const channel = await ctx.db.get(message.containerId as Id<"channels">);
      if (!channel) throw new Error("That channel no longer exists.");
      const access = await requireServerAccess(ctx, channel.serverId, userId);
      if (!can(access.permissions, PERMISSIONS.MANAGE_MESSAGES)) {
        throw new Error(
          "You need Manage Messages to delete other people's posts.",
        );
      }
      await logAudit(ctx, {
        serverId: channel.serverId,
        actorId: userId,
        action: "message.delete",
        targetType: "message",
        targetId: message._id,
        details: `Deleted a message in #${channel.name}`,
      });
    }
    await deleteMessageData(ctx, message);
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, { messageId, emoji }) => {
    const { id: userId } = await requireActiveUser(ctx);
    const normalized = emoji.trim();
    const customToken = CUSTOM_EMOJI_TOKEN.test(normalized);
    if (!normalized || (!customToken && normalized.length > 32)) {
      throw new Error("That reaction isn't valid.");
    }
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("That message no longer exists.");
    await requireReadAccess(
      ctx,
      userId,
      message.containerType,
      message.containerId,
    );
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_user", (q) =>
        q.eq("messageId", messageId).eq("userId", userId),
      )
      .collect();
    const mine = existing.find((reaction) => reaction.emoji === normalized);
    if (mine) {
      await ctx.db.delete(mine._id);
      return { active: false };
    }
    if (customToken) {
      await requireUsableCustomEmojis(ctx, userId, normalized);
    }
    await ctx.db.insert("reactions", {
      messageId,
      userId,
      emoji: normalized,
      createdAt: Date.now(),
    });
    return { active: true };
  },
});

export const togglePin = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const { id: userId } = await requireActiveUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("That message no longer exists.");
    const access = await requireReadAccess(
      ctx,
      userId,
      message.containerType,
      message.containerId,
    );
    if (
      access.kind === "channel" &&
      !can(access.permissions, PERMISSIONS.MANAGE_MESSAGES)
    ) {
      throw new Error("You need Manage Messages to pin messages here.");
    }
    const pinned = message.pinnedAt === undefined;
    await ctx.db.patch(messageId, {
      pinnedAt: pinned ? Date.now() : undefined,
      pinnedById: pinned ? userId : undefined,
    });
    return { pinned };
  },
});

export const markUnread = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const { id: userId } = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("That message no longer exists.");
    await requireReadAccess(
      ctx,
      userId,
      message.containerType,
      message.containerId,
    );
    const existing = await ctx.db
      .query("reads")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", userId).eq("key", message.containerId),
      )
      .unique();
    const lastReadAt = Math.max(0, message.createdAt - 1);
    if (existing) {
      await ctx.db.patch(existing._id, { lastReadAt, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("reads", {
        userId,
        key: message.containerId,
        lastReadAt,
        updatedAt: Date.now(),
      });
    }
  },
});

export const markContainerRead = mutation({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, { containerType, containerId }) => {
    const { id: userId } = await requireUser(ctx);
    await requireReadAccess(ctx, userId, containerType, containerId);
    await markRead(ctx, userId, containerId);
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .collect();
    for (const note of notes) {
      if (note.containerKey === containerId)
        await ctx.db.patch(note._id, { read: true });
    }
  },
});

/** Marks every channel in a server as read (right-click a server → Mark as read). */
export const markServerRead = mutation({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id: userId } = await requireUser(ctx);
    await requireServerAccess(ctx, serverId, userId);
    const channels = await ctx.db
      .query("channels")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    for (const channel of channels) {
      await markRead(ctx, userId, channel._id);
    }
    const channelIds = new Set(
      channels.map((channel) => channel._id as string),
    );
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .collect();
    for (const note of notes) {
      if (note.containerKey && channelIds.has(note.containerKey)) {
        await ctx.db.patch(note._id, { read: true });
      }
    }
  },
});

/** Records that the user is typing; expires after a few seconds. */
export const setTyping = mutation({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, { containerType, containerId }) => {
    const { id: userId } = await requireActiveUser(ctx);
    await requireReadAccess(ctx, userId, containerType, containerId);
    const now = Date.now();
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_key", (q) => q.eq("key", containerId))
      .collect();
    for (const row of rows) {
      if (row.expiresAt < now || row.userId === userId)
        await ctx.db.delete(row._id);
    }
    await ctx.db.insert("typing", {
      key: containerId,
      userId,
      expiresAt: now + 6_000,
    });
  },
});

export const typingList = query({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, { containerType, containerId }) => {
    const { id: userId } = await requireUser(ctx);
    await requireReadAccess(ctx, userId, containerType, containerId);
    const now = Date.now();
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_key", (q) => q.eq("key", containerId))
      .collect();
    const users = await hydrateUsers(
      ctx,
      rows.filter((row) => row.expiresAt > now).map((row) => row.userId),
      userId,
    );
    return rows
      .filter((row) => row.expiresAt > now && row.userId !== userId)
      .map((row) => users.get(row.userId))
      .filter((user): user is NonNullable<typeof user> => Boolean(user));
  },
});
