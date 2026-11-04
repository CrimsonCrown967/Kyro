import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  BUG_LIST_LIMIT,
  PRESENCE_TIMEOUT_MS,
  activeSiteBan,
  canViewIpDirectory,
  hydrateUsers,
  isFounderUser,
  isSyntheticUser,
  notify,
  requireActiveUser,
  requireUser,
  type Ctx,
} from "./lib";
import { enqueueUserEmail } from "./emailOutbox";
import { deleteMessageData, deleteServerData } from "./cleanup";

/**
 * Admin Portal backend.
 *
 * Kyro staff sign in with their normal Kyro account: admins are `role ===
 * "admin"` (or the founder), moderators carry the platform-wide Moderator
 * badge (`siteModerator`). Moderators can review reports, bugs, warnings and
 * bans; only admins can grant badges, ban staff or delete a community.
 */

function isFounder(user: Doc<"users">): boolean {
  return isFounderUser(user);
}

function isAdmin(user: Doc<"users">): boolean {
  return user.role === "admin" || isFounder(user);
}

function isStaff(user: Doc<"users">): boolean {
  return isAdmin(user) || user.siteModerator === true;
}

async function requireStaff(ctx: Ctx) {
  const { id, user } = await requireActiveUser(ctx);
  if (!isStaff(user)) {
    throw new Error("The Admin Portal is only available to Kyro staff.");
  }
  return { id, user };
}

async function requireAdmin(ctx: Ctx) {
  const { id, user } = await requireActiveUser(ctx);
  if (!isAdmin(user)) {
    throw new Error("Only Kyro admins can do that.");
  }
  return { id, user };
}

async function logAction(
  ctx: MutationCtx,
  args: {
    actorId: Id<"users">;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: string;
  },
) {
  await ctx.db.insert("adminActions", {
    actorId: args.actorId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    details: args.details,
    createdAt: Date.now(),
  });
}

type BadgeFlag =
  | "founder"
  | "cofounder"
  | "admin"
  | "manager"
  | "staff"
  | "moderator"
  | "trialstaff"
  | "verified"
  | "bughunter"
  | "vip"
  | "og"
  | "supporter"
  | "donator"
  | "partner";

/** Mirrors hydrateUser's badge derivation so the portal agrees with profiles. */
function badgeFlags(user: Doc<"users">): BadgeFlag[] {
  const flags: BadgeFlag[] = [];
  const founder = isFounder(user);
  const founderHeld = founder
    ? user.founderBadgeRemoved !== true
    : user.founderBadge === true;
  if (founderHeld) flags.push("founder");
  if (user.coFounder === true) flags.push("cofounder");
  if (user.role === "admin" || (founder && user.adminBadgeRemoved !== true)) {
    flags.push("admin");
  }
  if (user.manager === true) flags.push("manager");
  if (user.staff === true) flags.push("staff");
  if (user.siteModerator === true) flags.push("moderator");
  if (user.trialStaff === true) flags.push("trialstaff");
  if (user.verified === true) flags.push("verified");
  if (user.bugHunter === true) flags.push("bughunter");
  if (user.vip === true) flags.push("vip");
  if (user.og === true) flags.push("og");
  if (user.supporter === true) flags.push("supporter");
  if (user.donator === true) flags.push("donator");
  if (user.partner === true) flags.push("partner");
  return flags;
}

/** Everything the portal's Overview tab needs in one round trip. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const { id, user } = await requireUser(ctx);
    if (!isStaff(user) || (await activeSiteBan(ctx, id))) {
      return { allowed: false as const };
    }

    const [users, servers, messages, reports, bugs, bans, warnings, actions] =
      await Promise.all([
        ctx.db.query("users").take(2000),
        ctx.db.query("servers").take(1000),
        ctx.db.query("messages").take(5000),
        ctx.db.query("reports").take(500),
        ctx.db.query("bugReports").order("desc").take(BUG_LIST_LIMIT),
        ctx.db.query("siteBans").take(500),
        ctx.db.query("warnings").take(500),
        ctx.db.query("adminActions").order("desc").take(12),
      ]);

    const now = Date.now();
    const activeBans = bans.filter(
      (ban) =>
        ban.liftedAt === undefined &&
        (ban.expiresAt === undefined || ban.expiresAt > now),
    );
    const activeWarnings = warnings.filter(
      (warning) => warning.expiresAt > now,
    );
    const actors = await hydrateUsers(
      ctx,
      actions.map((action) => action.actorId),
      id,
    );

    return {
      allowed: true as const,
      canViewIps: canViewIpDirectory(user),
      me: {
        id,
        name: user.name ?? user.username ?? "Staff",
        isAdmin: isAdmin(user),
        isFounder: isFounder(user),
        isModerator: user.siteModerator === true,
      },
      counts: {
        users: users.length,
        online: users.filter(
          (row) => row.lastSeen !== undefined && now - row.lastSeen < 150_000,
        ).length,
        servers: servers.length,
        messages: messages.length,
        openReports: reports.filter(
          (report) => report.status === "open" || report.status === "reviewing",
        ).length,
        openBugs: bugs.filter(
          (bug) => bug.status === "open" || bug.status === "acknowledged",
        ).length,
        activeBans: activeBans.length,
        activeWarnings: activeWarnings.length,
        admins: users.filter((row) => isAdmin(row)).length,
        moderators: users.filter((row) => row.siteModerator === true).length,
      },
      recentActions: actions.map((action) => ({
        id: action._id as string,
        action: action.action,
        details: action.details ?? null,
        createdAt: action.createdAt,
        actor: actors.get(action.actorId) ?? null,
      })),
    };
  },
});

/**
 * Staff-only client IP directory. Only the two allowlisted accounts can read
 * it, and seeded/demo accounts plus those two accounts are never listed.
 */
