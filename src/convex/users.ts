import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  globalBadgesFor,
  hydrateUser,
  hydrateUsers,
  getUserByUsername,
  isFounderUser,
  isPlatformAdmin,
  isPlatformStaff,
  isPlatformTrialStaff,
  isReservedUsername,
  isSyntheticUser,
  normalizeUsername,
  platformRoleFor,
  requireActiveUser,
  requireUser,
  USERNAME_PATTERN,
} from "./lib";
import { PROFILE_THEME_IDS } from "../lib/profileThemes";
import { DISPLAY_NAME_FONT_IDS } from "../lib/displayName";
import {
  AVATAR_DECORATION_IDS,
  PROFILE_DECORATION_IDS,
} from "../lib/decorations";
import { joinKyroHq } from "./servers";
import {
  claimUpload,
  deleteClaimedUpload,
  requireOwnedUpload,
} from "./uploadSecurity";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

/** Users can change their handle once every hour. */
const USERNAME_COOLDOWN_MS = 60 * 60 * 1000;

/** Inline badge choices in the profile editor: a held badge, or none. */
const PROFILE_BADGES = [
  "none",
  "founder",
  "cofounder",
  "manager",
  "admin",
  "moderator",
  "staff",
  "trialstaff",
  "verified",
  "partner",
  "donator",
  "supporter",
  "vip",
  "bughunter",
  "og",
];

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/**
 * Full profile for the signed-in account, with the avatar resolved to a
 * signed URL. This is what the app renders in the user panel and settings.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    // This read query is mounted throughout the app shell. During sign-out or
    // account deletion, auth can disappear one render before the route
    // unmounts; return null instead of throwing and crashing that transition.
    const id = await getAuthUserId(ctx);
    if (id === null) return null;
    const user = await ctx.db.get(id);
    if (!user || user.deletedAt !== undefined) return null;
    const publicUser = await hydrateUser(ctx, user, id);
    return {
      ...publicUser,
      email: user.email ?? null,
      dmPolicy: user.dmPolicy ?? ("everyone" as const),
      allowFriendRequests: user.allowFriendRequests !== false,
      showPresence: user.showPresence !== false,
      suggestible: user.suggestible !== false,
      createdAt: user.createdAt ?? null,
      role: user.role ?? null,
      platformRole: platformRoleFor(user),
      isPlatformTrialStaff: isPlatformTrialStaff(user),
      isPlatformStaff: isPlatformStaff(user),
      isPlatformAdmin: isPlatformAdmin(user),
      hasUsername: Boolean(user.username),
      usernameChangedAt: user.usernameChangedAt ?? null,
      emailChangedAt: user.emailChangedAt ?? null,
    };
  },
});

/** Finalises onboarding: claims a unique handle and display name. */
export const claimProfile = mutation({
  args: {
    username: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { username, name }) => {
    const { id, user } = await requireActiveUser(ctx);
    const handle = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(handle)) {
      throw new Error(
        "Usernames are 3–32 characters and use lowercase letters, numbers or underscores.",
      );
    }
    if (isReservedUsername(handle) && !isFounderUser(user)) {
      throw new Error("That username is reserved.");
    }
    if (user.username && user.username !== handle) {
      const changedAt = user.usernameChangedAt ?? 0;
      if (Date.now() - changedAt < USERNAME_COOLDOWN_MS) {
        throw new Error("Usernames can only be changed once every hour.");
      }
    }
    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", handle))
      .unique();
    if (taken && taken._id !== id) {
      throw new Error("That username is already taken.");
    }
    const displayName = (name ?? user.name ?? handle).trim().slice(0, 64);
    await ctx.db.patch(id, {
      username: handle,
      name: displayName || handle,
      usernameChangedAt:
        user.username === handle ? user.usernameChangedAt : Date.now(),
      createdAt: user.createdAt ?? Date.now(),
      status: user.status ?? "online",
      lastSeen: Date.now(),
    });
    // Everyone belongs to Kyro HQ — safe to call on every claim.
    await joinKyroHq(ctx, id);
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    bio: v.optional(v.string()),
    customStatus: v.optional(v.string()),
    accent: v.optional(v.string()),
    displayNameFont: v.optional(v.string()),
    displayNameColorMode: v.optional(
      v.union(v.literal("none"), v.literal("solid"), v.literal("gradient")),
    ),
    displayNameColor: v.optional(v.string()),
    displayNameColor2: v.optional(v.string()),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    links: v.optional(
      v.array(
        v.object({
          label: v.string(),
          url: v.string(),
        }),
      ),
    ),
    avatarFrame: v.optional(v.union(v.string(), v.null())),
    avatarDecoration: v.optional(v.union(v.string(), v.null())),
    pronouns: v.optional(v.string()),
    primaryBadge: v.optional(v.string()),
    profileTheme: v.optional(v.string()),
    profileDecoration: v.optional(v.union(v.string(), v.null())),
    wornTag: v.optional(v.union(v.string(), v.null())),
    status: v.optional(
      v.union(
        v.literal("online"),
        v.literal("idle"),
        v.literal("dnd"),
        v.literal("invisible"),
        v.literal("offline"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { id, user } = await requireActiveUser(ctx);
    const patch: Partial<Doc<"users">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, 64);
      if (name.length < 2)
        throw new Error("Display names need at least 2 characters.");
      patch.name = name;
    }
    if (args.bio !== undefined) patch.bio = args.bio.trim().slice(0, 400);
    if (args.customStatus !== undefined) {
      patch.customStatus = args.customStatus.trim().slice(0, 100);
    }
    if (args.accent !== undefined) {
      if (args.accent && !/^#[0-9a-fA-F]{6}$/.test(args.accent)) {
        throw new Error("Accent must be a hex colour like #67E8F9.");
      }
      patch.accent = args.accent || undefined;
    }
    if (args.displayNameFont !== undefined) {
      if (!DISPLAY_NAME_FONT_IDS.includes(args.displayNameFont)) {
        throw new Error("That display-name font doesn't exist.");
      }
      patch.displayNameFont =
        args.displayNameFont === "default" ? undefined : args.displayNameFont;
    }
    if (args.displayNameColorMode !== undefined) {
      patch.displayNameColorMode =
        args.displayNameColorMode === "none"
          ? undefined
          : args.displayNameColorMode;
      if (args.displayNameColorMode === "none") {
        patch.displayNameColor = undefined;
        patch.displayNameColor2 = undefined;
      }
    }
    if (args.displayNameColor !== undefined) {
      if (args.displayNameColor && !HEX_COLOUR.test(args.displayNameColor)) {
        throw new Error("Display-name colours must be six-digit hex values.");
      }
      patch.displayNameColor = args.displayNameColor || undefined;
    }
    if (args.displayNameColor2 !== undefined) {
      if (args.displayNameColor2 && !HEX_COLOUR.test(args.displayNameColor2)) {
        throw new Error("Display-name colours must be six-digit hex values.");
      }
      patch.displayNameColor2 = args.displayNameColor2 || undefined;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.lastSeen = Date.now();
    }
    if (args.avatarStorageId !== undefined) {
      if (args.avatarStorageId === null) {
        await deleteClaimedUpload(ctx, user.avatarStorageId, "user_avatar", id);
        patch.avatarStorageId = undefined;
      } else {
        await requireOwnedUpload(ctx, id, args.avatarStorageId, {
          imageOnly: true,
        });
        await claimUpload(ctx, id, args.avatarStorageId, "user_avatar", id, {
          imageOnly: true,
        });
        if (user.avatarStorageId !== args.avatarStorageId) {
          await deleteClaimedUpload(
            ctx,
            user.avatarStorageId,
            "user_avatar",
            id,
          );
        }
        patch.avatarStorageId = args.avatarStorageId;
      }
    }
    if (args.bannerStorageId !== undefined) {
      if (args.bannerStorageId === null) {
        await deleteClaimedUpload(ctx, user.bannerStorageId, "user_banner", id);
        patch.bannerStorageId = undefined;
      } else {
        await requireOwnedUpload(ctx, id, args.bannerStorageId, {
          imageOnly: true,
        });
        await claimUpload(ctx, id, args.bannerStorageId, "user_banner", id, {
          imageOnly: true,
        });
        if (user.bannerStorageId !== args.bannerStorageId) {
          await deleteClaimedUpload(
            ctx,
            user.bannerStorageId,
            "user_banner",
            id,
          );
        }
        patch.bannerStorageId = args.bannerStorageId;
      }
    }
    if (args.links !== undefined) {
      if (args.links.length > 6) {
        throw new Error("You can keep up to 6 profile links.");
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
    if (args.avatarFrame !== undefined) {
      // Keep in sync with AVATAR_FRAMES in src/lib/frames.ts.
      const knownFrames = ["ember", "aqua", "forest", "kyro", "gold", "rose"];
      patch.avatarFrame =
        args.avatarFrame && knownFrames.includes(args.avatarFrame)
          ? args.avatarFrame
          : undefined;
    }
    if (args.avatarDecoration !== undefined) {
      patch.avatarDecoration =
        args.avatarDecoration &&
        AVATAR_DECORATION_IDS.includes(args.avatarDecoration)
          ? args.avatarDecoration
          : undefined;
    }
    if (args.pronouns !== undefined) {
      patch.pronouns = args.pronouns.trim().slice(0, 32);
    }
    if (args.primaryBadge !== undefined) {
      if (!PROFILE_BADGES.includes(args.primaryBadge)) {
        throw new Error("That badge doesn't exist.");
      }
      if (args.primaryBadge !== "none") {
        // You can only wear a badge the same derivation gives you everywhere.
        const held = new Set<string>(globalBadgesFor(user));
        if (!held.has(args.primaryBadge)) {
          throw new Error("You don't hold that badge.");
        }
      }
      patch.primaryBadge = args.primaryBadge;
    }
    if (args.profileTheme !== undefined) {
      patch.profileTheme =
        args.profileTheme && PROFILE_THEME_IDS.includes(args.profileTheme)
          ? args.profileTheme
          : undefined;
    }
    if (args.profileDecoration !== undefined) {
      patch.profileDecoration =
        args.profileDecoration &&
        PROFILE_DECORATION_IDS.includes(args.profileDecoration)
          ? args.profileDecoration
          : undefined;
    }
    if (args.wornTag !== undefined) {
      if (!args.wornTag) {
        patch.wornTag = undefined;
      } else {
        const tag = args.wornTag.trim().toUpperCase().slice(0, 4);
        if (!/^[A-Z0-9]{2,4}$/.test(tag)) {
          throw new Error("Community tags are 2–4 letters or numbers.");
        }
        const memberships = await ctx.db
          .query("serverMembers")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .collect();
        let allowed = false;
        for (const membership of memberships) {
          const memberServer = await ctx.db.get(membership.serverId);
          if (memberServer?.tag === tag) {
            allowed = true;
            break;
          }
        }
        if (!allowed) {
          throw new Error("Pick a tag from one of your own communities.");
        }
        patch.wornTag = tag;
      }
    }
    await ctx.db.patch(id, patch);
  },
});

/**
 * Grant or revoke a user's platform-wide badges: Admin (site role),
 * Moderator and Verified (dedicated flags). The Founder badge is derived
 * from the account's username, so it can never be set here. Only site
 * admins may call this.
 */
/**
 * The founder may remove the Admin badge from their own profile at will.
 * Anyone else keeps the badge they were granted.
 */
export const removeMyAdminBadge = mutation({
  args: {},
  handler: async (ctx) => {
    const { id, user } = await requireActiveUser(ctx);
    const isFounder = isFounderUser(user);
    if (!isFounder) {
      throw new Error("Only the Kyro founder can remove the admin badge.");
    }
    if (user.role === "admin") await ctx.db.patch(id, { role: undefined });
    await ctx.db.patch(id, { adminBadgeRemoved: true });
  },
});

export const setBadges = mutation({
  args: {
    userId: v.id("users"),
    admin: v.optional(v.boolean()),
    coFounder: v.optional(v.boolean()),
    manager: v.optional(v.boolean()),
    staff: v.optional(v.boolean()),
    trialStaff: v.optional(v.boolean()),
    moderator: v.optional(v.boolean()),
    verified: v.optional(v.boolean()),
    bugHunter: v.optional(v.boolean()),
    vip: v.optional(v.boolean()),
    og: v.optional(v.boolean()),
    supporter: v.optional(v.boolean()),
    donator: v.optional(v.boolean()),
    partner: v.optional(v.boolean()),
    /** Founder is special: only Kyro's founder may ever grant it. */
    founder: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      userId,
      admin,
      coFounder,
      manager,
      staff,
      trialStaff,
      moderator,
      verified,
      bugHunter,
      vip,
      og,
      supporter,
      donator,
      partner,
      founder,
    },
  ) => {
    const { id, user } = await requireActiveUser(ctx);
    const callerIsFounder = isFounderUser(user);
    if (!isPlatformAdmin(user)) {
      throw new Error("Only Kyro admins can manage global badges.");
    }
    if (founder !== undefined && !callerIsFounder) {
      throw new Error("Only Kyro's founder can grant the Founder badge.");
    }
    if (
      admin === undefined &&
      coFounder === undefined &&
      manager === undefined &&
      staff === undefined &&
      trialStaff === undefined &&
      moderator === undefined &&
      verified === undefined &&
      bugHunter === undefined &&
      vip === undefined &&
      og === undefined &&
      supporter === undefined &&
      donator === undefined &&
      partner === undefined &&
      founder === undefined
    ) {
      throw new Error("Nothing to update.");
    }
    if (admin === false && userId === id && !callerIsFounder) {
      throw new Error("You can't remove your own Admin badge.");
    }
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("That user no longer exists.");
    const patch: Partial<Doc<"users">> = {};
    if (admin !== undefined) {
      patch.role = admin ? "admin" : "user";
      // Clearing admin also lifts the founder's admin-badge removal flag.
      if (admin) patch.adminBadgeRemoved = undefined;
    }
    if (moderator !== undefined) patch.siteModerator = moderator;
    if (coFounder !== undefined) patch.coFounder = coFounder;
    if (manager !== undefined) patch.manager = manager;
    if (staff !== undefined) patch.staff = staff;
    if (trialStaff !== undefined) patch.trialStaff = trialStaff;
    if (verified !== undefined) patch.verified = verified;
    if (bugHunter !== undefined) patch.bugHunter = bugHunter;
    if (vip !== undefined) patch.vip = vip;
    if (og !== undefined) patch.og = og;
    if (supporter !== undefined) patch.supporter = supporter;
    if (donator !== undefined) patch.donator = donator;
    if (partner !== undefined) patch.partner = partner;
    if (founder !== undefined) {
      if (isFounderUser(target)) {
        // The founder's own badge is a self-visibility flag, not a grant.
        patch.founderBadgeRemoved = founder ? undefined : true;
      } else {
        patch.founderBadge = founder;
      }
    }
    await ctx.db.patch(userId, patch);
  },
});

/** Presence heartbeat + explicit status selection. */
export const setPresence = mutation({
  args: {
    status: v.union(
      v.literal("online"),
      v.literal("idle"),
      v.literal("dnd"),
      v.literal("invisible"),
      v.literal("offline"),
    ),
  },
  handler: async (ctx, { status }) => {
    const { id } = await requireActiveUser(ctx);
    await ctx.db.patch(id, { status, lastSeen: Date.now() });
  },
});

export const heartbeat = mutation({
  args: {
    device: v.optional(
      v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet")),
    ),
  },
  handler: async (ctx, { device }) => {
    const { id, user } = await requireActiveUser(ctx);
    const status =
      user.status === "idle" ||
      user.status === "dnd" ||
      user.status === "invisible"
        ? user.status
        : "online";
    const now = Date.now();
    const patch: {
      lastSeen: number;
      status: "online" | "idle" | "dnd" | "invisible";
      device?: "desktop" | "mobile" | "tablet";
      lastIp?: string;
      lastIpAt?: number;
    } = { lastSeen: now, status, ...(device ? { device } : {}) };

    // Record the IP of real accounts only, for the two-person staff IP
    // detector. Seeded accounts must never contribute an IP. Scheduled/CLI
    // executions have no request metadata and simply leave the last value.
    if (!isSyntheticUser(user)) {
      const metadata = await ctx.meta.getRequestMetadata();
      const ip = metadata.ip?.trim();
      if (ip) {
        patch.lastIp = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
        patch.lastIpAt = now;
      }
    }

    await ctx.db.patch(id, patch);
  },
});

/**
 * The founder hides or restores their own Founder badge. Only ever the
 * founder's own account — nobody else can touch it.
 */
export const setMyFounderBadge = mutation({
  args: { visible: v.boolean() },
  handler: async (ctx, { visible }) => {
    const { id, user } = await requireActiveUser(ctx);
    if (!isFounderUser(user)) {
      throw new Error("Only Kyro's founder has the Founder badge.");
    }
    await ctx.db.patch(id, {
      founderBadgeRemoved: visible ? undefined : true,
    });
  },
});

export const updatePrivacy = mutation({
  args: {
    dmPolicy: v.optional(
      v.union(v.literal("everyone"), v.literal("friends"), v.literal("nobody")),
    ),
    allowFriendRequests: v.optional(v.boolean()),
    showPresence: v.optional(v.boolean()),
    suggestible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id } = await requireUser(ctx);
    await ctx.db.patch(id, args);
  },
});

