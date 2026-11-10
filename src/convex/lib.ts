import { getAuthUserId } from "@convex-dev/auth/server";
import {
  ALL_PERMISSIONS,
  hasPermission,
  type Permission,
} from "../lib/permissions";
import { MAX_UPLOAD_BYTES } from "../lib/uploadLimits";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./functions";

export type Ctx = QueryCtx | MutationCtx;

/**
 * A user is considered online if they heartbeated within this window.
 * The client heartbeats every 60s, so this comfortably survives a couple of
 * missed ticks (background tab throttling, flaky networks) before dropping
 * someone to offline.
 */
export const PRESENCE_TIMEOUT_MS = 150_000;

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = MAX_UPLOAD_BYTES;
/** Bounds reactive badge queries while still allowing badges to count to 999+. */
export const MAX_BADGE_NOTIFICATIONS = 500;

/**
 * Email suffix reserved for seeded/demo accounts. These accounts are not real
 * people, so they are excluded from staff-only people data such as the IP
 * detector and never have their IP recorded.
 */
export const SYNTHETIC_EMAIL_SUFFIX = "@kyro-seed.invalid";

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return Boolean(
    email && email.trim().toLowerCase().endsWith(SYNTHETIC_EMAIL_SUFFIX),
  );
}

export function isSyntheticUser(
  user: Pick<Doc<"users">, "email"> | null | undefined,
): boolean {
  return Boolean(user && isSyntheticEmail(user.email));
}

/**
 * Bounds the recent bug-report feed. Overview counts use status-indexed reads.
 */
export const BUG_LIST_LIMIT = 200;

export async function currentUserId(ctx: Ctx): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

export async function requireUser(
  ctx: Ctx,
): Promise<{ id: Id<"users">; user: Doc<"users"> }> {
  const id = await getAuthUserId(ctx);
  if (id === null) throw new Error("You need to sign in to do that.");
  const user = await ctx.db.get(id);
  if (!user) throw new Error("You need to sign in to do that.");
  if (user.deletedAt !== undefined) {
    throw new Error("This account has been deleted.");
  }
  return { id, user };
}

