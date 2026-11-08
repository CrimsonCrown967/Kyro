import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  internalMutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { DEFAULT_EVERYONE_PERMISSIONS, PERMISSIONS } from "../lib/permissions";
import {
  can,
  configuredFounderId,
  hydrateUsers,
  logAudit,
  MAX_BADGE_NOTIFICATIONS,
  notify,
  permissionsFor,
  PRESENCE_TIMEOUT_MS,
  requireActiveUser,
  requireProfile,
  requireServerAccess,
  requireUser,
  restrictionLevel,
  type Ctx,
} from "./lib";
import { deleteServerData } from "./cleanup";
import {
  claimUpload,
  deleteClaimedUpload,
  requireOwnedUpload,
} from "./uploadSecurity";

const SERVER_NAME_MAX = 64;

function randomInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/** Highest role position a member holds (owner counts as infinite). */
async function topPosition(
  ctx: Ctx,
  server: Doc<"servers">,
  member: Doc<"serverMembers">,
): Promise<number> {
  if (server.ownerId === member.userId) return Number.MAX_SAFE_INTEGER;
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", server._id))
    .collect();
  const positions = roles
    .filter((role) => member.roleIds.includes(role._id))
    .map((role) => role.position);
  return positions.length > 0 ? Math.max(...positions) : 0;
}

async function hasUnreadChannels(
  ctx: Ctx,
  server: Doc<"servers">,
  readMap: Map<string, number>,
): Promise<boolean> {
  const channels = await ctx.db
    .query("channels")
    .withIndex("by_server", (q) => q.eq("serverId", server._id))
    .collect();
  return channels.some(
    (channel) => (channel.lastMessageAt ?? 0) > (readMap.get(channel._id) ?? 0),
  );
}

