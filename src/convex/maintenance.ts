import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import {
  deleteConversationData,
  deleteMessageData,
  deleteServerData,
} from "./cleanup";
import { configuredFounderId, isSyntheticUser } from "./lib";
import { deleteStorageObjectIfPresent } from "./uploadSecurity";

type GreetingTarget = "jayc" | "adrianeosyne";

/**
 * Removes the synthetic "Hello" DM campaign sent to jayc and adrianeosyne.
 *
 * A conversation is deleted in full when it was created during the campaign
 * (the real recipients' replies, such as jayc's "Who r u?", belong to that
 * synthetic thread). Older conversations only lose the seeded greeting
 * messages and keep their remaining history. The mutation is batched and
 * idempotent; call it repeatedly until `done` is true.
 *
 * Target ids are supplied by the caller on purpose: reading the target user
 * documents here would race their 15-second heartbeat and abort the cleanup
 * with an optimistic-concurrency failure.
 */
export const purgeSyntheticGreetings = internalMutation({
  args: {
    cutoff: v.number(),
    targets: v.array(
      v.object({
        key: v.union(v.literal("jayc"), v.literal("adrianeosyne")),
        userId: v.id("users"),
      }),
    ),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { cutoff, targets, batchSize, dryRun }) => {
    const limit = Math.max(1, Math.min(batchSize ?? 100, 200));
    if (targets.length === 0) {
      throw new Error("No greeting target accounts were supplied.");
    }

    // Narrow candidates through the membership index instead of scanning all
    // conversations. This keeps each batch comfortably inside transaction
    // read limits even with hundreds of thousands of messages.
    const candidates = new Map<Id<"conversations">, Set<GreetingTarget>>();
    for (const target of targets) {
      const rows = await ctx.db
        .query("conversationMembers")
        .withIndex("by_user", (q) => q.eq("userId", target.userId))
        .collect();
      for (const row of rows) {
        const keys = candidates.get(row.conversationId) ?? new Set();
        keys.add(target.key);
        candidates.set(row.conversationId, keys);
      }
    }

    type Actionable = {
      conversation: Doc<"conversations">;
      hellos: Doc<"messages">[];
      messages: Doc<"messages">[];
    };
    const actionable: Actionable[] = [];
    let scanned = 0;

    for (const [conversationId, targetKeys] of candidates) {
      scanned += 1;
      const conversation = await ctx.db.get(conversationId);
      if (
        !conversation ||
        conversation.type !== "dm" ||
        conversation.participantIds.length !== 2
      ) {
        continue;
      }

      const messages = await ctx.db
        .query("messages")
        .withIndex("by_container", (q) => q.eq("containerId", conversationId))
        .collect();
      const hellos = messages.filter((message) => {
        if (message.content !== "Hello" || !message.clientId) return false;
        return [...targetKeys].some((key) =>
          message.clientId!.startsWith(`hello-${key}-`),
        );
      });
      if (hellos.length === 0) continue;

      actionable.push({ conversation, hellos, messages });
    }

    const batch = actionable.slice(0, limit);
    let deletedConversations = 0;
    let trimmedConversations = 0;
    let removedMessages = 0;

    if (!dryRun) {
      for (const entry of batch) {
        if (entry.conversation.createdAt >= cutoff) {
          await deleteConversationData(ctx, entry.conversation);
          deletedConversations += 1;
          removedMessages += entry.hellos.length;
          continue;
        }

        // Older conversation: remove only the seeded greetings and rebuild
        // the preview from what remains.
        const helloIds = new Set(entry.hellos.map((hello) => hello._id));
        for (const hello of entry.hellos) {
          await deleteMessageData(ctx, hello);
        }
        const remaining = entry.messages
          .filter((message) => !helloIds.has(message._id))
          .sort((a, b) => b.createdAt - a.createdAt);
        const last = remaining[0];
        await ctx.db.patch(entry.conversation._id, {
          lastMessageAt: last?.createdAt,
          lastMessagePreview: last?.content.slice(0, 140),
          lastMessageSenderId: last?.authorId,
          updatedAt: Date.now(),
        });
        trimmedConversations += 1;
        removedMessages += entry.hellos.length;
      }
    }

    return {
      cutoff,
      dryRun: dryRun === true,
      scannedConversations: scanned,
      actionableConversations: actionable.length,
      processedConversations: dryRun ? 0 : batch.length,
      deletedConversations,
      trimmedConversations,
      removedMessages: dryRun ? 0 : removedMessages,
      wouldRemoveMessages: dryRun
        ? batch.reduce((total, entry) => total + entry.hellos.length, 0)
        : undefined,
      remainingConversations: actionable.length - batch.length,
      done: actionable.length <= batch.length,
    };
  },
});