/** The active platform ban on an account, or null when it is clean. */
export async function activeSiteBan(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"siteBans"> | null> {
  const now = Date.now();
  const [permanent, temporary] = await Promise.all([
    ctx.db
      .query("siteBans")
      .withIndex("by_user_lifted_expiry", (q) =>
        q
          .eq("userId", userId)
          .eq("liftedAt", undefined)
          .eq("expiresAt", undefined),
      )
      .collect(),
    ctx.db
      .query("siteBans")
      .withIndex("by_user_lifted_expiry", (q) =>
        q.eq("userId", userId).eq("liftedAt", undefined).gt("expiresAt", now),
      )
      .collect(),
  ]);
  return (
    [...permanent, ...temporary].sort((a, b) => b.createdAt - a.createdAt)[0] ??
    null
  );
}

/**
 * Someone who finished onboarding (claimed a unique username) and is not
 * currently banned by Kyro staff. Every write gate uses this, so a site ban
 * really stops messaging, community creation and friend requests.
 */
export async function requireProfile(
  ctx: Ctx,
): Promise<{ id: Id<"users">; user: Doc<"users"> }> {
  const authed = await requireActiveUser(ctx);
  if (!authed.user.username) {
    throw new Error("Claim a username before using Kyro.");
  }
  return authed;
}

/** A signed-in account that is allowed to perform application writes. */
export async function requireActiveUser(
  ctx: Ctx,
): Promise<{ id: Id<"users">; user: Doc<"users"> }> {
  const authed = await requireUser(ctx);
  const ban = await activeSiteBan(ctx, authed.id);
  if (ban) {
    const until = ban.expiresAt
      ? ` until ${new Date(ban.expiresAt).toLocaleDateString()}`
      : " permanently";
    throw new Error(`Your Kyro account is banned${until}: ${ban.reason}`);
  }
  return authed;
}

export type PresenceState = "online" | "idle" | "dnd" | "invisible" | "offline";

export function isPresenceOnline(user: Doc<"users">): boolean {
  return (
    user.presenceOnline ??
    (user.lastSeen !== undefined &&
      Date.now() - user.lastSeen < PRESENCE_TIMEOUT_MS)
  );
}

/** Resolves the presence a given viewer is allowed to see. */
export function visiblePresence(
  user: Doc<"users">,
  viewerIsSelf: boolean,
): PresenceState {
  if (user.showPresence === false && !viewerIsSelf) return "offline";
  if (user.status === "invisible")
    return viewerIsSelf ? "invisible" : "offline";
  if (user.status === "offline") return "offline";
  const recentlyActive = isPresenceOnline(user);
  if (!recentlyActive) return "offline";
  // An explicit online/idle/dnd choice wins over the inferred default, and a
  // record that is merely missing `status` (older accounts) is online.
  if (user.status === "idle" || user.status === "dnd") return user.status;
  return "online";
}

export interface PublicUser {
  botApplicationId?: string | null;
  id: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  presence: PresenceState;
  customStatus: string | null;
  bio: string | null;
  accent: string | null;
  displayNameFont: string;
  displayNameColorMode: "none" | "solid" | "gradient";
  displayNameColor: string | null;
  displayNameColor2: string | null;
  lastSeen: number | null;
  isAnonymous: boolean;
  /** Kyro's founder: their crown badge is shown to every viewer, everywhere. */
  isFounder: boolean;
  /** Official Kyro-operated account. Founder is always official too. */
  official: boolean;
  /**
   * Global (platform-wide) badges shown in the profile's own badge shelf —
   * separate from community roles. Always in this order:
   * founder, cofounder, manager, admin, moderator, staff, trialstaff,
   * verified, partner, donator, supporter, vip, bughunter, og.
   */
  badges: GlobalBadge[];
  /** External links shown on the profile, in the order they were saved. */
  links: { label: string; url: string }[];
  /** Built-in avatar frame id, or null for a plain avatar. */
  avatarFrame: string | null;
  /** Decorative overlay rendered around the avatar. */
  avatarDecoration: string | null;
  /** Account creation timestamp, shown as "member since" on profiles. */
  memberSince: number | null;
  /** Device class the account was last seen on, for the platform indicator. */
  device: "desktop" | "mobile" | "tablet" | null;
  /** Pronouns shown on the profile card, e.g. "He/Him". */
  pronouns: string | null;
  /** The badge this person chose to show next to their name in chat. */
  primaryBadge: string | null;
  /** Profile theme preset id, or null for the default look. */
  profileTheme: string | null;
  /** Decorative overlay rendered across the full profile card. */
  profileDecoration: string | null;
  /** Community tag worn next to the name, or null. */
  serverTag: string | null;
}

/** Reserved public handle. It is cosmetic; it never grants authority. */
export const FOUNDER_USERNAME = "adrianeosyne";

/**
 * Founder authority is bound to an immutable Convex user id configured on the
 * deployment. Missing configuration deliberately means there is no founder;
 * falling back to a username would turn a profile edit into privilege
 * escalation.
 */
export function configuredFounderId(): string | null {
  const value = process.env.KYRO_FOUNDER_USER_ID?.trim();
  return value || null;
}

export function isFounderUser(
  user: Pick<Doc<"users">, "_id"> | null | undefined,
): boolean {
  const founderId = configuredFounderId();
  return Boolean(user && founderId && user._id === founderId);
}

export function isReservedUsername(username: string): boolean {
  return normalizeUsername(username) === FOUNDER_USERNAME;
}

/**
 * The IP detector is stricter than the rest of the Admin Portal: only these
 * two accounts may read client IP addresses. Membership is intentionally a
 * server-side username allowlist so a badge change can never grant it.
 */
export const IP_DIRECTORY_USERNAMES = ["adrianeosyne", "kyro"] as const;

export function canViewIpDirectory(
  user: Pick<Doc<"users">, "username"> | null | undefined,
): boolean {
  const username = user?.username ? normalizeUsername(user.username) : "";
  return (IP_DIRECTORY_USERNAMES as readonly string[]).includes(username);
}

/** A platform-wide badge; never scoped to a single community. */
export type GlobalBadge =
  | "founder"
  | "cofounder"
  | "manager"
  | "admin"
  | "moderator"
  | "staff"
  | "trialstaff"
  | "verified"
  | "partner"
  | "donator"
  | "supporter"
  | "vip"
  | "bughunter"
  | "og";

/**
 * Platform authority ladder. Badges are not decorative on the staff rungs:
 * each one grants exactly the powers of its rank and everything below it.
 * Founder > Co Founder > Manager > Admin > Moderator > Staff > Trial Staff.
 * Cosmetic badges (Verified, Partner, Donator, Supporter, VIP, Bug Hunter, OG)
 * never grant authority.
 */
export const PLATFORM_ROLE_RANK = {
  founder: 7,
  cofounder: 6,
  manager: 5,
  admin: 4,
  moderator: 3,
  staff: 2,
  trialstaff: 1,
  user: 0,
} as const;
export type PlatformRole = keyof typeof PLATFORM_ROLE_RANK;

type PlatformUser = Pick<
  Doc<"users">,
  | "_id"
  | "role"
  | "founderBadge"
  | "coFounder"
  | "manager"
  | "staff"
  | "siteModerator"
  | "trialStaff"
>;

/** The highest platform rung a user holds, derived from real grant flags. */
export function platformRoleFor(user: PlatformUser): PlatformRole {
  if (isFounderUser(user) || user.founderBadge === true) return "founder";
  if (user.coFounder === true) return "cofounder";
  if (user.manager === true) return "manager";
  if (user.role === "admin") return "admin";
  if (user.siteModerator === true) return "moderator";
  if (user.staff === true) return "staff";
  if (user.trialStaff === true) return "trialstaff";
  return "user";
}

export function platformRank(user: PlatformUser): number {
  return PLATFORM_ROLE_RANK[platformRoleFor(user)];
}

/** True when the user holds `minimum` or any higher platform rung. */
export function hasPlatformRole(
  user: PlatformUser,
  minimum: PlatformRole,
): boolean {
  return platformRank(user) >= PLATFORM_ROLE_RANK[minimum];
}

/** Trial Staff or above: read-only Admin Portal access. */
export function isPlatformTrialStaff(user: PlatformUser): boolean {
  return hasPlatformRole(user, "trialstaff");
}

/** Staff or above: real moderation actions (warnings, bans, reports). */
export function isPlatformStaff(user: PlatformUser): boolean {
  return hasPlatformRole(user, "staff");
}

/** Admin or above: badge grants, staff bans, community deletion. */
export function isPlatformAdmin(user: PlatformUser): boolean {
  return hasPlatformRole(user, "admin");
}

/** The Founder platform rung (configured founder or explicitly granted badge). */
export function isPlatformFounder(user: PlatformUser): boolean {
  return platformRoleFor(user) === "founder";
}

/**
 * Every platform badge a user currently holds, in display order. This is the
 * single source of truth for profiles, the Admin Portal and badge selection.
 */
export function globalBadgesFor(user: Doc<"users">): GlobalBadge[] {
  const isFounder = isFounderUser(user);
  const badges: GlobalBadge[] = [];
  // Founder badge: the founder always holds it (unless they stripped it from
  // their own profile), plus anyone the founder explicitly granted it to.
  if (
    isFounder ? user.founderBadgeRemoved !== true : user.founderBadge === true
  ) {
    badges.push("founder");
  }
  if (user.coFounder === true) badges.push("cofounder");
  if (user.manager === true) badges.push("manager");
  // Admin badge: role === "admin" always carries it. The founder also carries
  // it by default, but may strip it from their own profile via adminBadgeRemoved.
  const founderAdminRemoved = isFounder && user.adminBadgeRemoved === true;
  if (user.role === "admin" || (isFounder && !founderAdminRemoved)) {
    badges.push("admin");
  }
  if (user.siteModerator === true) badges.push("moderator");
  if (user.staff === true) badges.push("staff");
  if (user.trialStaff === true) badges.push("trialstaff");
  if (user.verified === true) badges.push("verified");
  if (user.partner === true) badges.push("partner");
  if (user.donator === true) badges.push("donator");
  if (user.supporter === true) badges.push("supporter");
  if (user.vip === true) badges.push("vip");
  if (user.bugHunter === true) badges.push("bughunter");
  if (user.og === true) badges.push("og");
  return badges;
}

/**
 * Active (unexpired) staff warnings on an account: 0 = clean, 1 = limited,
 * 2 = very limited, 3+ = suspended. Powers account standing and the write
 * gates in messages.send / servers.create / social.sendRequest.
 */
export async function restrictionLevel(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<number> {
  const rows = await ctx.db
    .query("warnings")
    .withIndex("by_user_expiry", (q) =>
      q.eq("userId", userId).gt("expiresAt", Date.now()),
    )
    .collect();
  return rows.length;
}

export async function hydrateUser(
  ctx: Ctx,
  user: Doc<"users">,
  viewerId: Id<"users">,
): Promise<PublicUser> {
  const [avatarUrl, bannerUrl] = await Promise.all([
    user.avatarStorageId
      ? ctx.storage.getUrl(user.avatarStorageId)
      : Promise.resolve(null),
    user.bannerStorageId
      ? ctx.storage.getUrl(user.bannerStorageId)
      : Promise.resolve(null),
  ]);
  const isFounder = isFounderUser(user);
  const presenceDetailsVisible =
    user._id === viewerId ||
    (user.showPresence !== false &&
      user.status !== "invisible" &&
      user.status !== "offline");
  const badges = globalBadgesFor(user);
  return {
    id: user._id,
    botApplicationId: user.botApplicationId ?? null,
    username: user.username ?? null,
    name: user.name ?? user.username ?? "Kyro user",
    avatarUrl,
    bannerUrl,
    presence: visiblePresence(user, user._id === viewerId),
    customStatus: presenceDetailsVisible ? (user.customStatus ?? null) : null,
    bio: user.bio ?? null,
    accent: user.accent ?? null,
    displayNameFont: user.displayNameFont ?? "default",
    displayNameColorMode: user.displayNameColorMode ?? "none",
    displayNameColor: user.displayNameColor ?? null,
    displayNameColor2: user.displayNameColor2 ?? null,
    lastSeen: presenceDetailsVisible ? (user.lastSeen ?? null) : null,
    isAnonymous: user.isAnonymous === true,
    isFounder,
    official: user.official === true,
    badges,
    links: (user.links ?? []).slice(0, 6),
    avatarFrame: user.avatarFrame ?? null,
    avatarDecoration: user.avatarDecoration ?? null,
    memberSince: user.createdAt ?? null,
    device: presenceDetailsVisible ? (user.device ?? null) : null,
    pronouns: user.pronouns ?? null,
    primaryBadge: user.primaryBadge ?? null,
    profileTheme: user.profileTheme ?? null,
    profileDecoration: user.profileDecoration ?? null,
    serverTag: user.wornTag ?? null,
  };
}

/** Resolves a batch of user ids into public profiles keyed by id. */
export async function hydrateUsers(
  ctx: Ctx,
  ids: (Id<"users"> | null | undefined)[],
  viewerId: Id<"users">,
): Promise<Map<string, PublicUser>> {
  const unique = Array.from(
    new Set(ids.filter((id): id is Id<"users"> => Boolean(id))),
  );
  const docs = await Promise.all(unique.map((id) => ctx.db.get(id)));
  const users = docs.filter((doc): doc is Doc<"users"> => doc !== null);
  const hydrated = await Promise.all(
    users.map((user) => hydrateUser(ctx, user, viewerId)),
  );
  return new Map(hydrated.map((user) => [user.id, user]));
}

export async function getUserByUsername(
  ctx: Ctx,
  username: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", username.toLowerCase()))
    .unique();
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export async function isBlockedBetween(
  ctx: Ctx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", a).eq("blockedId", b))
      .unique(),
    ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", b).eq("blockedId", a))
      .unique(),
  ]);
  return ab !== null || ba !== null;
}

/** Every account this viewer has blocked or has been blocked by. */
export async function blockedUserIds(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Set<string>> {
  const [blocking, blockedBy] = await Promise.all([
    ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
      .collect(),
    ctx.db
      .query("blocks")
      .withIndex("by_blocked", (q) => q.eq("blockedId", userId))
      .collect(),
  ]);
  return new Set<string>([
    ...blocking.map((row) => row.blockedId),
    ...blockedBy.map((row) => row.blockerId),
  ]);
}

/** Rejects a participant set containing any blocked pair. */
export async function assertNoBlockedPairs(
  ctx: Ctx,
  userIds: Id<"users">[],
): Promise<void> {
  for (let left = 0; left < userIds.length; left += 1) {
    for (let right = left + 1; right < userIds.length; right += 1) {
      if (await isBlockedBetween(ctx, userIds[left], userIds[right])) {
        throw new Error(
          "People who have blocked each other can't share a group.",
        );
      }
    }
  }
}

/** Loads a conversation and proves the viewer is still an allowed member. */
export async function requireConversationAccess(
  ctx: Ctx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
  options: { enforceBlocks?: boolean } = {},
): Promise<Doc<"conversations">> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new Error("That conversation no longer exists.");
  if (!conversation.participantIds.includes(userId)) {
    throw new Error("You are not part of that conversation.");
  }
  if (options.enforceBlocks !== false) {
    for (const participantId of conversation.participantIds) {
      if (
        participantId !== userId &&
        (await isBlockedBetween(ctx, userId, participantId))
      ) {
        throw new Error("This conversation is unavailable because of a block.");
      }
    }
  }
  return conversation;
}

export interface ServerAccess {
  server: Doc<"servers">;
  member: Doc<"serverMembers">;
  permissions: string[];
}

/** Membership + effective permissions for a community, or null. */
export async function getServerAccess(
  ctx: Ctx,
  serverId: Id<"servers">,
  userId: Id<"users">,
): Promise<ServerAccess | null> {
  const server = await ctx.db.get(serverId);
  if (!server) return null;
  const member = await ctx.db
    .query("serverMembers")
    .withIndex("by_server_user", (q) =>
      q.eq("serverId", serverId).eq("userId", userId),
    )
    .unique();
  if (!member) return null;
  return {
    server,
    member,
    permissions: await permissionsFor(ctx, server, member),
  };
}

export async function requireServerAccess(
  ctx: Ctx,
  serverId: Id<"servers">,
  userId: Id<"users">,
): Promise<ServerAccess> {
  const access = await getServerAccess(ctx, serverId, userId);
  if (!access) throw new Error("You are not a member of this community.");
  return access;
}

/** Effective permission list: owner wins, then union of assigned roles. */
export async function permissionsFor(
  ctx: Ctx,
  server: Doc<"servers">,
  member: Doc<"serverMembers">,
): Promise<string[]> {
  if (server.ownerId === member.userId) return [...ALL_PERMISSIONS];
  const [defaults, assigned] = await Promise.all([
    ctx.db
      .query("serverRoles")
      .withIndex("by_server_default", (q) =>
        q.eq("serverId", server._id).eq("isDefault", true),
      )
      .collect(),
    Promise.all([...new Set(member.roleIds)].map((id) => ctx.db.get(id))),
  ]);
  const roles = [
    ...defaults,
    ...assigned.filter(
      (role): role is Doc<"serverRoles"> =>
        role !== null && role.serverId === server._id,
    ),
  ];
  const permissions = new Set<string>();
  for (const role of roles) {
    if (role.isDefault || member.roleIds.includes(role._id)) {
      for (const permission of role.permissions) permissions.add(permission);
    }
  }
  return Array.from(permissions);
}

export function can(permissions: string[], permission: Permission): boolean {
  return hasPermission(permissions, permission);
}

export function assertPermission(
  permissions: string[],
  permission: Permission,
): void {
  if (!hasPermission(permissions, permission)) {
    throw new Error("You do not have permission to do that.");
  }
}

export async function logAudit(
  ctx: MutationCtx,
  args: {
    serverId: Id<"servers">;
    actorId: Id<"users">;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: string;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    serverId: args.serverId,
    actorId: args.actorId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    details: args.details,
    createdAt: Date.now(),
  });
}