async function readCursors(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Map<string, number>> {
  const reads = await ctx.db
    .query("reads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(reads.map((read) => [read.key, read.lastReadAt]));
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** Communities the user belongs to, with unread + mention badges. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const [memberships, readMap, mentionNotes, replyNotes] = await Promise.all([
      ctx.db
        .query("serverMembers")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
      readCursors(ctx, id),
      ctx.db
        .query("notifications")
        .withIndex("by_user_unread_type", (q) =>
          q.eq("userId", id).eq("read", false).eq("type", "mention"),
        )
        .order("desc")
        .take(MAX_BADGE_NOTIFICATIONS),
      ctx.db
        .query("notifications")
        .withIndex("by_user_unread_type", (q) =>
          q.eq("userId", id).eq("read", false).eq("type", "reply"),
        )
        .order("desc")
        .take(MAX_BADGE_NOTIFICATIONS),
    ]);
    const mentionCounts = new Map<Id<"servers">, number>();
    const mentionCountsByChannel = new Map<string, number>();
    for (const note of [...mentionNotes, ...replyNotes]) {
      if (!note.containerKey) continue;
      mentionCountsByChannel.set(
        note.containerKey,
        (mentionCountsByChannel.get(note.containerKey) ?? 0) + 1,
      );
    }
    await Promise.all(
      [...mentionCountsByChannel].map(async ([containerKey, count]) => {
        const channelId = ctx.db.normalizeId("channels", containerKey);
        if (!channelId) return;
        const channel = await ctx.db.get(channelId);
        if (!channel) return;
        mentionCounts.set(
          channel.serverId,
          (mentionCounts.get(channel.serverId) ?? 0) + count,
        );
      }),
    );
    const results = await Promise.all(
      memberships.map(async (membership) => {
        const server = await ctx.db.get(membership.serverId);
        if (!server) return null;
        const [iconUrl, memberCount, unread, permissions] = await Promise.all([
          server.iconStorageId
            ? ctx.storage.getUrl(server.iconStorageId)
            : Promise.resolve(null),
          ctx.db
            .query("serverMembers")
            .withIndex("by_server", (q) => q.eq("serverId", server._id))
            .collect()
            .then((rows) => rows.length),
          hasUnreadChannels(ctx, server, readMap),
          permissionsFor(ctx, server, membership),
        ]);
        return {
          id: server._id as string,
          name: server.name,
          iconUrl,
          memberCount,
          muted: membership.muted === true,
          isOwner: server.ownerId === id,
          tag: server.tag ?? null,
          permissions,
          unread,
          mentions: mentionCounts.get(server._id) ?? 0,
        };
      }),
    );
    return results
      .filter((server): server is NonNullable<typeof server> => server !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Discover public communities. */
export const discover = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const { id } = await requireUser(ctx);
    const needle = term.trim().toLowerCase();
    // Name matches come from the search index; descriptions and tags are
    // matched over the recent public set so "search by name, topic or tag"
    // is literally true on the Discover page.
    const byName = needle
      ? await ctx.db
          .query("servers")
          .withSearchIndex("search_name", (q) =>
            q.search("name", term.trim()).eq("isPublic", true),
          )
          .take(30)
      : [];
    const recent = await ctx.db
      .query("servers")
      .withIndex("by_created")
      .order("desc")
      .take(100);
    const servers = [
      ...byName,
      ...recent.filter(
        (server) =>
          server.isPublic &&
          !byName.some((hit) => hit._id === server._id) &&
          (!needle ||
            server.name.toLowerCase().includes(needle) ||
            (server.description ?? "").toLowerCase().includes(needle) ||
            (server.tags ?? []).some((tag) => tag.includes(needle))),
      ),
    ].slice(0, 30);

    const mine = await ctx.db
      .query("serverMembers")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect();
    const joined = new Set(mine.map((m) => m.serverId));

    return await Promise.all(
      servers
        .filter((server) => server.isPublic)
        .slice(0, 24)
        .map(async (server) => {
          const isJoined = joined.has(server._id);
          const [iconUrl, bannerUrl, memberRows] = await Promise.all([
            server.iconStorageId
              ? ctx.storage.getUrl(server.iconStorageId)
              : Promise.resolve(null),
            server.bannerStorageId
              ? ctx.storage.getUrl(server.bannerStorageId)
              : Promise.resolve(null),
            ctx.db
              .query("serverMembers")
              .withIndex("by_server", (q) => q.eq("serverId", server._id))
              .collect(),
          ]);
          // Presence for every member, so cards can show who's online now.
          const memberDocs = await Promise.all(
            memberRows.slice(0, 200).map((row) => ctx.db.get(row.userId)),
          );
          const now = Date.now();
          const online = memberDocs.filter(
            (member) =>
              member &&
              member.lastSeen !== undefined &&
              now - member.lastSeen < PRESENCE_TIMEOUT_MS &&
              member.showPresence !== false &&
              member.status !== "invisible" &&
              member.status !== "offline",
          ).length;
          return {
            id: server._id as string,
            name: server.name,
            description: server.description ?? null,
            iconUrl,
            bannerUrl,
            tags: server.tags ?? [],
            memberCount: memberRows.length,
            onlineCount: online,
            createdAt: server.createdAt,
            // Joined servers stay listed so cards can offer "Open" instead
            // of "Join", like the Discover grid does.
            isJoined,
            applyToJoin: server.applyToJoin === true,
          };
        }),
    );
  },
});

/** Everything the sidebar needs for one community. */
/**
 * Public preview behind a worn community tag — name, description, member
 * count and owner, shown when someone taps a tag on a profile or message.
 */
export const previewByTag = query({
  args: { tag: v.string() },
  handler: async (ctx, { tag }) => {
    await requireUser(ctx);
    const clean = tag.trim().toUpperCase();
    if (!clean) return null;
    const servers = await ctx.db.query("servers").collect();
    const server = servers.find(
      (candidate) => (candidate.tag ?? "").toUpperCase() === clean,
    );
    if (!server) return null;
    const [iconUrl, owner, members] = await Promise.all([
      server.iconStorageId
        ? ctx.storage.getUrl(server.iconStorageId)
        : Promise.resolve(null),
      ctx.db.get(server.ownerId),
      ctx.db
        .query("serverMembers")
        .withIndex("by_server", (q) => q.eq("serverId", server._id))
        .collect(),
    ]);
    return {
      id: server._id as string,
      name: server.name,
      description: server.description ?? null,
      tag: server.tag ?? null,
      iconUrl,
      isPublic: server.isPublic,
      memberCount: members.length,
      ownerName: owner?.name ?? owner?.username ?? "Unknown",
      ownerId: server.ownerId as string,
      createdAt: server.createdAt ?? null,
    };
  },
});

/**
 * Non-throwing membership probe for the routes under /dashboard/s/:id.
 *
 * Every other server query demands membership and throws without it, which
 * turned "you're not a member yet" (an invite race, a stale link, a dialog
 * that skipped the join) into a full-page crash. This one answers instead of
 * throwing so the UI can offer a Join button.
 */
export const joinState = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const server = await ctx.db.get(serverId);
    if (!server) {
      return {
        exists: false as const,
        isMember: false,
        isPublic: false,
        banned: false,
        name: null as string | null,
        description: null as string | null,
        iconUrl: null as string | null,
        memberCount: 0,
        ownerId: null as string | null,
      };
    }
    const [member, banned, memberRows, iconUrl, application] =
      await Promise.all([
        ctx.db
          .query("serverMembers")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId).eq("userId", id),
          )
          .unique(),
        ctx.db
          .query("bans")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId).eq("userId", id),
          )
          .unique(),
        ctx.db
          .query("serverMembers")
          .withIndex("by_server", (q) => q.eq("serverId", serverId))
          .collect(),
        server.iconStorageId
          ? ctx.storage.getUrl(server.iconStorageId)
          : Promise.resolve(null),
        ctx.db
          .query("joinApplications")
          .withIndex("by_user_server", (q) =>
            q.eq("userId", id).eq("serverId", serverId),
          )
          .order("desc")
          .first(),
      ]);
    return {
      exists: true as const,
      isMember: member !== null,
      isPublic: server.isPublic,
      banned: banned !== null,
      name: server.name,
      description: server.description ?? null,
      iconUrl,
      memberCount: memberRows.length,
      ownerId: server.ownerId as string,
      applyToJoin: server.applyToJoin === true && server.isPublic,
      applicationQuestions:
        server.applyToJoin === true && server.isPublic
          ? (() => {
              const questions = (server.applicationQuestions ?? [])
                .map((question) => question.trim())
                .filter(Boolean)
                .slice(0, 5);
              return questions.length > 0
                ? questions
                : [
                    "Why do you want to join this community?",
                    "What will you contribute?",
                  ];
            })()
          : [],
      application: application
        ? {
            id: application._id as string,
            status: application.status,
            note: application.note ?? null,
          }
        : null,
    };
  },
});

export const get = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    const [iconUrl, bannerUrl, memberRows, roles] = await Promise.all([
      access.server.iconStorageId
        ? ctx.storage.getUrl(access.server.iconStorageId)
        : Promise.resolve(null),
      access.server.bannerStorageId
        ? ctx.storage.getUrl(access.server.bannerStorageId)
        : Promise.resolve(null),
      ctx.db
        .query("serverMembers")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("serverRoles")
        .withIndex("by_server_position", (q) => q.eq("serverId", serverId))
        .collect(),
    ]);
    // Presence over this community's members, for the settings stats row.
    const memberDocs = await Promise.all(
      memberRows.slice(0, 200).map((row) => ctx.db.get(row.userId)),
    );
    const now = Date.now();
    const onlineCount = memberDocs.filter(
      (member) =>
        member &&
        member.lastSeen !== undefined &&
        now - member.lastSeen < PRESENCE_TIMEOUT_MS &&
        member.showPresence !== false &&
        member.status !== "invisible" &&
        member.status !== "offline",
    ).length;
    return {
      id: access.server._id as string,
      name: access.server.name,
      description: access.server.description ?? null,
      rules: access.server.rules ?? null,
      welcomeMessage: access.server.welcomeMessage ?? null,
      isPublic: access.server.isPublic,
      isPlatformHome: access.server.isPlatformHome === true,
      verified:
        access.server.isPlatformHome === true ||
        access.server.verified === true,
      ownerId: access.server.ownerId as string,
      iconUrl,
      bannerUrl,
      memberCount: memberRows.length,
      onlineCount,
      tags: access.server.tags ?? [],
      vanityCode: access.server.vanityCode ?? null,
      locked: access.server.locked === true,
      lockedUntil: access.server.lockedUntil ?? null,
      tag: access.server.tag ?? null,
      links: access.server.links ?? [],
      verificationLevel: access.server.verificationLevel ?? "none",
      minAccountAgeMs: access.server.minAccountAgeMs ?? 0,
      applyToJoin: access.server.applyToJoin === true,
      applicationQuestions: access.server.applicationQuestions ?? [],
      rulesChannelId:
        (access.server.rulesChannelId as string | undefined) ?? null,
      themeAccent: access.server.themeAccent ?? null,
      themeTint: access.server.themeTint ?? null,
      createdAt: access.server.createdAt,
      isOwner: access.server.ownerId === id,
      muted: access.member.muted === true,
      nickname: access.member.nickname ?? null,
      permissions: access.permissions,
      roles: roles
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((role) => ({
          id: role._id as string,
          name: role.name,
          color: role.color ?? null,
          position: role.position,
          isDefault: role.isDefault,
          permissions: role.permissions,
        })),
    };
  },
});

