import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import {
  canSendDirectMessage,
  getUserByUsername,
  hydrateUsers,
  isBlockedBetween,
  notify,
  requireActiveUser,
  requireProfile,
  requireUser,
  restrictionLevel,
  type Ctx,
} from "./lib";

export type Connection = {
  _id: Id<"connections">;
  requesterId: Id<"users">;
  addresseeId: Id<"users">;
  status: "pending" | "accepted";
  createdAt: number;
  updatedAt: number;
};

/** Friend requests, friendships and blocks for the signed-in user. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const [outgoing, incoming, blockRows] = await Promise.all([
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
    ]);

    const friendIds = [
      ...outgoing.filter((c) => c.status === "accepted").map((c) => c.addresseeId),
      ...incoming.filter((c) => c.status === "accepted").map((c) => c.requesterId),
    ];
    const pendingIds = [
      ...outgoing.filter((c) => c.status === "pending").map((c) => c.addresseeId),
      ...incoming.filter((c) => c.status === "pending").map((c) => c.requesterId),
    ];
    const users = await hydrateUsers(ctx, [...friendIds, ...pendingIds, ...blockRows.map((b) => b.blockedId)], id);

    return {
      friends: friendIds
        .map((friendId) => users.get(friendId))
        .filter((user): user is NonNullable<typeof user> => Boolean(user)),
      incoming: incoming
        .filter((c) => c.status === "pending")
        .map((c) => ({
          connectionId: c._id,
          createdAt: c.createdAt,
          user: users.get(c.requesterId) ?? null,
        })),
      outgoing: outgoing
        .filter((c) => c.status === "pending")
        .map((c) => ({
          connectionId: c._id,
          createdAt: c.createdAt,
          user: users.get(c.addresseeId) ?? null,
        })),
      blocked: blockRows.map((b) => ({
        blockId: b._id,
        createdAt: b.createdAt,
        user: users.get(b.blockedId) ?? null,
      })),
    };
  },
});

async function findConnection(
  ctx: Ctx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<Connection | null> {
  const forward = await ctx.db
    .query("connections")
    .withIndex("by_requester_addressee", (q) =>
      q.eq("requesterId", a).eq("addresseeId", b),
    )
    .unique();
  if (forward) return forward;
  return await ctx.db
    .query("connections")
    .withIndex("by_requester_addressee", (q) =>
      q.eq("requesterId", b).eq("addresseeId", a),
    )
    .unique();
}

export const sendRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
  },
  handler: async (ctx, { userId, username }) => {
    const { id, user } = await requireProfile(ctx);
    const target = userId
      ? await ctx.db.get(userId)
      : username
        ? await getUserByUsername(ctx, username)
        : null;
    if (!target) throw new Error("We couldn't find a user with that username.");
    if (target._id === id) throw new Error("You can't add yourself as a friend.");

    const level = await restrictionLevel(ctx, id);
    if (level >= 3) {
      throw new Error("Your account is suspended while staff review it.");
    }
    if (level >= 1) {
      throw new Error(
        "Your account is limited — friend requests are off right now.",
      );
    }

    if (await isBlockedBetween(ctx, id, target._id)) {
      throw new Error("You can't send this user a friend request.");
    }
    if (target.allowFriendRequests === false) {
      throw new Error("This user isn't accepting friend requests.");
    }

    const existing = await findConnection(ctx, id, target._id);
    if (existing?.status === "accepted") throw new Error("You're already friends.");
    if (existing?.status === "pending") {
      throw new Error(
        existing.requesterId === id
          ? "You already sent this user a friend request."
          : "This user already sent you a request — accept it instead.",
      );
    }

    await ctx.db.insert("connections", {
      requesterId: id,
      addresseeId: target._id,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await notify(ctx, {
      userId: target._id,
      type: "friend_request",
      title: "New friend request",
      body: `${user.name ?? "Someone"} wants to be your friend`,
      actorId: id,
      link: "/dashboard?tab=pending",
    });
  },
});

export const respond = mutation({
  args: { connectionId: v.id("connections"), accept: v.boolean() },
  handler: async (ctx, { connectionId, accept }) => {
    const { id, user } = await requireActiveUser(ctx);
    const connection = await ctx.db.get(connectionId);
    if (!connection) throw new Error("That friend request no longer exists.");
    if (connection.addresseeId !== id) {
      throw new Error("That friend request wasn't sent to you.");
    }
    if (connection.status !== "pending") {
      throw new Error("That request has already been handled.");
    }
    if (await isBlockedBetween(ctx, id, connection.requesterId)) {
      throw new Error("That request is unavailable because of a block.");
    }
    if (!accept) {
      await ctx.db.delete(connectionId);
      return;
    }
    await ctx.db.patch(connectionId, { status: "accepted", updatedAt: Date.now() });
    await notify(ctx, {
      userId: connection.requesterId,
      type: "friend_accept",
      title: "Friend request accepted",
      body: `${user.name ?? "Someone"} accepted your request`,
      actorId: id,
      link: "/dashboard",
    });
  },
});

export const cancel = mutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const { id } = await requireUser(ctx);
    const connection = await ctx.db.get(connectionId);
    if (!connection) throw new Error("That request no longer exists.");
    if (connection.requesterId !== id) {
      throw new Error("You can only cancel requests you sent.");
    }
    await ctx.db.delete(connectionId);
  },
});

export const removeFriend = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { id } = await requireUser(ctx);
    const connection = await findConnection(ctx, id, userId);
    if (!connection || connection.status !== "accepted") {
      throw new Error("This user isn't on your friends list.");
    }
    await ctx.db.delete(connection._id);
  },
});

export const block = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { id } = await requireUser(ctx);
    if (userId === id) throw new Error("You can't block yourself.");
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", id).eq("blockedId", userId))
      .unique();
    if (existing) return;
    await ctx.db.insert("blocks", { blockerId: id, blockedId: userId, createdAt: Date.now() });
    const connection = await findConnection(ctx, id, userId);
    if (connection) await ctx.db.delete(connection._id);
  },
});

export const unblock = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { id } = await requireUser(ctx);
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", id).eq("blockedId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Mutual servers shown on profile popovers. */
export const mutualContext = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { id } = await requireUser(ctx);
    const check = await canSendDirectMessage(ctx, id, userId);
    const connection = await findConnection(ctx, id, userId);
    return {
      canMessage: check.ok,
      messageReason: check.ok ? null : check.reason,
      friendship: connection?.status ?? null,
    };
  },
});