/** Public profile for popovers and profile pages. */
export const profile = query({
  args: {
    userId: v.id("users"),
    serverId: v.optional(v.id("servers")),
  },
  handler: async (ctx, { userId, serverId }) => {
    const { id: viewerId } = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const publicUser = await hydrateUser(ctx, user, viewerId);
    const [mine, theirs, myOutgoing, myIncoming, theirOutgoing, theirIncoming] =
      await Promise.all([
        ctx.db
          .query("serverMembers")
          .withIndex("by_user", (q) => q.eq("userId", viewerId))
          .collect(),
        ctx.db
          .query("serverMembers")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("connections")
          .withIndex("by_requester", (q) =>
            q.eq("requesterId", viewerId).eq("status", "accepted"),
          )
          .collect(),
        ctx.db
          .query("connections")
          .withIndex("by_addressee", (q) =>
            q.eq("addresseeId", viewerId).eq("status", "accepted"),
          )
          .collect(),
        ctx.db
          .query("connections")
          .withIndex("by_requester", (q) =>
            q.eq("requesterId", userId).eq("status", "accepted"),
          )
          .collect(),
        ctx.db
          .query("connections")
          .withIndex("by_addressee", (q) =>
            q.eq("addresseeId", userId).eq("status", "accepted"),
          )
          .collect(),
      ]);
    const theirServers = new Map(theirs.map((m) => [m.serverId, m]));
    const mutual: { id: string; name: string }[] = [];
    for (const membership of mine) {
      const server = theirServers.get(membership.serverId);
      if (!server) continue;
      const doc = await ctx.db.get(membership.serverId);
      if (doc) mutual.push({ id: doc._id, name: doc.name });
    }
    const friendIds = (
      accountId: Id<"users">,
      outgoing: typeof myOutgoing,
      incoming: typeof myIncoming,
    ) =>
      new Set([
        ...outgoing.map((connection) =>
          connection.requesterId === accountId
            ? connection.addresseeId
            : connection.requesterId,
        ),
        ...incoming.map((connection) =>
          connection.addresseeId === accountId
            ? connection.requesterId
            : connection.addresseeId,
        ),
      ]);
    const myFriends = friendIds(viewerId, myOutgoing, myIncoming);
    const theirFriends = friendIds(userId, theirOutgoing, theirIncoming);
    const mutualFriendIds =
      viewerId === userId
        ? []
        : [...myFriends].filter((friendId) => theirFriends.has(friendId));
    const mutualFriendMap = await hydrateUsers(
      ctx,
      mutualFriendIds.slice(0, 24),
      viewerId,
    );
    const mutualFriends = mutualFriendIds
      .map((friendId) => mutualFriendMap.get(friendId))
      .filter(
        (friend): friend is NonNullable<typeof friend> => friend !== undefined,
      );
    const viewerServerMembership = serverId
      ? mine.find((membership) => membership.serverId === serverId)
      : undefined;
    const profileServerMembership = serverId
      ? theirs.find((membership) => membership.serverId === serverId)
      : undefined;
    let serverRoles: { id: string; name: string; color: string | null }[] = [];
    let serverJoinedAt: number | null = null;
    if (serverId && viewerServerMembership && profileServerMembership) {
      const roleDocs = await ctx.db
        .query("serverRoles")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .collect();
      const held = new Set(profileServerMembership.roleIds);
      serverRoles = roleDocs
        .filter((role) => held.has(role._id) && !role.isDefault)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role._id as string,
          name: role.name,
          color: role.color ?? null,
        }));
      serverJoinedAt = profileServerMembership.joinedAt;
    }
    return {
      user: publicUser,
      mutualServers: mutual.slice(0, 24),
      mutualFriends,
      serverRoles,
      serverJoinedAt,
    };
  },
});