/** Member list with presence, roles and nicknames. */
export const members = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id: viewerId } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, viewerId);
    const rows = await ctx.db
      .query("serverMembers")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .take(500);
    const roles = await ctx.db
      .query("serverRoles")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    const roleMap = new Map(roles.map((role) => [role._id, role]));
    const users = await hydrateUsers(
      ctx,
      rows.map((row) => row.userId),
      viewerId,
    );
    const ownerId = access.server.ownerId as string;

    const members = rows
      .map((row) => {
        const user = users.get(row.userId);
        if (!user) return null;
        const memberRoles = row.roleIds
          .map((roleId) => roleMap.get(roleId))
          .filter((role): role is NonNullable<typeof role> => Boolean(role))
          .sort((a, b) => a.position - b.position);
        const top =
          memberRoles.length > 0 ? memberRoles[memberRoles.length - 1] : null;
        return {
          user,
          nickname: row.nickname ?? null,
          joinedAt: row.joinedAt,
          communicationDisabledUntil: row.communicationDisabledUntil ?? null,
          isOwner: row.userId === ownerId,
          roles: memberRoles.map((role) => ({
            id: role._id as string,
            name: role.name,
            color: role.color ?? null,
            position: role.position,
            isDefault: role.isDefault,
          })),
          topRoleName:
            top?.name ?? (row.userId === ownerId ? "Owner" : "Member"),
          topRoleColor: top?.color ?? null,
        };
      })
      .filter(
        (member): member is NonNullable<typeof member> => member !== null,
      );

    const online = members.filter((m) => m.user.presence !== "offline");
    const offline = members.filter((m) => m.user.presence === "offline");
    const rank = (m: (typeof members)[number]) =>
      m.isOwner ? 1000 : (m.roles[m.roles.length - 1]?.position ?? 0);
    online.sort(
      (a, b) => rank(b) - rank(a) || a.user.name.localeCompare(b.user.name),
    );
    offline.sort((a, b) => a.user.name.localeCompare(b.user.name));
    return { online, offline, myPermissions: access.permissions };
  },
});

