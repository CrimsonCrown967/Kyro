import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  canSendDirectMessage,
  hydrateUsers,
  requireActiveUser,
  requireConversationAccess,
  requireServerAccess,
  requireUser,
  type Ctx,
} from "./lib";
import {
  channelPermissions,
  hasPermission,
  PERMISSIONS,
} from "../lib/permissions";

/**
 * Live audio for Kyro: voice channels in communities and voice calls in DMs.
 *
 * There is no media server — peers connect to each other directly over WebRTC
 * and use Convex purely as the presence roster and the signaling relay
 * (offers, answers and ICE candidates), which is plenty for rooms of this
 * size. A session row doubles as the liveness heartbeat.
 */

/** Sessions that haven't been touched in this long are considered gone. */
const SESSION_TTL_MS = 45_000;
const MAX_ROOM_PARTICIPANTS = 12;
const MAX_SIGNAL_BYTES = 20_000;
const SIGNAL_WINDOW_MS = 60_000;
const MAX_SIGNALS_PER_WINDOW = 240;

export type VoiceContainerType = "channel" | "conversation";

async function requireVoiceAccess(
  ctx: Ctx,
  userId: Id<"users">,
  containerType: VoiceContainerType,
  containerId: string,
): Promise<void> {
  if (containerType === "channel") {
    const channel = await ctx.db.get(containerId as Id<"channels">);
    if (!channel || channel.kind !== "voice") {
      throw new Error("That voice channel no longer exists.");
    }
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
    if (
      !hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL) ||
      !hasPermission(permissions, PERMISSIONS.CONNECT_VOICE)
    ) {
      throw new Error("You do not have permission to join that voice channel.");
    }
    return;
  }
  await requireConversationAccess(
    ctx,
    containerId as Id<"conversations">,
    userId,
  );
}

async function activeSeat(
  ctx: Ctx,
  userId: Id<"users">,
  containerType: VoiceContainerType,
  containerId: string,
): Promise<Doc<"voiceSessions"> | null> {
  const rows = await ctx.db
    .query("voiceSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const cutoff = Date.now() - SESSION_TTL_MS;
  return (
    rows.find(
      (row) =>
        row.containerType === containerType &&
        row.containerId === containerId &&
        row.lastSeenAt > cutoff,
    ) ?? null
  );
}

async function activeSessions(
  ctx: Ctx,
  containerType: VoiceContainerType,
  containerId: string,
): Promise<Doc<"voiceSessions">[]> {
  const rows = await ctx.db
    .query("voiceSessions")
    .withIndex("by_container", (q) =>
      q.eq("containerType", containerType).eq("containerId", containerId),
    )
    .collect();
  const cutoff = Date.now() - SESSION_TTL_MS;
  return rows.filter((row) => row.lastSeenAt > cutoff);
}

/** Join (or refresh) this account's seat in a voice room. */
export const join = mutation({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
    muted: v.optional(v.boolean()),
    deafened: v.optional(v.boolean()),
    camera: v.optional(v.boolean()),
    sharing: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { containerType, containerId, muted, deafened, camera, sharing },
  ) => {
    const { id } = await requireActiveUser(ctx);
    await requireVoiceAccess(ctx, id, containerType, containerId);
    const now = Date.now();
    const existing = await ctx.db
      .query("voiceSessions")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect();
    const mine = existing.find(
      (row) =>
        row.containerType === containerType && row.containerId === containerId,
    );
    if (mine) {
      await ctx.db.patch(mine._id, {
        lastSeenAt: now,
        ...(muted !== undefined ? { muted } : {}),
        ...(deafened !== undefined ? { deafened } : {}),
        ...(camera !== undefined ? { camera } : {}),
        ...(sharing !== undefined ? { sharing } : {}),
      });
      return;
    }
    const room = await ctx.db
      .query("voiceSessions")
      .withIndex("by_container", (q) =>
        q.eq("containerType", containerType).eq("containerId", containerId),
      )
      .collect();
    const live = room.filter((row) => row.lastSeenAt > now - SESSION_TTL_MS);
    for (const stale of room.filter(
      (row) => row.lastSeenAt <= now - SESSION_TTL_MS,
    )) {
      await ctx.db.delete(stale._id);
    }
    if (live.length >= MAX_ROOM_PARTICIPANTS) {
      throw new Error("That voice room is full.");
    }
    // One seat per account: leaving a previous room is implied by joining here.
    for (const row of existing) await ctx.db.delete(row._id);
    await ctx.db.insert("voiceSessions", {
      containerType,
      containerId,
      userId: id,
      joinedAt: now,
      lastSeenAt: now,
      muted: muted ?? false,
      deafened: deafened ?? false,
      camera: camera ?? false,
      sharing: sharing ?? false,
    });
  },
});