/**
 * Permanently remove explicitly supplied seeded accounts and the application
 * data/auth sessions attached to them. The caller supplies ids so this job
 * does not scan (and conflict with heartbeats on) the whole users table.
 *
 * Every id is checked against the reserved seed-email suffix before any write,
 * making it impossible to remove a real account with this maintenance job.
 */
export const purgeSyntheticAccounts = internalMutation({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    if (userIds.length === 0 || userIds.length > 25) {
      throw new Error("Supply between 1 and 25 seeded account ids.");
    }

    const uniqueIds = [...new Set(userIds)];
    const users = await Promise.all(
      uniqueIds.map((userId) => ctx.db.get(userId)),
    );
    for (const user of users) {
      if (user && !isSyntheticUser(user)) {
        throw new Error(
          `Refusing to delete non-seeded account ${user.username ?? user._id}.`,
        );
      }
    }

    let removed = 0;
    let missing = 0;
    for (const user of users) {
      if (!user) {
        missing += 1;
        continue;
      }
      const id = user._id;

      // Synthetic-owned communities and conversations are synthetic data too.
      const ownedServers = await ctx.db
        .query("servers")
        .withIndex("by_owner", (q) => q.eq("ownerId", id))
        .collect();
      for (const server of ownedServers) await deleteServerData(ctx, server);

      const conversationRows = await ctx.db
        .query("conversationMembers")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect();
      for (const row of conversationRows) {
        const conversation = await ctx.db.get(row.conversationId);
        if (conversation) await deleteConversationData(ctx, conversation);
      }

      const [
        memberships,
        notifications,
        actorNotifications,
        reads,
        outgoingConnections,
        incomingConnections,
        outgoingBlocks,
        incomingBlocks,
        sessions,
        accounts,
        securityRows,
        passkeys,
        targetCases,
        moderatorCases,
        emailOutbox,
        verificationCodes,
        livekitTickets,
        uploads,
        ownMessages,
        threadMessages,
        forumPosts,
        forumComments,
        reportedReports,
        filedReports,
        applications,
        automodEvents,
        warnings,
        voiceSessions,
        notificationSettings,
        siteBans,
        adminActions,
        bugReports,
      ] = await Promise.all([
        ctx.db
          .query("serverMembers")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("notifications")
          .withIndex("by_actor", (q) => q.eq("actorId", id))
          .collect(),
        ctx.db
          .query("reads")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("connections")
          .withIndex("by_requester", (q) => q.eq("requesterId", id))
          .collect(),
        ctx.db
          .query("connections")
          .withIndex("by_addressee", (q) => q.eq("addresseeId", id))
          .collect(),
        ctx.db
          .query("blocks")
          .withIndex("by_blocker", (q) => q.eq("blockerId", id))
          .collect(),
        ctx.db
          .query("blocks")
          .withIndex("by_blocked", (q) => q.eq("blockedId", id))
          .collect(),
        ctx.db
          .query("authSessions")
          .withIndex("userId", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("accountSecurity")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("passkeyCredentials")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("moderationCases")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("moderationCases")
          .withIndex("by_moderator", (q) => q.eq("moderatorId", id))
          .collect(),
        ctx.db
          .query("emailOutbox")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("emailVerificationCodes")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("livekitTickets")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("uploads")
          .withIndex("by_owner", (q) => q.eq("ownerId", id))
          .collect(),
        ctx.db
          .query("messages")
          .withIndex("by_author", (q) => q.eq("authorId", id))
          .collect(),
        ctx.db
          .query("threadMessages")
          .withIndex("by_author", (q) => q.eq("authorId", id))
          .collect(),
        ctx.db
          .query("forumPosts")
          .withIndex("by_author", (q) => q.eq("authorId", id))
          .collect(),
        ctx.db
          .query("forumComments")
          .withIndex("by_author", (q) => q.eq("authorId", id))
          .collect(),
        ctx.db
          .query("reports")
          .withIndex("by_reported", (q) => q.eq("reportedUserId", id))
          .collect(),
        ctx.db
          .query("reports")
          .withIndex("by_reporter", (q) => q.eq("reporterId", id))
          .collect(),
        ctx.db
          .query("joinApplications")
          .withIndex("by_user_server", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("automodEvents")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("warnings")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("voiceSessions")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("channelNotificationSettings")
          .withIndex("by_user_channel", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("siteBans")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect(),
        ctx.db
          .query("adminActions")
          .withIndex("by_actor", (q) => q.eq("actorId", id))
          .collect(),
        ctx.db
          .query("bugReports")
          .withIndex("by_reporter", (q) => q.eq("reporterId", id))
          .collect(),
      ]);

      for (const message of ownMessages) await deleteMessageData(ctx, message);
      for (const post of forumPosts) {
        const comments = await ctx.db
          .query("forumComments")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect();
        for (const comment of comments) await ctx.db.delete(comment._id);
        await ctx.db.delete(post._id);
      }

      const directRows = [
        ...memberships,
        ...notifications,
        ...actorNotifications,
        ...reads,
        ...outgoingConnections,
        ...incomingConnections,
        ...outgoingBlocks,
        ...incomingBlocks,
        ...securityRows,
        ...passkeys,
        ...targetCases,
        ...moderatorCases,
        ...emailOutbox,
        ...verificationCodes,
        ...livekitTickets,
        ...threadMessages,
        ...forumComments,
        ...reportedReports,
        ...filedReports,
        ...applications,
        ...automodEvents,
        ...warnings,
        ...voiceSessions,
        ...notificationSettings,
        ...siteBans,
        ...adminActions,
        ...bugReports,
      ];
      const directIds = new Set(directRows.map((row) => row._id));
      for (const rowId of directIds) {
        const row = await ctx.db.get(rowId);
        if (row) await ctx.db.delete(rowId);
      }

      for (const session of sessions) {
        const tokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .collect();
        for (const token of tokens) await ctx.db.delete(token._id);
        await ctx.db.delete(session._id);
      }
      for (const account of accounts) await ctx.db.delete(account._id);

      for (const upload of uploads) {
        await deleteStorageObjectIfPresent(ctx, upload.storageId);
        const uploadRow = await ctx.db.get(upload._id);
        if (uploadRow) await ctx.db.delete(upload._id);
      }

      if (user.email) {
        const [verificationRequests, resetCodes, resetRequests] =
          await Promise.all([
            ctx.db
              .query("emailVerificationRequests")
              .withIndex("by_email", (q) => q.eq("email", user.email!))
              .collect(),
            ctx.db
              .query("passwordResetCodes")
              .withIndex("by_email", (q) => q.eq("email", user.email!))
              .collect(),
            ctx.db
              .query("passwordResetRequests")
              .withIndex("by_email", (q) => q.eq("email", user.email!))
              .collect(),
          ]);
        for (const row of [
          ...verificationRequests,
          ...resetCodes,
          ...resetRequests,
        ]) {
          await ctx.db.delete(row._id);
        }
      }

      await ctx.db.delete(id);
      removed += 1;
    }

    return { requested: uniqueIds.length, removed, missing };
  },
});

/** Idempotent one-off used to keep the Kyro service identity official. */
export const markOfficialAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const kyro = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", "kyro"))
      .unique();
    if (!kyro)
      throw new Error('The account with username "kyro" was not found.');
    await ctx.db.patch(kyro._id, { name: "Kyro", official: true });

    const founderId = configuredFounderId();
    let founderOfficialRemoved = false;
    if (founderId) {
      const founder = await ctx.db.get(founderId as typeof kyro._id);
      if (founder?.official === true) {
        await ctx.db.patch(founder._id, { official: undefined });
        founderOfficialRemoved = true;
      }
    }
    return {
      kyroUserId: kyro._id,
      founderOfficialRemoved,
    };
  },
});