/** Public invite preview — what someone sees before joining. */
export const invitePreview = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { id } = await requireUser(ctx);
    const trimmed = code.trim();
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", trimmed.toUpperCase()))
      .unique();

    let server: Doc<"servers"> | null = null;
    let expiresAt: number | null = null;
    let uses = 0;
    let maxUses: number | null = null;

    if (invite && !invite.revoked) {
      if (invite.expiresAt && invite.expiresAt < Date.now()) {
        return { valid: false as const, reason: "This invite has expired." };
      }
      if (invite.maxUses && invite.uses >= invite.maxUses) {
        return {
          valid: false as const,
          reason: "This invite has reached its use limit.",
        };
      }
      server = await ctx.db.get(invite.serverId);
      expiresAt = invite.expiresAt ?? null;
      uses = invite.uses;
      maxUses = invite.maxUses ?? null;
    } else {
      // Custom (vanity) invite links: permanent and unlimited by design.
      server = await ctx.db
        .query("servers")
        .withIndex("by_vanity", (q) =>
          q.eq("vanityCode", trimmed.toLowerCase()),
        )
        .unique();
      if (server && !server.isPublic) {
        return {
          valid: false as const,
          reason: "That community is invite-only.",
        };
      }
    }
    if (!server) {
      return {
        valid: false as const,
        reason: "This invite has been revoked or doesn't exist.",
      };
    }
    const membership = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", server!._id).eq("userId", id),
      )
      .unique();
    const [iconUrl, memberCount, ownerMap] = await Promise.all([
      server.iconStorageId
        ? ctx.storage.getUrl(server.iconStorageId)
        : Promise.resolve(null),
      ctx.db
        .query("serverMembers")
        .withIndex("by_server", (q) => q.eq("serverId", server!._id))
        .collect()
        .then((rows) => rows.length),
      hydrateUsers(ctx, [server.ownerId], id),
    ]);
    const owner = ownerMap.get(server.ownerId) ?? null;
    return {
      valid: true as const,
      server: {
        id: server._id as string,
        name: server.name,
        description: server.description ?? null,
        iconUrl,
        memberCount,
        createdAt: server.createdAt,
        owner: owner
          ? {
              id: owner.id as string,
              name: owner.name,
              username: owner.username,
              avatarUrl: owner.avatarUrl,
            }
          : null,
      },
      alreadyMember: membership !== null,
      expiresAt,
      uses,
      maxUses,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Kyro HQ — the platform's home community, owned by the founder. */
const HQ_NAME = "Kyro HQ";

async function ensureMembership(
  ctx: MutationCtx,
  serverId: Id<"servers">,
  userId: Id<"users">,
): Promise<void> {
  const rows = await ctx.db
    .query("serverMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (rows.some((row) => row.serverId === serverId)) return;
  await ctx.db.insert("serverMembers", {
    serverId,
    userId,
    roleIds: [],
    joinedAt: Date.now(),
  });
}

async function createHq(
  ctx: MutationCtx,
  ownerId: Id<"users">,
): Promise<Id<"servers">> {
  const serverId = await ctx.db.insert("servers", {
    name: HQ_NAME,
    description:
      "The official Kyro home base — announcements, support and hangouts for everyone on Kyro.",
    ownerId,
    isPublic: true,
    isPlatformHome: true,
    createdAt: Date.now(),
  });
  await ctx.db.insert("serverRoles", {
    serverId,
    name: "@everyone",
    position: 0,
    permissions: [...DEFAULT_EVERYONE_PERMISSIONS],
    isDefault: true,
  });
  const categoryId = await ctx.db.insert("categories", {
    serverId,
    name: "Welcome",
    position: 0,
    createdAt: Date.now(),
  });
  await ctx.db.insert("channels", {
    serverId,
    categoryId,
    name: "general",
    topic: "Talk about anything with the Kyro community",
    position: 0,
    createdAt: Date.now(),
    createdById: ownerId,
  });
  await ctx.db.insert("channels", {
    serverId,
    categoryId,
    name: "announcements",
    topic: "Kyro news straight from the team",
    position: 1,
    createdAt: Date.now(),
    createdById: ownerId,
  });
  await ensureMembership(ctx, serverId, ownerId);
  return serverId;
}

/**
 * Every Kyro account is added to Kyro HQ automatically. The community is
 * created on first use and owned by the founder's account when it exists.
 */
export async function joinKyroHq(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const founderId = configuredFounderId();
  const founder = founderId ? await ctx.db.get(founderId as Id<"users">) : null;
  if (!founder || founder.deletedAt !== undefined) {
    // Never let the first arbitrary registrant bootstrap ownership of the
    // platform community. Configure KYRO_FOUNDER_USER_ID first.
    return;
  }
  let home = await ctx.db
    .query("servers")
    .withIndex("by_platform_home", (q) => q.eq("isPlatformHome", true))
    .unique();
  if (!home) {
    const founderServers = await ctx.db
      .query("servers")
      .withIndex("by_owner", (q) => q.eq("ownerId", founder._id))
      .collect();
    const legacyHome = founderServers.find((server) => server.name === HQ_NAME);
    if (legacyHome) {
      await ctx.db.patch(legacyHome._id, { isPlatformHome: true });
      home = { ...legacyHome, isPlatformHome: true };
    }
  }
  const serverId = home?._id ?? (await createHq(ctx, founder._id));
  await ensureMembership(ctx, serverId, userId);
  await ensureMembership(ctx, serverId, founder._id);
}

/** Internal hook so sign-up (an action) can auto-join Kyro HQ. */
export const joinHqInternal = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await joinKyroHq(ctx, userId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, { name, description, isPublic }) => {
    const { id } = await requireProfile(ctx);
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > SERVER_NAME_MAX) {
      throw new Error("Community names are 2–64 characters.");
    }
    const serverId = await ctx.db.insert("servers", {
      name: cleanName,
      description: description?.trim().slice(0, 400),
      ownerId: id,
      isPublic: isPublic ?? true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("serverRoles", {
      serverId,
      name: "@everyone",
      position: 0,
      permissions: [...DEFAULT_EVERYONE_PERMISSIONS],
      isDefault: true,
    });
    await ctx.db.insert("serverMembers", {
      serverId,
      userId: id,
      roleIds: [],
      joinedAt: Date.now(),
    });
    const categoryId = await ctx.db.insert("categories", {
      serverId,
      name: "Text channels",
      position: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("channels", {
      serverId,
      categoryId,
      name: "general",
      topic: "Talk about anything with the community",
      position: 0,
      createdAt: Date.now(),
      createdById: id,
    });
    await ctx.db.insert("channels", {
      serverId,
      categoryId,
      name: "random",
      topic: "Off-topic chatter, memes and links",
      position: 1,
      createdAt: Date.now(),
      createdById: id,
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "server.create",
      details: `Created ${cleanName}`,
    });
    return serverId;
  },
});

export const update = mutation({
  args: {
    serverId: v.id("servers"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    rules: v.optional(v.string()),
    welcomeMessage: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    iconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    tag: v.optional(v.union(v.string(), v.null())),
    links: v.optional(
      v.union(
        v.array(v.object({ label: v.string(), url: v.string() })),
        v.null(),
      ),
    ),
    rulesChannelId: v.optional(v.union(v.id("channels"), v.null())),
    verificationLevel: v.optional(
      v.union(
        v.literal("none"),
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
      ),
    ),
    minAccountAgeMs: v.optional(v.union(v.number(), v.null())),
    applyToJoin: v.optional(v.boolean()),
    applicationQuestions: v.optional(v.array(v.string())),
    themeAccent: v.optional(v.union(v.string(), v.null())),
    themeTint: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, args.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_SERVER)) {
      throw new Error("You do not have permission to edit this community.");
    }
    const patch: Partial<Doc<"servers">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2 || name.length > SERVER_NAME_MAX) {
        throw new Error("Community names are 2–64 characters.");
      }
      patch.name = name;
    }
    if (args.description !== undefined)
      patch.description = args.description.trim().slice(0, 400);
    if (args.rules !== undefined)
      patch.rules = args.rules.trim().slice(0, 2000);
    if (args.welcomeMessage !== undefined) {
      patch.welcomeMessage = args.welcomeMessage.trim().slice(0, 500);
    }
    if (args.isPublic !== undefined) patch.isPublic = args.isPublic;
    if (args.tags !== undefined) {
      const tags = args.tags
        .map((tag) => tag.trim().toLowerCase().slice(0, 24))
        .filter((tag) => tag.length > 0 && /^[a-z0-9][a-z0-9 &+-]*$/.test(tag))
        .slice(0, 5);
      patch.tags = Array.from(new Set(tags));
    }
    if (args.tag !== undefined) {
      if (!args.tag) {
        patch.tag = undefined;
      } else {
        const tag = args.tag.trim().toUpperCase().slice(0, 4);
        if (!/^[A-Z0-9]{2,4}$/.test(tag)) {
          throw new Error("Community tags are 2–4 letters or numbers.");
        }
        patch.tag = tag;
      }
    }
    if (args.links !== undefined) {
      if (args.links === null) {
        patch.links = undefined;
      } else {
        if (args.links.length > 5) {
          throw new Error("You can keep up to 5 links.");
        }
        const links = args.links
          .map((link) => ({
            label: link.label.trim().slice(0, 32),
            url: link.url.trim().slice(0, 200),
          }))
          .filter((link) => link.label.length > 0 && link.url.length > 0);
        for (const link of links) {
          if (!/^https?:\/\//i.test(link.url)) {
            throw new Error(
              `Links need to start with http:// or https:// — check "${link.label}".`,
            );
          }
        }
        patch.links = links;
      }
    }
    if (args.rulesChannelId !== undefined) {
      if (args.rulesChannelId === null) {
        patch.rulesChannelId = undefined;
      } else {
        const channel = await ctx.db.get(args.rulesChannelId);
        if (!channel || channel.serverId !== args.serverId) {
          throw new Error("That rules channel isn't in this community.");
        }
        patch.rulesChannelId = args.rulesChannelId;
      }
    }
    if (args.verificationLevel !== undefined) {
      patch.verificationLevel = args.verificationLevel;
    }
    if (args.minAccountAgeMs !== undefined) {
      if (args.minAccountAgeMs === null) {
        patch.minAccountAgeMs = undefined;
      } else if (
        ![0, 86400000, 604800000].includes(Math.floor(args.minAccountAgeMs))
      ) {
        throw new Error("New-account gates are off, 1 day or 7 days.");
      } else {
        patch.minAccountAgeMs = Math.floor(args.minAccountAgeMs);
      }
    }
    if (args.applyToJoin !== undefined) {
      patch.applyToJoin = args.applyToJoin || undefined;
    }
    if (args.applicationQuestions !== undefined) {
      const questions = args.applicationQuestions
        .map((question) => question.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 5);
      patch.applicationQuestions = questions.length > 0 ? questions : undefined;
    }
    const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
    if (args.themeAccent !== undefined) {
      if (args.themeAccent && !HEX_COLOUR.test(args.themeAccent)) {
        throw new Error("Accent must be a hex colour like #67E8F9.");
      }
      patch.themeAccent = args.themeAccent || undefined;
    }
    if (args.themeTint !== undefined) {
      if (args.themeTint && !HEX_COLOUR.test(args.themeTint)) {
        throw new Error("Tint must be a hex colour like #6b59f3.");
      }
      patch.themeTint = args.themeTint || undefined;
    }
    if (args.iconStorageId !== undefined) {
      if (args.iconStorageId === null) {
        await deleteClaimedUpload(
          ctx,
          access.server.iconStorageId,
          "server_icon",
          args.serverId,
        );
        patch.iconStorageId = undefined;
      } else {
        await requireOwnedUpload(ctx, id, args.iconStorageId, {
          imageOnly: true,
        });
        await claimUpload(
          ctx,
          id,
          args.iconStorageId,
          "server_icon",
          args.serverId,
          { imageOnly: true },
        );
        if (access.server.iconStorageId !== args.iconStorageId) {
          await deleteClaimedUpload(
            ctx,
            access.server.iconStorageId,
            "server_icon",
            args.serverId,
          );
        }
        patch.iconStorageId = args.iconStorageId;
      }
    }
    if (args.bannerStorageId !== undefined) {
      if (args.bannerStorageId === null) {
        await deleteClaimedUpload(
          ctx,
          access.server.bannerStorageId,
          "server_banner",
          args.serverId,
        );
        patch.bannerStorageId = undefined;
      } else {
        await requireOwnedUpload(ctx, id, args.bannerStorageId, {
          imageOnly: true,
        });
        await claimUpload(
          ctx,
          id,
          args.bannerStorageId,
          "server_banner",
          args.serverId,
          { imageOnly: true },
        );
        if (access.server.bannerStorageId !== args.bannerStorageId) {
          await deleteClaimedUpload(
            ctx,
            access.server.bannerStorageId,
            "server_banner",
            args.serverId,
          );
        }
        patch.bannerStorageId = args.bannerStorageId;
      }
    }
    await ctx.db.patch(args.serverId, patch);
    await logAudit(ctx, {
      serverId: args.serverId,
      actorId: id,
      action: "server.update",
      details: Object.keys(args)
        .filter((key) => key !== "serverId")
        .join(", "),
    });
  },
});

