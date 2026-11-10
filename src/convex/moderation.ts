import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { PERMISSIONS } from "../lib/permissions";
import {
  can,
  hydrateUsers,
  logAudit,
  notify,
  requireServerAccess,
  requireUser,
  type Ctx,
} from "./lib";
import { enqueueUserEmail } from "./emailOutbox";

const ALLOWED_TIMEOUT_MINUTES = new Set([5, 10, 60, 1440, 10080]);

async function requireModerator(ctx: Ctx, serverId: Id<"servers">) {
  const { id } = await requireUser(ctx);
  const access = await requireServerAccess(ctx, serverId, id);
  const allowed =
    access.server.ownerId === id ||
    can(access.permissions, PERMISSIONS.MANAGE_SERVER) ||
    can(access.permissions, PERMISSIONS.MANAGE_MESSAGES) ||
    can(access.permissions, PERMISSIONS.BAN_MEMBERS);
  if (!allowed) {
    throw new Error("You don't have permission to moderate members.");
  }
  return { id, access };
}

async function topPosition(
  ctx: Ctx,
  server: Doc<"servers">,
  member: Doc<"serverMembers">,
) {
  if (server.ownerId === member.userId) return Number.POSITIVE_INFINITY;
  const roles = await Promise.all(
    member.roleIds.map((roleId) => ctx.db.get(roleId)),
  );
  return Math.max(0, ...roles.map((role) => role?.position ?? 0));
}

async function requireModeratableMember(
  ctx: Ctx,
  serverId: Id<"servers">,
  targetId: Id<"users">,
) {
  const { id, access } = await requireModerator(ctx, serverId);
  if (targetId === id) throw new Error("You can't moderate yourself.");
  if (access.server.ownerId === targetId) {
    throw new Error("The community owner can't be moderated.");
  }
  const target = await ctx.db
    .query("serverMembers")
    .withIndex("by_server_user", (q) =>
      q.eq("serverId", serverId).eq("userId", targetId),
    )
    .unique();
  if (!target) throw new Error("That person isn't a member anymore.");
  if (access.server.ownerId !== id) {
    const [actorTop, targetTop] = await Promise.all([
      topPosition(ctx, access.server, access.member),
      topPosition(ctx, access.server, target),
    ]);
    if (targetTop >= actorTop) {
      throw new Error(
        "You can't moderate someone with an equal or higher role.",
      );
    }
  }
  return { id, access, target };
}

function cleanReason(reason: string) {
  const clean = reason.trim().slice(0, 500);
  if (clean.length < 3)
    throw new Error("Add a reason with at least 3 characters.");
  return clean;
}

function caseDto(
  row: Doc<"moderationCases">,
  users: Awaited<ReturnType<typeof hydrateUsers>>,
) {
  return {
    id: row._id as string,
    action: row.action,
    reason: row.reason,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? null,
    resolvedAt: row.resolvedAt ?? null,
    target: users.get(row.userId) ?? null,
    moderator: users.get(row.moderatorId) ?? null,
  };
}

export const create = mutation({
  args: {
    serverId: v.id("servers"),
    userId: v.id("users"),
    action: v.union(
      v.literal("note"),
      v.literal("warning"),
      v.literal("timeout"),
    ),
    reason: v.string(),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, access, target } = await requireModeratableMember(
      ctx,
      args.serverId,
      args.userId,
    );
    const reason = cleanReason(args.reason);
    const now = Date.now();
    let expiresAt: number | undefined;
    if (args.action === "timeout") {
      const duration = Math.floor(args.durationMinutes ?? 0);
      if (!ALLOWED_TIMEOUT_MINUTES.has(duration)) {
        throw new Error("Choose a valid timeout duration.");
      }
      expiresAt = now + duration * 60_000;
      await ctx.db.patch(target._id, {
        communicationDisabledUntil: expiresAt,
      });
    }

    const caseId = await ctx.db.insert("moderationCases", {
      serverId: args.serverId,
      userId: args.userId,
      moderatorId: id,
      action: args.action,
      reason,
      expiresAt,
      createdAt: now,
    });
    await logAudit(ctx, {
      serverId: args.serverId,
      actorId: id,
      action: `member.${args.action}`,
      targetType: "user",
      targetId: args.userId,
      details: reason,
    });
    if (args.action !== "note") {
      await notify(ctx, {
        userId: args.userId,
        type: "moderation",
        title:
          args.action === "timeout"
            ? `You were timed out in ${access.server.name}`
            : `You received a warning in ${access.server.name}`,
        body: reason,
        actorId: id,
        link: `/dashboard/s/${args.serverId}`,
        containerKey: `moderation:${args.serverId}`,
      });
    }
    if (args.action === "warning") {
      await enqueueUserEmail(ctx, {
        eventKey: `moderation-case:${caseId}:warning`,
        userId: args.userId,
        template: "warning",
        payload: {
          reason,
          explanation: reason,
          actionAt: now,
          rules:
            access.server.rules?.trim() ||
            `Review the rules for ${access.server.name} and Kyro's Terms.`,
        },
      });
    }
    return caseId;
  },
});