export const ipDirectory = query({
  args: {},
  handler: async (ctx) => {
    const { id, user } = await requireUser(ctx);
    if (!canViewIpDirectory(user)) {
      throw new Error(
        "The IP detector is restricted to Kyro and adrianeosyne.",
      );
    }
    if (await activeSiteBan(ctx, id)) {
      throw new Error("Banned accounts cannot open the IP detector.");
    }

    const now = Date.now();
    const users = await ctx.db.query("users").take(2000);
    const rows = users
      .filter(
        (row) =>
          row.deletedAt === undefined &&
          !isSyntheticUser(row) &&
          !canViewIpDirectory(row),
      )
      .sort((a, b) => {
        const recency = (b.lastIpAt ?? 0) - (a.lastIpAt ?? 0);
        if (recency !== 0) return recency;
        const aName = (a.name ?? a.username ?? "").toLowerCase();
        const bName = (b.name ?? b.username ?? "").toLowerCase();
        return aName.localeCompare(bName);
      });

    return {
      generatedAt: now,
      total: rows.length,
      captured: rows.filter((row) => row.lastIp !== undefined).length,
      users: rows.map((row) => ({
        id: row._id as string,
        name: row.name ?? row.username ?? "Kyro user",
        username: row.username ?? null,
        lastIp: row.lastIp ?? null,
        lastIpAt: row.lastIpAt ?? null,
        lastSeen: row.lastSeen ?? null,
        online:
          row.lastSeen !== undefined &&
          now - row.lastSeen < PRESENCE_TIMEOUT_MS,
        device: row.device ?? null,
        memberSince: row.createdAt ?? row._creationTime,
      })),
    };
  },
});

/** Search accounts for badge management, bans and warnings. */
export const searchMembers = query({
  args: { term: v.optional(v.string()) },
  handler: async (ctx, { term }) => {
    await requireStaff(ctx);
    const needle = (term ?? "").trim().toLowerCase();
    const users = await ctx.db.query("users").take(1000);
    const matches = users
      .filter((user) => {
        if (!needle) return true;
        return (
          (user.name ?? "").toLowerCase().includes(needle) ||
          (user.username ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
      .slice(0, 30);

    const bans = await ctx.db.query("siteBans").take(500);
    const warnings = await ctx.db.query("warnings").take(500);
    const now = Date.now();

    return matches.map((user) => {
      const ban =
        bans.find(
          (row) =>
            row.userId === user._id &&
            row.liftedAt === undefined &&
            (row.expiresAt === undefined || row.expiresAt > now),
        ) ?? null;
      return {
        id: user._id as string,
        name: user.name ?? user.username ?? "Kyro user",
        username: user.username ?? null,
        avatarUrl: null,
        createdAt: user.createdAt ?? null,
        lastSeen: user.lastSeen ?? null,
        presence: user.status ?? "offline",
        isFounder: isFounder(user),
        isStaff: isStaff(user),
        badges: badgeFlags(user),
        ban: ban
          ? {
              id: ban._id as string,
              reason: ban.reason,
              createdAt: ban.createdAt,
              expiresAt: ban.expiresAt ?? null,
            }
          : null,
        activeWarnings: warnings.filter(
          (warning) => warning.userId === user._id && warning.expiresAt > now,
        ).length,
      };
    });
  },
});

/** Every report, with the people, server and message behind it resolved. */
export const reportQueue = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("reviewing"),
        v.literal("resolved"),
        v.literal("dismissed"),
      ),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireStaff(ctx);
    const reports = await (status
      ? ctx.db
          .query("reports")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(100)
      : ctx.db.query("reports").order("desc").take(100));

    const people = await ctx.db.query("users").take(1000);
    const peopleById = new Map(people.map((person) => [person._id, person]));
    const nameOf = (userId: Id<"users"> | undefined) => {
      if (!userId) return null;
      const person = peopleById.get(userId);
      return person?.name ?? person?.username ?? "Deleted user";
    };

    return await Promise.all(
      reports.map(async (report) => {
        const message = report.messageId
          ? await ctx.db.get(report.messageId)
          : null;
        const server = report.serverId
          ? await ctx.db.get(report.serverId)
          : null;
        return {
          id: report._id as string,
          reason: report.reason,
          details: report.details ?? null,
          status: report.status,
          resolution: report.resolution ?? null,
          createdAt: report.createdAt,
          reporterId: report.reporterId as string,
          reporterName: nameOf(report.reporterId),
          reportedId: (report.reportedUserId as string | undefined) ?? null,
          reportedName: nameOf(report.reportedUserId),
          serverId: (report.serverId as string | undefined) ?? null,
          serverName: server?.name ?? null,
          messageId: (report.messageId as string | undefined) ?? null,
          messageContent: message?.content ?? null,
          messageAuthorName: message ? nameOf(message.authorId) : null,
        };
      }),
    );
  },
});