/**
 * Portable, secret-free community configuration backup. It intentionally
 * excludes members, messages, invites, bans and uploaded file capabilities.
 */
export const exportConfiguration = mutation({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (
      access.server.ownerId !== id &&
      !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error("You don't have permission to export this community.");
    }
    const [categories, channels, roles, automod] = await Promise.all([
      ctx.db
        .query("categories")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("channels")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("serverRoles")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("serverAutomod")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .unique(),
    ]);
    const roleKeys = new Map(
      roles.map((role) => [role._id, `role:${role.name}:${role.position}`]),
    );
    const categoryKeys = new Map(
      categories.map((category) => [
        category._id,
        `category:${category.name}:${category.position}`,
      ]),
    );
    const channelKeys = new Map(
      channels.map((channel) => [
        channel._id,
        `channel:${channel.name}:${channel.position}`,
      ]),
    );
    const server = access.server;
    const exportedAt = new Date().toISOString();
    const payload = {
      format: "kyro-community-configuration",
      version: 1,
      exportedAt,
      community: {
        name: server.name,
        description: server.description ?? null,
        rules: server.rules ?? null,
        welcomeMessage: server.welcomeMessage ?? null,
        isPublic: server.isPublic,
        tags: server.tags ?? [],
        tag: server.tag ?? null,
        links: server.links ?? [],
        verificationLevel: server.verificationLevel ?? "none",
        minAccountAgeMs: server.minAccountAgeMs ?? 0,
        applyToJoin: server.applyToJoin === true,
        applicationQuestions: server.applicationQuestions ?? [],
        themeAccent: server.themeAccent ?? null,
        themeTint: server.themeTint ?? null,
        rulesChannelKey: server.rulesChannelId
          ? (channelKeys.get(server.rulesChannelId) ?? null)
          : null,
      },
      roles: roles
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((role) => ({
          key: roleKeys.get(role._id),
          name: role.name,
          color: role.color ?? null,
          position: role.position,
          permissions: role.permissions,
          isDefault: role.isDefault,
        })),
      categories: categories
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((category) => ({
          key: categoryKeys.get(category._id),
          name: category.name,
          position: category.position,
        })),
      channels: channels
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((channel) => ({
          key: channelKeys.get(channel._id),
          categoryKey: channel.categoryId
            ? (categoryKeys.get(channel.categoryId) ?? null)
            : null,
          name: channel.name,
          topic: channel.topic ?? null,
          kind: channel.kind ?? "text",
          position: channel.position,
          slowMode: channel.slowMode ?? 0,
          readOnly: channel.readOnly === true,
          permissionOverwrites: (channel.permissionOverwrites ?? []).map(
            (overwrite) => ({
              roleKey: roleKeys.get(overwrite.roleId) ?? null,
              allow: overwrite.allow,
              deny: overwrite.deny,
            }),
          ),
        })),
      automod: automod
        ? {
            enabled: automod.enabled,
            blockedWords: automod.blockedWords,
            blockInvites: automod.blockInvites,
            blockLinks: automod.blockLinks,
            maxMentions: automod.maxMentions,
            blockCaps: automod.blockCaps,
            blockSpam: automod.blockSpam,
            exemptRoleKeys: automod.exemptRoleIds
              .map((roleId) => roleKeys.get(roleId))
              .filter((key): key is string => key !== undefined),
            exemptChannelKeys: automod.exemptChannelIds
              .map((channelId) => channelKeys.get(channelId))
              .filter((key): key is string => key !== undefined),
          }
        : null,
    };
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "server.export_configuration",
      targetType: "server",
      targetId: serverId,
      details: "Downloaded a secret-free configuration backup",
    });
    return payload;
  },
});