export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type:
      | "friend_request"
      | "friend_accept"
      | "mention"
      | "reply"
      | "moderation"
      | "system";
    title: string;
    body?: string;
    actorId?: Id<"users">;
    link?: string;
    containerKey?: string;
  },
): Promise<void> {
  if (args.actorId && args.userId === args.actorId) return;
  const target = await ctx.db.get(args.userId);
  if (!target) return;
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    actorId: args.actorId,
    link: args.link,
    containerKey: args.containerKey,
    read: false,
    createdAt: Date.now(),
  });
}

/** Upserts the read cursor for a channel or conversation key. */
export async function markRead(
  ctx: MutationCtx,
  userId: Id<"users">,
  key: string,
  at = Date.now(),
): Promise<void> {
  const existing = await ctx.db
    .query("reads")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
    .unique();
  if (existing) {
    if (at > existing.lastReadAt) {
      await ctx.db.patch(existing._id, {
        lastReadAt: at,
        updatedAt: Date.now(),
      });
    }
    return;
  }
  await ctx.db.insert("reads", {
    userId,
    key,
    lastReadAt: at,
    updatedAt: Date.now(),
  });
}

/** True when either user has blocked the other. Used by DM entry points. */
export async function canSendDirectMessage(
  ctx: Ctx,
  from: Id<"users">,
  to: Id<"users">,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (from === to) return { ok: false, reason: "You cannot message yourself." };
  if (await isBlockedBetween(ctx, from, to)) {
    return { ok: false, reason: "You cannot message this user." };
  }
  const target = await ctx.db.get(to);
  if (!target) return { ok: false, reason: "That user no longer exists." };
  const policy = target.dmPolicy ?? "everyone";
  if (policy === "nobody") {
    return { ok: false, reason: "This user is not accepting direct messages." };
  }
  if (policy === "friends") {
    const friendship =
      (await ctx.db
        .query("connections")
        .withIndex("by_requester_addressee", (q) =>
          q.eq("requesterId", from).eq("addresseeId", to),
        )
        .unique()) ??
      (await ctx.db
        .query("connections")
        .withIndex("by_requester_addressee", (q) =>
          q.eq("requesterId", to).eq("addresseeId", from),
        )
        .unique());
    if (!friendship || friendship.status !== "accepted") {
      return {
        ok: false,
        reason: "This user only accepts messages from friends.",
      };
    }
  }
  return { ok: true };
}
