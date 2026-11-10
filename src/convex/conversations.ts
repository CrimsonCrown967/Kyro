import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./functions";
import {
  assertNoBlockedPairs,
  canSendDirectMessage,
  hydrateUsers,
  requireActiveUser,
  requireProfile,
  requireUser,
  type Ctx,
} from "./lib";
import { deleteConversationData } from "./cleanup";

async function loadConversations(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"conversations">[]> {
  const rows = await ctx.db
    .query("conversationMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const conversations = await Promise.all(
    rows.map((row) => ctx.db.get(row.conversationId)),
  );
  return conversations.filter(
    (conv): conv is Doc<"conversations"> => conv !== null,
  );
}

async function hydrateConversation(
  ctx: Ctx,
  conversations: Doc<"conversations">[],
  viewerId: Id<"users">,
) {
  const reads = await ctx.db
    .query("reads")
    .withIndex("by_user", (q) => q.eq("userId", viewerId))
    .collect();
  const readMap = new Map(reads.map((read) => [read.key, read.lastReadAt]));
  const users = await hydrateUsers(
    ctx,
    conversations.flatMap((conv) => conv.participantIds),
    viewerId,
  );
  return conversations.map((conv) => {
    const lastReadAt = readMap.get(conv._id) ?? 0;
    const lastMessageAt = conv.lastMessageAt ?? 0;
    const participants = conv.participantIds
      .map((id) => users.get(id))
      .filter((user): user is NonNullable<typeof user> => Boolean(user));
    return {
      id: conv._id,
      type: conv.type,
      name: conv.name ?? null,
      ownerId: conv.ownerId ?? null,
      participantIds: conv.participantIds.map((id) => id as string),
      participants,
      pairKey: conv.pairKey ?? null,
      createdAt: conv.createdAt,
      lastMessageAt,
      lastMessagePreview: conv.lastMessagePreview ?? null,
      lastMessageSenderId: (conv.lastMessageSenderId as string | undefined) ?? null,
      lastReadAt,
      unread: lastMessageAt > lastReadAt,
    };
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const conversations = await loadConversations(ctx, id);
    const hydrated = await hydrateConversation(ctx, conversations, id);
    return hydrated.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const { id } = await requireUser(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || !conversation.participantIds.includes(id)) return null;
    const [hydrated] = await hydrateConversation(ctx, [conversation], id);
    return hydrated;
  },
});

async function ensureMemberRows(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  userIds: Id<"users">[],
  joinedAt = Date.now(),
): Promise<void> {
  for (const userId of userIds) {
    const existing = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", userId).eq("conversationId", conversationId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId,
        joinedAt,
      });
    }
  }
}

/** Opens (or reuses) a 1:1 conversation, enforcing blocks and privacy. */
export const createDirect = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { id } = await requireProfile(ctx);
    const check = await canSendDirectMessage(ctx, id, userId);
    if (!check.ok) throw new Error(check.reason);

    const pairKey = [id, userId].sort().join(":");
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_pair", (q) => q.eq("pairKey", pairKey))
      .unique();
    if (existing) {
      await ensureMemberRows(ctx, existing._id, [id, userId]);
      return existing._id;
    }
    const conversationId = await ctx.db.insert("conversations", {
      type: "dm",
      participantIds: [id, userId],
      pairKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ensureMemberRows(ctx, conversationId, [id, userId]);
    return conversationId;
  },
});

/** Starts a group direct message with 2–9 other people. */
export const createGroup = mutation({
  args: {
    userIds: v.array(v.id("users")),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { userIds, name }) => {
    const { id } = await requireProfile(ctx);
    const unique = Array.from(new Set(userIds)).filter((user) => user !== id);
    if (unique.length < 2) {
      throw new Error("Pick at least two other people for a group.");
    }
    if (unique.length > 9) throw new Error("Group messages hold up to 10 people.");
    for (const other of unique) {
      const check = await canSendDirectMessage(ctx, id, other);
      if (!check.ok) throw new Error(check.reason);
    }
    const participantIds = [id, ...unique];
    await assertNoBlockedPairs(ctx, participantIds);
    const conversationId = await ctx.db.insert("conversations", {
      type: "group",
      participantIds,
      name: name?.trim().slice(0, 60) || undefined,
      ownerId: id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ensureMemberRows(ctx, conversationId, participantIds);
    return conversationId;
  },
});

export const addParticipants = mutation({
  args: { conversationId: v.id("conversations"), userIds: v.array(v.id("users")) },
  handler: async (ctx, { conversationId, userIds }) => {
    const { id } = await requireProfile(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || !conversation.participantIds.includes(id)) {
      throw new Error("You're not part of that conversation.");
    }
    if (conversation.type !== "group") {
      throw new Error("Only group messages can take new members.");
    }
    if (conversation.ownerId !== id) {
      throw new Error("Only the group owner can add new people.");
    }
    const additions = Array.from(new Set(userIds)).filter(
      (userId) => !conversation.participantIds.includes(userId),
    );
    if (conversation.participantIds.length + additions.length > 10) {
      throw new Error("Group messages hold up to 10 people.");
    }
    for (const other of additions) {
      const check = await canSendDirectMessage(ctx, id, other);
      if (!check.ok) throw new Error(check.reason);
    }
    await assertNoBlockedPairs(ctx, [
      ...conversation.participantIds,
      ...additions,
    ]);
    await ctx.db.patch(conversationId, {
      participantIds: [...conversation.participantIds, ...additions],
      updatedAt: Date.now(),
    });
    await ensureMemberRows(ctx, conversationId, additions);
  },
});

export const rename = mutation({
  args: { conversationId: v.id("conversations"), name: v.string() },
  handler: async (ctx, { conversationId, name }) => {
    const { id } = await requireActiveUser(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.ownerId !== id) {
      throw new Error("Only the person who started this group can rename it.");
    }
    await ctx.db.patch(conversationId, {
      name: name.trim().slice(0, 60),
      updatedAt: Date.now(),
    });
  },
});

export const leave = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const { id } = await requireUser(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || !conversation.participantIds.includes(id)) return;
    const row = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", id).eq("conversationId", conversationId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);

    const remaining = conversation.participantIds.filter((user) => user !== id);
    if (conversation.type === "group") {
      if (remaining.length === 0) {
        await deleteConversationData(ctx, conversation);
        return;
      }
      await ctx.db.patch(conversationId, {
        participantIds: remaining,
        ownerId: conversation.ownerId === id ? remaining[0] : conversation.ownerId,
        updatedAt: Date.now(),
      });
    }
  },
});