/** Username-prefix search used by "add friend" and the global search palette. */
export const searchUsers = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }) => {
    const { id: viewerId } = await requireUser(ctx);
    const needle = normalizeUsername(term);
    if (!needle) return [];
    const results = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.gte("username", needle).lt("username", needle + "\uffff"),
      )
      .take(Math.min(limit ?? 12, 25));
    const users = await hydrateUsers(
      ctx,
      results.map((u) => u._id),
      viewerId,
    );
    return results
      .map((u) => users.get(u._id))
      .filter(
        (u): u is NonNullable<typeof u> => Boolean(u) && u!.id !== viewerId,
      );
  },
});

/** Global search across communities and DMs this user can actually access. */
export const searchMessages = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }) => {
    const { id: viewerId } = await requireUser(ctx);
    const filters = new Map<string, string>();
    const needle = term
      .trim()
      .replace(
        /\b(from|in|before|after|has|pinned|mentions):("[^"]+"|\S+)/gi,
        (_match, key: string, rawValue: string) => {
          filters.set(
            key.toLowerCase(),
            rawValue.replace(/^"|"$/g, "").toLowerCase(),
          );
          return " ";
        },
      )
      .replace(/\s+/g, " ")
      .trim();
    if (needle.length < 2 && filters.size === 0) return [];

    const [memberships, conversations] = await Promise.all([
      ctx.db
        .query("serverMembers")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .collect(),
      ctx.db
        .query("conversationMembers")
        .withIndex("by_user", (q) => q.eq("userId", viewerId))
        .collect(),
    ]);
    const channelIds = new Set<string>();
    for (const membership of memberships) {
      const channels = await ctx.db
        .query("channels")
        .withIndex("by_server", (q) => q.eq("serverId", membership.serverId))
        .collect();
      for (const channel of channels) channelIds.add(channel._id);
    }
    const conversationIds = new Set(conversations.map((c) => c.conversationId));
    conversationIds.forEach((id) => channelIds.add(id));

    const hits =
      needle.length >= 2
        ? await ctx.db
            .query("messages")
            .withSearchIndex("search_content", (q) =>
              q.search("content", needle),
            )
            .take(250)
        : (
            await Promise.all(
              Array.from(channelIds)
                .slice(0, 75)
                .map((containerId) =>
                  ctx.db
                    .query("messages")
                    .withIndex("by_container", (q) =>
                      q.eq("containerId", containerId),
                    )
                    .order("desc")
                    .take(20),
                ),
            )
          )
            .flat()
            .sort((a, b) => b.createdAt - a.createdAt);

    const fromName = filters.get("from")?.replace(/^@/, "");
    const fromUser = fromName ? await getUserByUsername(ctx, fromName) : null;
    const inName = filters.get("in")?.replace(/^#/, "");
    const before = filters.get("before")
      ? Date.parse(filters.get("before")!)
      : Number.NaN;
    const after = filters.get("after")
      ? Date.parse(filters.get("after")!)
      : Number.NaN;
    const has = filters.get("has");
    const pinned = filters.get("pinned");
    const mentions = filters.get("mentions");
    const allowed = [];
    for (const message of hits) {
      if (!channelIds.has(message.containerId)) continue;
      if (fromName && message.authorId !== fromUser?._id) continue;
      if (!Number.isNaN(before) && message.createdAt >= before) continue;
      if (!Number.isNaN(after) && message.createdAt < after) continue;
      if (pinned === "true" && message.pinnedAt === undefined) continue;
      if (pinned === "false" && message.pinnedAt !== undefined) continue;
      if (has === "link" && !/https?:\/\//i.test(message.content)) continue;
      if (
        (has === "image" || has === "attachment") &&
        !(message.attachments ?? []).some((attachment) =>
          has === "image" ? attachment.mimeType.startsWith("image/") : true,
        )
      ) {
        continue;
      }
      if (mentions === "me") {
        const viewer = await ctx.db.get(viewerId);
        if (
          !viewer?.username ||
          !message.content
            .toLowerCase()
            .includes(`@${viewer.username.toLowerCase()}`)
        ) {
          continue;
        }
      }
      if (inName && message.containerType === "channel") {
        const channel = await ctx.db.get(message.containerId as Id<"channels">);
        if (!channel || channel.name.toLowerCase() !== inName) continue;
      }
      allowed.push(message);
    }
    const scoped = allowed.slice(0, Math.min(limit ?? 25, 50));

    const authors = await hydrateUsers(
      ctx,
      scoped.map((m) => m.authorId),
      viewerId,
    );
    return await Promise.all(
      scoped.map(async (message) => {
        const isChannel = message.containerType === "channel";
        const container = isChannel
          ? await ctx.db.get(message.containerId as Id<"channels">)
          : await ctx.db.get(message.containerId as Id<"conversations">);
        return {
          message: {
            id: message._id,
            content: message.content.slice(0, 400),
            createdAt: message.createdAt,
            containerType: message.containerType,
            containerId: message.containerId,
            author: authors.get(message.authorId) ?? null,
          },
          serverId:
            isChannel && container
              ? ((container as Doc<"channels">).serverId as string)
              : null,
          containerName:
            container && "name" in container ? container.name : null,
        };
      }),
    );
  },
});

