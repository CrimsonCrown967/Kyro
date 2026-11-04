import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { deleteConversationData, deleteMessageData } from "./cleanup";
import { configuredFounderId } from "./lib";

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
      removedMessages: dryRun
        ? 0
        : removedMessages,
      wouldRemoveMessages: dryRun
        ? batch.reduce((total, entry) => total + entry.hellos.length, 0)
        : undefined,
      remainingConversations: actionable.length - batch.length,
      done: actionable.length <= batch.length,
    };
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