export const remove = mutation({
  args: { serverId: v.id("servers"), confirm: v.string() },
  handler: async (ctx, { serverId, confirm }) => {
    const { id } = await requireActiveUser(ctx);
    const server = await ctx.db.get(serverId);
    if (!server) throw new Error("That community doesn't exist.");
    if (server.ownerId !== id)
      throw new Error("Only the owner can delete a community.");
    if (confirm !== server.name) {
      throw new Error(`Type the community name ("${server.name}") to confirm.`);
    }

    await deleteServerData(ctx, server);
  },
});

export const join = mutation({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id, user } = await requireProfile(ctx);
    const server = await ctx.db.get(serverId);
    if (!server) throw new Error("That community doesn't exist.");
    if (!server.isPublic) throw new Error("That community is invite-only.");
    const banned = await ctx.db
      .query("bans")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", id),
      )
      .unique();
    if (banned) throw new Error("You're banned from this community.");
    const gateMs = server.minAccountAgeMs ?? 0;
    if (gateMs > 0 && Date.now() - (user.createdAt ?? Date.now()) < gateMs) {
      throw new Error(
        gateMs >= 604800000
          ? "This community only accepts accounts older than 7 days."
          : "This community only accepts accounts older than 1 day.",
      );
    }
    if ((await restrictionLevel(ctx, id)) >= 3) {
      throw new Error("Your account is suspended while staff review it.");
    }
    if (server.applyToJoin === true) {
      throw new Error("This community requires an application to join.");
    }
    const existing = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", id),
      )
      .unique();
    if (existing) return serverId;

    await ctx.db.insert("serverMembers", {
      serverId,
      userId: id,
      roleIds: [],
      joinedAt: Date.now(),
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "member.join",
      targetType: "user",
      targetId: id,
      details: `${user.name ?? user.username} joined`,
    });
    await notify(ctx, {
      userId: server.ownerId,
      type: "system",
      title: "Someone joined your community",
      body: `${user.name ?? user.username} joined ${server.name}`,
      actorId: id,
      link: `/dashboard/s/${serverId}`,
    });
    return serverId;
  },
});

export const leave = mutation({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const server = await ctx.db.get(serverId);
    if (!server) return;
    if (server.ownerId === id) {
      throw new Error("Transfer ownership before leaving your own community.");
    }
    const membership = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", id),
      )
      .unique();
    if (membership) await ctx.db.delete(membership._id);
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "member.leave",
      targetType: "user",
      targetId: id,
    });
  },
});

export const transferOwnership = mutation({
  args: { serverId: v.id("servers"), userId: v.id("users") },
  handler: async (ctx, { serverId, userId }) => {
    const { id } = await requireActiveUser(ctx);
    const server = await ctx.db.get(serverId);
    if (!server || server.ownerId !== id) {
      throw new Error("Only the owner can transfer ownership.");
    }
    const target = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .unique();
    if (!target)
      throw new Error("That person isn't a member of this community.");
    await ctx.db.patch(serverId, { ownerId: userId, updatedAt: Date.now() });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "server.transfer_ownership",
      targetType: "user",
      targetId: userId,
    });
    await notify(ctx, {
      userId,
      type: "system",
      title: "You're now the community owner",
      body: `You own ${server.name} now`,
      actorId: id,
      link: `/dashboard/s/${serverId}`,
    });
  },
});

/* --------------------------- membership --------------------------- */