/** Active sessions for this account, with the current one flagged. */
export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const current = await getAuthSessionId(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", id))
      .collect();
    return sessions
      .map((session) => ({
        id: session._id,
        expirationTime: session.expirationTime,
        current: session._id === current,
      }))
      .sort((a, b) => b.expirationTime - a.expirationTime);
  },
});

export const revokeSession = mutation({
  args: { sessionId: v.id("authSessions") },
  handler: async (ctx, { sessionId }) => {
    const { id } = await requireUser(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== id)
      throw new Error("Session not found.");
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(sessionId);
  },
});

export const revokeOtherSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const current = await getAuthSessionId(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", id))
      .collect();
    for (const session of sessions) {
      if (session._id === current) continue;
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
  },
});

/** GDPR-style export: everything Kyro stores about this account. */
export const exportData = mutation({
  args: {},
  handler: async (ctx) => {
    const { id, user } = await requireUser(ctx);
    const [
      outgoing,
      incoming,
      blocks,
      memberships,
      ownedServers,
      messages,
      notes,
      reads,
      accountSecurity,
      passkeyCredentials,
    ] = await Promise.all([
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
        .query("serverMembers")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
      ctx.db
        .query("servers")
        .withIndex("by_owner", (q) => q.eq("ownerId", id))
        .collect(),
      ctx.db
        .query("messages")
        .withIndex("by_author", (q) => q.eq("authorId", id))
        .take(5000),
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .take(1000),
      ctx.db
        .query("reads")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
      ctx.db
        .query("accountSecurity")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .unique(),
      ctx.db
        .query("passkeyCredentials")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
    ]);

    const connections = [...outgoing, ...incoming];
    const relevantConnections = connections;
    const friendIds = relevantConnections.map((c) =>
      c.requesterId === id ? c.addresseeId : c.requesterId,
    );
    const friendDocs = await Promise.all(
      friendIds.map((fid) => ctx.db.get(fid)),
    );

    const payload = {
      exportedAt: new Date().toISOString(),
      profile: {
        username: user.username,
        name: user.name,
        bio: user.bio,
        email: user.email,
        status: user.status,
        customStatus: user.customStatus,
        createdAt: user.createdAt,
        emailChangedAt: user.emailChangedAt,
      },
      friends: friendDocs
        .filter((doc): doc is Doc<"users"> => Boolean(doc))
        .map((doc) => ({ username: doc.username, name: doc.name })),
      blocks: await Promise.all(
        blocks.map(async (block) => {
          const doc = await ctx.db.get(block.blockedId);
          return { username: doc?.username ?? null, name: doc?.name ?? null };
        }),
      ),
      communities: {
        memberOf: await Promise.all(
          memberships.map(async (m) => {
            const doc = await ctx.db.get(m.serverId);
            return doc?.name ?? null;
          }),
        ),
        owns: ownedServers.map((s) => s.name),
      },
      messages: messages.map((m) => ({
        containerType: m.containerType,
        containerId: m.containerId,
        content: m.content,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
      notifications: notes.map((n) => ({
        type: n.type,
        title: n.title,
        read: n.read,
        createdAt: new Date(n.createdAt).toISOString(),
      })),
      security: {
        twoFactorEnabled: accountSecurity?.twoFactorEnabled === true,
        recoveryCodesRemaining: accountSecurity?.recoveryCodeHashes.length ?? 0,
        passkeys: passkeyCredentials.map((passkey) => ({
          name: passkey.name,
          createdAt: new Date(passkey.createdAt).toISOString(),
          lastUsedAt: passkey.lastUsedAt
            ? new Date(passkey.lastUsedAt).toISOString()
            : null,
        })),
      },
      readCursors: reads.length,
    };
    return payload;
  },
});

/** Permanently removes the account and everything it owns. */
export const deleteAccount = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, { confirm }) => {
    const { id, user } = await requireUser(ctx);
    if (confirm !== "DELETE") {
      throw new Error("Type DELETE to confirm account deletion.");
    }
    const owned = await ctx.db
      .query("servers")
      .withIndex("by_owner", (q) => q.eq("ownerId", id))
      .collect();
    if (owned.length > 0) {
      throw new Error(
        "Transfer or delete the communities you own before deleting your account.",
      );
    }

    const [
      memberships,
      notes,
      reads,
      outgoing,
      incoming,
      blocks,
      sessions,
      accounts,
      securityRows,
      passkeys,
      targetCases,
      moderatorCases,
      emailOutbox,
      verificationCodes,
      livekitTickets,
      emojiPreferences,
      gifFavorites,
      serverTemplates,
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
        .query("emojiPreferences")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
      ctx.db
        .query("gifFavorites")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .collect(),
      ctx.db
        .query("serverTemplates")
        .withIndex("by_creator", (q) => q.eq("creatorId", id))
        .collect(),
    ]);

    for (const membership of memberships) await ctx.db.delete(membership._id);
    for (const note of notes) await ctx.db.delete(note._id);
    for (const read of reads) await ctx.db.delete(read._id);
    const connections = [...outgoing, ...incoming];
    for (const connection of connections) {
      if (connection.requesterId === id || connection.addresseeId === id) {
        await ctx.db.delete(connection._id);
      }
    }
    for (const block of blocks) await ctx.db.delete(block._id);
    for (const row of securityRows) await ctx.db.delete(row._id);
    for (const passkey of passkeys) await ctx.db.delete(passkey._id);
    for (const email of emailOutbox) await ctx.db.delete(email._id);
    for (const code of verificationCodes) await ctx.db.delete(code._id);
    for (const ticket of livekitTickets) await ctx.db.delete(ticket._id);
    for (const row of [
      ...emojiPreferences,
      ...gifFavorites,
      ...serverTemplates,
    ]) {
      await ctx.db.delete(row._id);
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
    const caseIds = new Set(
      [...targetCases, ...moderatorCases].map((row) => row._id),
    );
    for (const caseId of caseIds) await ctx.db.delete(caseId);

    const ownMessages = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("authorId", id))
      .take(5000);
    for (const message of ownMessages) {
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", message._id))
        .collect();
      for (const reaction of reactions) await ctx.db.delete(reaction._id);
      await ctx.db.delete(message._id);
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
    await deleteClaimedUpload(ctx, user.avatarStorageId, "user_avatar", id);
    await deleteClaimedUpload(ctx, user.bannerStorageId, "user_banner", id);
    await ctx.db.delete(id);
  },
});

