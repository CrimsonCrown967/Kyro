import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import {
  requireActiveUser,
  requireConversationAccess,
  requireServerAccess,
  requireUser,
  type Ctx,
} from "./lib";

async function requireMessageAccess(
  ctx: Ctx,
  userId: Id<"users">,
  messageId: Id<"messages">,
) {
  const message = await ctx.db.get(messageId);
  if (!message) throw new Error("That poll message no longer exists.");
  if (message.containerType === "channel") {
    const channel = await ctx.db.get(message.containerId as Id<"channels">);
    if (!channel) throw new Error("That channel no longer exists.");
    await requireServerAccess(ctx, channel.serverId, userId);
  } else {
    await requireConversationAccess(
      ctx,
      message.containerId as Id<"conversations">,
      userId,
      { enforceBlocks: false },
    );
  }
  return message;
}

export const attach = mutation({
  args: {
    messageId: v.id("messages"),
    question: v.string(),
    options: v.array(v.string()),
    multiple: v.boolean(),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { messageId, question, options, multiple, durationMinutes },
  ) => {
    const { id } = await requireActiveUser(ctx);
    const message = await requireMessageAccess(ctx, id, messageId);
    if (message.authorId !== id) {
      throw new Error("You can only attach a poll to your own message.");
    }
    const existing = await ctx.db
      .query("polls")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .unique();
    if (existing) return existing._id;
    const cleanQuestion = question.trim().slice(0, 200);
    const cleanOptions = options
      .map((option) => option.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 10);
    if (cleanQuestion.length < 3)
      throw new Error("Poll questions need 3+ characters.");
    if (cleanOptions.length < 2)
      throw new Error("Polls need at least two options.");
    const now = Date.now();
    const minutes = durationMinutes
      ? Math.max(5, Math.min(Math.floor(durationMinutes), 7 * 24 * 60))
      : null;
    return await ctx.db.insert("polls", {
      messageId,
      createdById: id,
      question: cleanQuestion,
      options: cleanOptions.map((text, index) => ({
        id: `option-${index + 1}`,
        text,
      })),
      multiple,
      createdAt: now,
      closesAt: minutes ? now + minutes * 60_000 : undefined,
    });
  },
});

export const vote = mutation({
  args: { pollId: v.id("polls"), optionIds: v.array(v.string()) },
  handler: async (ctx, { pollId, optionIds }) => {
    const { id } = await requireUser(ctx);
    const poll = await ctx.db.get(pollId);
    if (!poll) throw new Error("That poll no longer exists.");
    await requireMessageAccess(ctx, id, poll.messageId);
    if (
      poll.closedAt !== undefined ||
      (poll.closesAt !== undefined && poll.closesAt <= Date.now())
    ) {
      throw new Error("This poll is closed.");
    }
    const valid = new Set(poll.options.map((option) => option.id));
    const choices = Array.from(new Set(optionIds)).filter((optionId) =>
      valid.has(optionId),
    );
    if (!poll.multiple && choices.length > 1) choices.splice(1);
    const existing = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll_user", (q) => q.eq("pollId", pollId).eq("userId", id))
      .unique();
    if (choices.length === 0) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        optionIds: choices,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("pollVotes", {
        pollId,
        userId: id,
        optionIds: choices,
        updatedAt: Date.now(),
      });
    }
  },
});

export const close = mutation({
  args: { pollId: v.id("polls") },
  handler: async (ctx, { pollId }) => {
    const { id } = await requireActiveUser(ctx);
    const poll = await ctx.db.get(pollId);
    if (!poll) throw new Error("That poll no longer exists.");
    if (poll.createdById !== id) {
      throw new Error("Only the poll creator can close it.");
    }
    await ctx.db.patch(pollId, { closedAt: Date.now() });
  },
});