/** Active + lifted platform bans, newest first. */
export const banList = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const bans = await ctx.db
      .query("siteBans")
      .withIndex("by_created")
      .order("desc")
      .take(100);
    const people = await ctx.db.query("users").take(1000);
    const byId = new Map(people.map((person) => [person._id, person]));
    const nameOf = (userId: Id<"users">) => {
      const person = byId.get(userId);
      return person?.name ?? person?.username ?? "Deleted user";
    };
    const now = Date.now();
    return bans.map((ban) => ({
      id: ban._id as string,
      userId: ban.userId as string,
      userName: nameOf(ban.userId),
      username: byId.get(ban.userId)?.username ?? null,
      reason: ban.reason,
      createdAt: ban.createdAt,
      expiresAt: ban.expiresAt ?? null,
      liftedAt: ban.liftedAt ?? null,
      liftReason: ban.liftReason ?? null,
      bannedByName: nameOf(ban.bannedById),
      active:
        ban.liftedAt === undefined &&
        (ban.expiresAt === undefined || ban.expiresAt > now),
    }));
  },
});

/** Ban an account from the platform (staff). */
export const banUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { userId, reason, days }) => {
    const { id, user } = await requireStaff(ctx);
    if (userId === id) throw new Error("You can't ban your own account.");
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("That account no longer exists.");
    if (isFounder(target)) throw new Error("The Kyro founder can't be banned.");
    if (isAdmin(target) && !isAdmin(user)) {
      throw new Error("Only an admin can ban another admin.");
    }
    const clean = reason.trim().slice(0, 300);
    if (clean.length < 3) {
      throw new Error("Give a reason — staff and the member will see it.");
    }
    if (await activeSiteBan(ctx, userId)) {
      throw new Error("That account is already banned.");
    }
    const now = Date.now();
    const durationDays =
      days && days > 0 ? Math.min(Math.ceil(days), 365) : null;
    const expiresAt = durationDays
      ? now + durationDays * 24 * 60 * 60 * 1000
      : undefined;
    const banId = await ctx.db.insert("siteBans", {
      userId,
      bannedById: id,
      reason: clean,
      createdAt: now,
      expiresAt,
    });
    await logAction(ctx, {
      actorId: id,
      action: "ban_user",
      targetType: "user",
      targetId: userId,
      details: clean,
    });
    await notify(ctx, {
      userId,
      type: "moderation",
      title: expiresAt
        ? "Your Kyro account was suspended"
        : "Your Kyro account was banned",
      body: clean,
      actorId: id,
    });
    await enqueueUserEmail(ctx, {
      eventKey: `siteban:${banId}:created`,
      userId,
      template: expiresAt ? "temporary_ban" : "permanent_ban",
      payload: {
        reason: clean,
        duration: durationDays
          ? `${durationDays} day${durationDays === 1 ? "" : "s"}`
          : "Permanent",
        expiresAt,
        actionAt: now,
      },
    });
  },
});