export const kick = mutation({
  args: {
    serverId: v.id("servers"),
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, userId, reason }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.KICK_MEMBERS)) {
      throw new Error("You don't have permission to kick members.");
    }
    if (access.server.ownerId === userId)
      throw new Error("You can't kick the owner.");
    const target = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .unique();
    if (!target) throw new Error("That person isn't a member.");
    const myTop = await topPosition(ctx, access.server, access.member);
    const targetTop = await topPosition(ctx, access.server, target);
    if (targetTop >= myTop && access.server.ownerId !== id) {
      throw new Error("You can't remove someone with an equal or higher role.");
    }
    await ctx.db.delete(target._id);
    await ctx.db.insert("moderationCases", {
      serverId,
      userId,
      moderatorId: id,
      action: "kick",
      reason: reason?.trim().slice(0, 500) || "Removed from the community.",
      createdAt: Date.now(),
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "member.kick",
      targetType: "user",
      targetId: userId,
      details: reason,
    });
    await notify(ctx, {
      userId,
      type: "moderation",
      title: `You were removed from ${access.server.name}`,
      body: reason ?? undefined,
      actorId: id,
    });
  },
});

export const ban = mutation({
  args: {
    serverId: v.id("servers"),
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, userId, reason }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.BAN_MEMBERS)) {
      throw new Error("You don't have permission to ban members.");
    }
    if (access.server.ownerId === userId)
      throw new Error("You can't ban the owner.");
    const target = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .unique();
    if (!target) throw new Error("That person isn't a member.");
    const myTop = await topPosition(ctx, access.server, access.member);
    const targetTop = await topPosition(ctx, access.server, target);
    if (targetTop >= myTop && access.server.ownerId !== id) {
      throw new Error("You can't ban someone with an equal or higher role.");
    }
    await ctx.db.delete(target._id);
    const existing = await ctx.db
      .query("bans")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("bans", {
        serverId,
        userId,
        reason,
        bannedBy: id,
        createdAt: Date.now(),
      });
    }
    await ctx.db.insert("moderationCases", {
      serverId,
      userId,
      moderatorId: id,
      action: "ban",
      reason: reason?.trim().slice(0, 500) || "Banned from the community.",
      createdAt: Date.now(),
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "member.ban",
      targetType: "user",
      targetId: userId,
      details: reason,
    });
    await notify(ctx, {
      userId,
      type: "moderation",
      title: `You were banned from ${access.server.name}`,
      body: reason ?? undefined,
      actorId: id,
    });
  },
});

export const unban = mutation({
  args: { serverId: v.id("servers"), userId: v.id("users") },
  handler: async (ctx, { serverId, userId }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.BAN_MEMBERS)) {
      throw new Error("You don't have permission to manage bans.");
    }
    const existing = await ctx.db
      .query("bans")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("moderationCases", {
      serverId,
      userId,
      moderatorId: id,
      action: "unban",
      reason: "Ban lifted.",
      createdAt: Date.now(),
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "member.unban",
      targetType: "user",
      targetId: userId,
    });
  },
});

export const listBans = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.BAN_MEMBERS)) return [];
    const bans = await ctx.db
      .query("bans")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    const users = await hydrateUsers(
      ctx,
      bans.map((ban) => ban.userId),
      id,
    );
    return bans.map((ban) => ({
      userId: ban.userId as string,
      user: users.get(ban.userId) ?? null,
      reason: ban.reason ?? null,
      createdAt: ban.createdAt,
    }));
  },
});

export const setNickname = mutation({
  args: {
    serverId: v.id("servers"),
    userId: v.id("users"),
    nickname: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, userId, nickname }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (userId !== id && !can(access.permissions, PERMISSIONS.MANAGE_ROLES)) {
      throw new Error("You can't change other people's nicknames.");
    }
    const membership = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .unique();
    if (!membership) throw new Error("That person isn't a member.");
    await ctx.db.patch(membership._id, {
      nickname: nickname?.trim().slice(0, 64) || undefined,
    });
  },
});

export const setMuted = mutation({
  args: { serverId: v.id("servers"), muted: v.boolean() },
  handler: async (ctx, { serverId, muted }) => {
    const { id } = await requireUser(ctx);
    const membership = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", id),
      )
      .unique();
    if (!membership) throw new Error("You're not a member of that community.");
    await ctx.db.patch(membership._id, { muted });
  },
});

export const updateMemberRoles = mutation({
  args: {
    serverId: v.id("servers"),
    userId: v.id("users"),
    roleIds: v.array(v.id("serverRoles")),
  },
  handler: async (ctx, { serverId, userId, roleIds }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_ROLES)) {
      throw new Error("You don't have permission to manage roles.");
    }
    const target = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", userId),
      )
      .unique();
    if (!target) throw new Error("That person isn't a member.");
    const myTop = await topPosition(ctx, access.server, access.member);
    const targetTop = await topPosition(ctx, access.server, target);
    if (targetTop >= myTop && access.server.ownerId !== id) {
      throw new Error("You can't edit someone with an equal or higher role.");
    }
    const serverRoles = await ctx.db
      .query("serverRoles")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    const valid = new Set(serverRoles.map((role) => role._id));
    const cleaned = Array.from(new Set(roleIds)).filter((roleId) =>
      valid.has(roleId),
    );
    const highestAssignable = cleaned
      .map(
        (roleId) =>
          serverRoles.find((role) => role._id === roleId)?.position ?? 0,
      )
      .reduce((max, position) => Math.max(max, position), 0);
    if (highestAssignable >= myTop && access.server.ownerId !== id) {
      throw new Error("You can't grant a role as high as your own.");
    }
    await ctx.db.patch(target._id, { roleIds: cleaned });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "member.roles",
      targetType: "user",
      targetId: userId,
      details: cleaned.join(", "),
    });
  },
});

/* ----------------------------- invites ---------------------------- */

export const createInvite = mutation({
  args: {
    serverId: v.id("servers"),
    expiresInHours: v.optional(v.number()),
    maxUses: v.optional(v.number()),
  },
  handler: async (ctx, { serverId, expiresInHours, maxUses }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.CREATE_INVITES)) {
      throw new Error("You don't have permission to create invites.");
    }
    const inviteId = await ctx.db.insert("invites", {
      code: randomInviteCode(),
      serverId,
      creatorId: id,
      createdAt: Date.now(),
      expiresAt:
        expiresInHours && expiresInHours > 0
          ? Date.now() + expiresInHours * 60 * 60 * 1000
          : undefined,
      maxUses: maxUses && maxUses > 0 ? Math.floor(maxUses) : undefined,
      uses: 0,
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "invite.create",
      targetType: "invite",
      targetId: inviteId,
    });
    const created = await ctx.db.get(inviteId);
    return created?.code ?? "";
  },
});