/** Drop this account's seat — called on hang-up and on page unload. */
export const leave = mutation({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, { containerType, containerId }) => {
    const { id } = await requireActiveUser(ctx);
    const rows = await ctx.db
      .query("voiceSessions")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect();
    for (const row of rows) {
      if (
        row.containerType === containerType &&
        row.containerId === containerId
      ) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

/** Who is in the room right now, hydrated for the roster UI. */
export const roster = query({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, { containerType, containerId }) => {
    const { id } = await requireActiveUser(ctx);
    await requireVoiceAccess(ctx, id, containerType, containerId);
    const sessions = await activeSessions(ctx, containerType, containerId);
    const users = await hydrateUsers(
      ctx,
      sessions.map((session) => session.userId),
      id,
    );
    return sessions.map((session) => ({
      userId: session.userId as string,
      muted: session.muted === true,
      deafened: session.deafened === true,
      camera: session.camera === true,
      sharing: session.sharing === true,
      joinedAt: session.joinedAt,
      user: users.get(session.userId) ?? null,
    }));
  },
});

/**
 * Signaling relay: everyone in the room can see messages addressed to them.
 * Rows are cleaned up as they're read so the table never grows unbounded.
 */
export const signals = query({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, { containerType, containerId }) => {
    const { id } = await requireUser(ctx);
    await requireVoiceAccess(ctx, id, containerType, containerId);
    if (!(await activeSeat(ctx, id, containerType, containerId))) {
      throw new Error("Join the voice room before receiving signals.");
    }
    const key = `${containerType}:${containerId}`;
    const rows = await ctx.db
      .query("voiceSignals")
      .withIndex("by_to_container", (q) =>
        q.eq("toId", id).eq("containerKey", key),
      )
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => ({
        id: row._id as string,
        fromId: row.fromId as string,
        kind: row.kind,
        payload: row.payload,
        createdAt: row.createdAt,
      }));
  },
});

export const signal = mutation({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
    toId: v.id("users"),
    kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const { id } = await requireActiveUser(ctx);
    if (args.toId === id) return;
    await requireVoiceAccess(ctx, id, args.containerType, args.containerId);
    await requireVoiceAccess(
      ctx,
      args.toId,
      args.containerType,
      args.containerId,
    );
    const [fromSeat, toSeat] = await Promise.all([
      activeSeat(ctx, id, args.containerType, args.containerId),
      activeSeat(ctx, args.toId, args.containerType, args.containerId),
    ]);
    if (!fromSeat || !toSeat) {
      throw new Error("Both people must be in the same voice room.");
    }
    if (args.payload.length > MAX_SIGNAL_BYTES) {
      throw new Error("That voice signal is too large.");
    }
    try {
      const parsed = JSON.parse(args.payload) as unknown;
      if (!parsed || typeof parsed !== "object") throw new Error();
    } catch {
      throw new Error("That voice signal is not valid JSON.");
    }
    const key = `${args.containerType}:${args.containerId}`;
    const existingSignals = await ctx.db
      .query("voiceSignals")
      .withIndex("by_container", (q) => q.eq("containerKey", key))
      .collect();
    const now = Date.now();
    const recentMine = existingSignals.filter(
      (row) => row.fromId === id && row.createdAt > now - SIGNAL_WINDOW_MS,
    );
    if (recentMine.length >= MAX_SIGNALS_PER_WINDOW) {
      throw new Error("Too many voice signals. Reconnect and try again.");
    }
    for (const stale of existingSignals.filter(
      (row) => row.createdAt <= now - 5 * 60_000,
    )) {
      await ctx.db.delete(stale._id);
    }
    await ctx.db.insert("voiceSignals", {
      containerKey: key,
      fromId: id,
      toId: args.toId,
      kind: args.kind,
      payload: args.payload,
      createdAt: now,
    });
  },
});

/** Called by the client once a signal has been handled. */
export const ackSignal = mutation({
  args: { signalId: v.id("voiceSignals") },
  handler: async (ctx, { signalId }) => {
    const { id } = await requireUser(ctx);
    const row = await ctx.db.get(signalId);
    if (row && row.toId === id) await ctx.db.delete(signalId);
  },
});

/* ------------------------------------------------------------------ */
/* DM calls                                                            */
/* ------------------------------------------------------------------ */