/** Lift a platform ban (staff). */
export const unbanUser = mutation({
  args: { banId: v.id("siteBans"), reason: v.optional(v.string()) },
  handler: async (ctx, { banId, reason }) => {
    const { id } = await requireStaff(ctx);
    const ban = await ctx.db.get(banId);
    if (!ban) throw new Error("That ban no longer exists.");
    if (ban.liftedAt !== undefined)
      throw new Error("That ban is already lifted.");
    const liftedAt = Date.now();
    const cleanReason = reason?.trim().slice(0, 300) || undefined;
    await ctx.db.patch(banId, {
      liftedAt,
      liftedById: id,
      liftReason: cleanReason,
    });
    await logAction(ctx, {
      actorId: id,
      action: "unban_user",
      targetType: "user",
      targetId: ban.userId,
      details: reason?.trim().slice(0, 200),
    });
    await notify(ctx, {
      userId: ban.userId,
      type: "moderation",
      title: "Your Kyro ban was lifted",
      body: reason?.trim().slice(0, 200),
      actorId: id,
    });
    await enqueueUserEmail(ctx, {
      eventKey: `siteban:${banId}:restored`,
      userId: ban.userId,
      template: "restoration",
      payload: {
        reason: cleanReason ?? "Kyro staff removed the account restriction.",
        actionAt: liftedAt,
      },
    });
  },
});

/** Active warnings across the platform, with the account they belong to. */
export const warningList = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const warnings = await ctx.db.query("warnings").take(300);
    const people = await ctx.db.query("users").take(1000);
    const byId = new Map(people.map((person) => [person._id, person]));
    const now = Date.now();
    return warnings
      .filter((warning) => warning.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((warning) => {
        const target = byId.get(warning.userId);
        const issuer = byId.get(warning.issuedById);
        return {
          id: warning._id as string,
          userId: warning.userId as string,
          userName: target?.name ?? target?.username ?? "Deleted user",
          username: target?.username ?? null,
          reason: warning.reason,
          createdAt: warning.createdAt,
          expiresAt: warning.expiresAt,
          issuedByName: issuer?.name ?? issuer?.username ?? "Kyro staff",
        };
      });
  },
});

/** Clear an active warning early (staff). */
export const liftWarning = mutation({
  args: { warningId: v.id("warnings") },
  handler: async (ctx, { warningId }) => {
    const { id } = await requireStaff(ctx);
    const warning = await ctx.db.get(warningId);
    if (!warning) throw new Error("That warning no longer exists.");
    await ctx.db.delete(warningId);
    await logAction(ctx, {
      actorId: id,
      action: "lift_warning",
      targetType: "user",
      targetId: warning.userId,
      details: warning.reason.slice(0, 200),
    });
  },
});

/** Remove a reported message from Kyro (staff). */
export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const { id } = await requireStaff(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("That message was already deleted.");
    await deleteMessageData(ctx, message);
    await logAction(ctx, {
      actorId: id,
      action: "delete_message",
      targetType: "message",
      targetId: messageId,
      details: message.content.slice(0, 160),
    });
  },
});

/** Delete a community from the platform (admins only). */
export const removeServer = mutation({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireAdmin(ctx);
    const server = await ctx.db.get(serverId);
    if (!server) throw new Error("That community no longer exists.");
    await deleteServerData(ctx, server);
    await logAction(ctx, {
      actorId: id,
      action: "delete_server",
      targetType: "server",
      targetId: serverId,
      details: server.name,
    });
  },
});

/** Full staff audit trail for the portal's Activity tab. */
export const actionLog = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireStaff(ctx);
    const actions = await ctx.db
      .query("adminActions")
      .withIndex("by_created")
      .order("desc")
      .take(80);
    const actors = await hydrateUsers(
      ctx,
      actions.map((action) => action.actorId),
      id,
    );
    return actions.map((action) => ({
      id: action._id as string,
      action: action.action,
      targetType: action.targetType ?? null,
      targetId: action.targetId ?? null,
      details: action.details ?? null,
      createdAt: action.createdAt,
      actorName: actors.get(action.actorId)?.name ?? "Kyro staff",
    }));
  },
});

/** The founder restoring their own Admin badge after hiding it. */
export const restoreMyAdminBadge = mutation({
  args: {},
  handler: async (ctx) => {
    const { id, user } = await requireActiveUser(ctx);
    if (!isFounder(user)) {
      throw new Error("Only the Kyro founder can restore that badge.");
    }
    await ctx.db.patch(id, { role: "admin", adminBadgeRemoved: false });
    await logAction(ctx, {
      actorId: id,
      action: "restore_admin_badge",
      targetType: "user",
      targetId: id,
    });
  },
});