/** Small helper used by the onboarding screen to check availability. */
export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const handle = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(handle) || isReservedUsername(handle))
      return false;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", handle))
      .unique();
    return existing === null;
  },
});

/**
 * People you may know: members of communities you're in, minus yourself,
 * existing friends, pending requests in either direction, and anyone you've
 * blocked (or who blocked you). Powers the Suggested friends tab.
 * Online members sort first.
 */
export const suggest = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);

    const myMemberships = await ctx.db
      .query("serverMembers")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect();
    const perServer = await Promise.all(
      myMemberships.slice(0, 20).map((row) =>
        ctx.db
          .query("serverMembers")
          .withIndex("by_server", (q) => q.eq("serverId", row.serverId))
          .collect(),
      ),
    );
    const candidateIds = new Set<string>();
    for (const rows of perServer) {
      for (const row of rows) {
        if (row.userId !== id) candidateIds.add(row.userId);
      }
    }

    const [outgoing, incoming, blocking, blockedBy] = await Promise.all([
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
    ]);
    const exclude = new Set<string>([
      ...outgoing.map((row) => row.addresseeId as string),
      ...incoming.map((row) => row.requesterId as string),
      ...blocking.map((row) => row.blockedId as string),
      ...blockedBy.map((row) => row.blockerId as string),
    ]);
    for (const blocked of exclude) candidateIds.delete(blocked);

    // People can opt out of suggestions entirely; respect that before hydrating.
    const candidateDocs = await Promise.all(
      [...candidateIds]
        .slice(0, 80)
        .map((candidateId) => ctx.db.get(candidateId as Id<"users">)),
    );
    const visibleIds = candidateDocs
      .filter(
        (doc): doc is Doc<"users"> => doc !== null && doc.suggestible !== false,
      )
      .map((doc) => doc._id);
    const users = await hydrateUsers(ctx, visibleIds, id);
    return [...users.values()]
      .slice(0, 60)
      .sort((a, b) => {
        const aOnline = a.presence !== "offline" ? 0 : 1;
        const bOnline = b.presence !== "offline" ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 12);
  },
});