/** Ring everyone in the conversation. Returns the call id. */
export const startCall = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const { id } = await requireActiveUser(ctx);
    const conversation = await requireConversationAccess(
      ctx,
      conversationId,
      id,
    );
    if (
      conversation.type === "dm" &&
      conversation.participantIds.length === 2
    ) {
      const other = conversation.participantIds.find(
        (userId) => userId !== id,
      )!;
      const allowed = await canSendDirectMessage(ctx, id, other);
      if (!allowed.ok) throw new Error(allowed.reason);
    }
    const open = await ctx.db
      .query("calls")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .first();
    const now = Date.now();
    if (
      open &&
      !open.endedAt &&
      (open.answeredAt !== undefined || now - open.startedAt < 5 * 60_000)
    ) {
      return open._id;
    }
    if (open?.endedAt && now - open.endedAt < 10_000) {
      throw new Error("Wait a moment before starting another call.");
    }
    return await ctx.db.insert("calls", {
      conversationId,
      callerId: id,
      calleeIds: conversation.participantIds.filter((userId) => userId !== id),
      startedAt: now,
    });
  },
});

export const answerCall = mutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => {
    const { id } = await requireActiveUser(ctx);
    const call = await ctx.db.get(callId);
    if (!call) throw new Error("That call is over.");
    if (!call.calleeIds.includes(id))
      throw new Error("You're not being called.");
    if (call.endedAt || Date.now() - call.startedAt > 5 * 60_000) {
      throw new Error("That call is over.");
    }
    await requireConversationAccess(ctx, call.conversationId, id);
    await ctx.db.patch(callId, { answeredAt: call.answeredAt ?? Date.now() });
  },
});

/** Hang up. An unanswered call becomes a missed call. */
export const endCall = mutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => {
    const { id } = await requireUser(ctx);
    const call = await ctx.db.get(callId);
    if (!call || call.endedAt) return;
    if (call.callerId !== id && !call.calleeIds.includes(id)) {
      throw new Error("You are not part of that call.");
    }
    await requireConversationAccess(ctx, call.conversationId, id, {
      enforceBlocks: false,
    });
    const now = Date.now();
    // Nobody picked up — whether the caller gave up or the callee declined,
    // the conversation should record it as a missed call.
    const missed = !call.answeredAt;
    await ctx.db.patch(callId, { endedAt: now, missed });

    // Leave a record in the conversation: a missed call that nobody picked up,
    // or the length of the call that happened. Both render in chat and in the
    // conversation list preview.
    const durationMs = call.answeredAt ? now - call.answeredAt : 0;
    const preview = missed
      ? "Missed call"
      : durationMs >= 60_000
        ? `Voice call · ${Math.floor(durationMs / 60_000)}m`
        : "Voice call";
    await ctx.db.insert("messages", {
      containerType: "conversation",
      containerId: call.conversationId as unknown as string,
      authorId: call.callerId,
      content: preview,
      kind: missed ? "call_missed" : "call_ended",
      ...(durationMs > 0 ? { callDurationMs: durationMs } : {}),
      createdAt: now,
    });
    // Keep the conversation's unread preview in sync with this new message.
    await ctx.db.patch(call.conversationId, {
      lastMessageAt: now,
      lastMessagePreview: preview,
      lastMessageSenderId: call.callerId,
      updatedAt: now,
    });
  },
});

/**
 * Calls ringing for this account right now, anywhere in the app — the global
 * ring banner listens to this so an incoming DM call surfaces even when the
 * conversation isn't open.
 */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_started")
      .order("desc")
      .take(200);
    const live = rows.filter(
      (call) =>
        !call.endedAt &&
        !call.answeredAt &&
        call.calleeIds.includes(id) &&
        now - call.startedAt < 5 * 60_000,
    );
    const callers = await hydrateUsers(
      ctx,
      live.map((call) => call.callerId),
      id,
    );
    return live.map((call) => ({
      callId: call._id as string,
      conversationId: call.conversationId as string,
      callerId: call.callerId as string,
      startedAt: call.startedAt,
      caller: callers.get(call.callerId) ?? null,
    }));
  },
});

/** The call this account most recently started in a conversation. */
export const currentCall = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const { id } = await requireUser(ctx);
    await requireConversationAccess(ctx, conversationId, id, {
      enforceBlocks: false,
    });
    const call = await ctx.db
      .query("calls")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .first();
    if (!call) return null;
    const now = Date.now();
    if (call.endedAt) return null;
    if (!call.answeredAt && now - call.startedAt > 5 * 60_000) {
      // Abandoned without hanging up — treat it as missed from here on.
      return null;
    }
    return {
      id: call._id as string,
      callerId: call.callerId as string,
      isCaller: call.callerId === id,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt ?? null,
    };
  },
});