export const listInvites = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.CREATE_INVITES)) return [];
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    return invites
      .map((invite) => ({
        id: invite._id as string,
        code: invite.code,
        uses: invite.uses,
        maxUses: invite.maxUses ?? null,
        expiresAt: invite.expiresAt ?? null,
        revoked: invite.revoked === true,
        createdAt: invite.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const { id } = await requireProfile(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("That invite doesn't exist.");
    const access = await requireServerAccess(ctx, invite.serverId, id);
    if (
      invite.creatorId !== id &&
      !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error("You can't revoke that invite.");
    }
    await ctx.db.patch(inviteId, { revoked: true });
    await logAudit(ctx, {
      serverId: invite.serverId,
      actorId: id,
      action: "invite.revoke",
      targetType: "invite",
      targetId: inviteId,
    });
  },
});

export const joinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { id, user } = await requireProfile(ctx);
    const trimmed = code.trim();
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", trimmed.toUpperCase()))
      .unique();

    let server: Doc<"servers"> | null = null;
    if (invite && !invite.revoked) {
      if (invite.expiresAt && invite.expiresAt < Date.now()) {
        throw new Error("That invite has expired.");
      }
      if (invite.maxUses && invite.uses >= invite.maxUses) {
        throw new Error("That invite has reached its use limit.");
      }
      server = await ctx.db.get(invite.serverId);
    } else {
      // Custom (vanity) invite links join without a one-time invite row.
      server = await ctx.db
        .query("servers")
        .withIndex("by_vanity", (q) =>
          q.eq("vanityCode", trimmed.toLowerCase()),
        )
        .unique();
      if (server && !server.isPublic) {
        throw new Error("That community is invite-only.");
      }
    }
    if (!server) throw new Error("That invite is invalid.");
    const banned = await ctx.db
      .query("bans")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", server._id).eq("userId", id),
      )
      .unique();
    if (banned) throw new Error("You're banned from that community.");
    const gateMs = server.minAccountAgeMs ?? 0;
    if (gateMs > 0 && Date.now() - (user.createdAt ?? Date.now()) < gateMs) {
      throw new Error(
        gateMs >= 604800000
          ? "This community only accepts accounts older than 7 days."
          : "This community only accepts accounts older than 1 day.",
      );
    }
    if ((await restrictionLevel(ctx, id)) >= 3) {
      throw new Error("Your account is suspended while staff review it.");
    }

    const existing = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", server._id).eq("userId", id),
      )
      .unique();
    if (!existing) {
      if (server.applyToJoin === true && !invite) {
        throw new Error("This community requires an application to join.");
      }
      await ctx.db.insert("serverMembers", {
        serverId: server._id,
        userId: id,
        roleIds: [],
        joinedAt: Date.now(),
      });
      if (invite && !invite.revoked) {
        await ctx.db.patch(invite._id, { uses: invite.uses + 1 });
      }
      await logAudit(ctx, {
        serverId: server._id,
        actorId: id,
        action: "member.join",
        targetType: "user",
        targetId: id,
        details: `${user.name ?? user.username} joined via invite`,
      });
    }
    return server._id as string;
  },
});

/**
 * Pick the community's permanent invite path: kyro.app/invite/<code>.
 * Letters, numbers, dashes and underscores — never expires, never capped.
 */
export const setVanity = mutation({
  args: { serverId: v.id("servers"), code: v.string() },
  handler: async (ctx, { serverId, code }) => {
    const { id } = await requireActiveUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (
      access.server.ownerId !== id &&
      !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error("You don't have permission to edit this community.");
    }

    const clean = code.trim().toLowerCase();
    if (clean === "") {
      await ctx.db.patch(serverId, {
        vanityCode: undefined,
        updatedAt: Date.now(),
      });
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(clean)) {
      throw new Error(
        "Custom links are 3–24 characters: letters, numbers, dashes and underscores.",
      );
    }
    const taken = await ctx.db
      .query("servers")
      .withIndex("by_vanity", (q) => q.eq("vanityCode", clean))
      .unique();
    if (taken && taken._id !== serverId) {
      throw new Error("That link is already taken — try another one.");
    }
    const inviteClash = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", clean.toUpperCase()))
      .unique();
    if (inviteClash) throw new Error("That link is already used by an invite.");

    await ctx.db.patch(serverId, { vanityCode: clean, updatedAt: Date.now() });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "server.update",
      targetType: "server",
      targetId: serverId,
      details: `custom invite link set to ${clean}`,
    });
  },
});

/**
 * Server-wide lockdown: while locked, only staff with manage_messages can
 * post. Members keep read access, so announcements still reach everyone.
 */
export const setLocked = mutation({
  args: {
    serverId: v.id("servers"),
    locked: v.boolean(),
    /** Auto-unlock delay for timed raid locks. */
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { serverId, locked, durationMs }) => {
    const { id } = await requireActiveUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (
      access.server.ownerId !== id &&
      !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error("You don't have permission to lock this community.");
    }
    await ctx.db.patch(serverId, {
      locked,
      lockedUntil:
        locked && durationMs && durationMs > 0
          ? Date.now() + durationMs
          : undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: locked ? "server.lock" : "server.unlock",
      targetType: "server",
      targetId: serverId,
      details: locked
        ? durationMs && durationMs > 0
          ? `community locked for ${Math.round(durationMs / 60000)} min`
          : "community locked"
        : "community unlocked",
    });
  },
});

export const auditLog = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.VIEW_AUDIT_LOG)) return [];
    const entries = await ctx.db
      .query("auditLogs")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .order("desc")
      .take(60);
    const actors = await hydrateUsers(
      ctx,
      entries.map((entry) => entry.actorId),
      id,
    );
    return entries.map((entry) => ({
      id: entry._id as string,
      action: entry.action,
      details: entry.details ?? null,
      targetType: entry.targetType ?? null,
      createdAt: entry.createdAt,
      actor: actors.get(entry.actorId) ?? null,
    }));
  },
});