export const clearTimeout = mutation({
  args: {
    serverId: v.id("servers"),
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, access, target } = await requireModeratableMember(
      ctx,
      args.serverId,
      args.userId,
    );
    const reason =
      args.reason?.trim().slice(0, 500) || "Timeout cleared early.";
    await ctx.db.patch(target._id, { communicationDisabledUntil: undefined });
    const activeCases = await ctx.db
      .query("moderationCases")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", args.serverId).eq("userId", args.userId),
      )
      .order("desc")
      .take(20);
    const now = Date.now();
    for (const row of activeCases) {
      if (
        row.action === "timeout" &&
        row.resolvedAt === undefined &&
        (row.expiresAt ?? 0) > now
      ) {
        await ctx.db.patch(row._id, { resolvedAt: now, resolvedById: id });
      }
    }
    await ctx.db.insert("moderationCases", {
      serverId: args.serverId,
      userId: args.userId,
      moderatorId: id,
      action: "timeout_cleared",
      reason,
      createdAt: now,
    });
    await logAudit(ctx, {
      serverId: args.serverId,
      actorId: id,
      action: "member.timeout_cleared",
      targetType: "user",
      targetId: args.userId,
      details: reason,
    });
    await notify(ctx, {
      userId: args.userId,
      type: "moderation",
      title: `Your timeout in ${access.server.name} was cleared`,
      body: reason,
      actorId: id,
      link: `/dashboard/s/${args.serverId}`,
      containerKey: `moderation:${args.serverId}`,
    });
  },
});

export const resolve = mutation({
  args: { caseId: v.id("moderationCases") },
  handler: async (ctx, { caseId }) => {
    const row = await ctx.db.get(caseId);
    if (!row) throw new Error("That moderation case no longer exists.");
    const { id } = await requireModerator(ctx, row.serverId);
    if (row.resolvedAt !== undefined) return;
    await ctx.db.patch(caseId, {
      resolvedAt: Date.now(),
      resolvedById: id,
    });
    await logAudit(ctx, {
      serverId: row.serverId,
      actorId: id,
      action: "moderation_case.resolved",
      targetType: "user",
      targetId: row.userId,
      details: row.reason,
    });
  },
});

export const list = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireModerator(ctx, serverId);
    const rows = await ctx.db
      .query("moderationCases")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .order("desc")
      .take(100);
    const users = await hydrateUsers(
      ctx,
      rows.flatMap((row) => [row.userId, row.moderatorId]),
      id,
    );
    return rows.map((row) => caseDto(row, users));
  },
});

export const memberCases = query({
  args: { serverId: v.id("servers"), userId: v.id("users") },
  handler: async (ctx, { serverId, userId }) => {
    const { id } = await requireModerator(ctx, serverId);
    const rows = await ctx.db
      .query("moderationCases")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .order("desc")
      .take(25);
    const users = await hydrateUsers(
      ctx,
      rows.flatMap((row) => [row.userId, row.moderatorId]),
      id,
    );
    return rows.map((row) => caseDto(row, users));
  },
});
