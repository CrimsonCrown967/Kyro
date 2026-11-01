import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const presenceValidator = v.union(
  v.literal("online"),
  v.literal("idle"),
  v.literal("dnd"),
  v.literal("invisible"),
  v.literal("offline"),
);
export type Presence = Infer<typeof presenceValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user is anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // --- Platform-wide (global) badges, granted by staff ---
      /** Site-wide Moderator badge — not tied to any one community. */
      siteModerator: v.optional(v.boolean()),
      /** Staff team: Trial Staff badge (probationary team member). */
      trialStaff: v.optional(v.boolean()),
      /** Staff team: full Staff badge. */
      staff: v.optional(v.boolean()),
      /** Staff team: Manager badge for staff leads. */
      manager: v.optional(v.boolean()),
      /** Staff team: Co Founder badge for Kyro's co-founders. */
      coFounder: v.optional(v.boolean()),
      /** Site-wide Verified badge — granted by admins. */
      verified: v.optional(v.boolean()),
      /** Site-wide Bug Hunter badge — granted for a confirmed bug report. */
      bugHunter: v.optional(v.boolean()),
      /** Site-wide VIP badge — granted to very important members. */
      vip: v.optional(v.boolean()),
      /** Site-wide OG badge — granted to early Kyro members. */
      og: v.optional(v.boolean()),
      /** Site-wide Supporter badge — granted to members who back Kyro. */
      supporter: v.optional(v.boolean()),
      /** Site-wide Donator badge — granted to members who donated. */
      donator: v.optional(v.boolean()),
      /** Site-wide Partner badge — granted to official Kyro partners. */
      partner: v.optional(v.boolean()),
      /** A Founder badge granted to someone other than the founder. */
      founderBadge: v.optional(v.boolean()),
      /** Kyro Founder strips the Admin badge from their own profile. */
      adminBadgeRemoved: v.optional(v.boolean()),
      /** Kyro Founder strips their own Founder badge (and can restore it). */
      founderBadgeRemoved: v.optional(v.boolean()),
      /** Device class last seen on, powering the platform indicator. */
      device: v.optional(
        v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet")),
      ),

      // --- Kyro profile + presence ---
      /** Unique, lowercased handle used for @mentions and friend search. */
      username: v.optional(v.string()),
      bio: v.optional(v.string()),
      /** Storage id of an uploaded avatar (resolved to a signed URL on read). */
      avatarStorageId: v.optional(v.id("_storage")),
      /** Storage id of an uploaded profile banner (images and GIFs). */
      bannerStorageId: v.optional(v.id("_storage")),
      /** Chosen status. `invisible` renders as offline to everybody else. */
      status: v.optional(presenceValidator),
      customStatus: v.optional(v.string()),
      /** Heartbeat timestamp; drives "online" for clients that never set a status. */
      lastSeen: v.optional(v.number()),
      /** Per-user accent colour used across their own interface. */
      accent: v.optional(v.string()),
      /** Safe preset used to render this user's display name everywhere. */
      displayNameFont: v.optional(v.string()),
      /** Optional solid or two-colour gradient display-name treatment. */
      displayNameColorMode: v.optional(
        v.union(v.literal("solid"), v.literal("gradient")),
      ),
      displayNameColor: v.optional(v.string()),
      displayNameColor2: v.optional(v.string()),
      /** Privacy controls, enforced server-side. */
      dmPolicy: v.optional(
        v.union(
          v.literal("everyone"),
          v.literal("friends"),
          v.literal("nobody"),
        ),
      ),
      allowFriendRequests: v.optional(v.boolean()),
      showPresence: v.optional(v.boolean()),
      createdAt: v.optional(v.number()),
      /** Username changes are limited to once every hour. */
      usernameChangedAt: v.optional(v.number()),
      /** External profile links (YouTube, site, portfolio …), max 6. */
      links: v.optional(
        v.array(v.object({ label: v.string(), url: v.string() })),
      ),
      /** Built-in avatar frame id from the profile editor. */
      avatarFrame: v.optional(v.string()),
      /** Decorative vector overlay rendered around the user's avatar. */
      avatarDecoration: v.optional(v.string()),
      /** Pronouns shown on the profile card, e.g. "He/Him". */
      pronouns: v.optional(v.string()),
      /** Which badge shows next to the name in chat; `"none"` hides them. */
      primaryBadge: v.optional(v.string()),
      /** Profile theme preset id from the profile editor. */
      profileTheme: v.optional(v.string()),
      /** Decorative animated/static overlay rendered across the profile card. */
      profileDecoration: v.optional(v.string()),
      /** Opt-out of appearing on other people's Suggested friends tab. */
      suggestible: v.optional(v.boolean()),
      /** Community tag the user wears next to their name (2–4 chars). */
      wornTag: v.optional(v.string()),
      /** Tombstone marker retained so historical audit references stay valid. */
      deletedAt: v.optional(v.number()),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_username", ["username"]),

    /** Friend requests in either direction; `accepted` rows are friendships. */
    connections: defineTable({
      requesterId: v.id("users"),
      addresseeId: v.id("users"),
      status: v.union(v.literal("pending"), v.literal("accepted")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_requester", ["requesterId", "status"])
      .index("by_addressee", ["addresseeId", "status"])
      .index("by_requester_addressee", ["requesterId", "addresseeId"]),

    /** Blocking is enforced on the server: no DMs, no friend requests. */
    blocks: defineTable({
      blockerId: v.id("users"),
      blockedId: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_blocker", ["blockerId"])
      .index("by_blocked", ["blockedId"])
      .index("by_pair", ["blockerId", "blockedId"]),

    /** Direct messages: exactly two participants for `dm`, 3+ for `group`. */
    conversations: defineTable({
      type: v.union(v.literal("dm"), v.literal("group")),
      participantIds: v.array(v.id("users")),
      /** Sorted "a:b" key so a 1:1 conversation can never be duplicated. */
      pairKey: v.optional(v.string()),
      name: v.optional(v.string()),
      ownerId: v.optional(v.id("users")),
      lastMessageAt: v.optional(v.number()),
      lastMessagePreview: v.optional(v.string()),
      lastMessageSenderId: v.optional(v.id("users")),
      createdAt: v.number(),
      updatedAt: v.optional(v.number()),
    })
      .index("by_pair", ["pairKey"])
      .index("by_last", ["lastMessageAt"]),

    /** Membership rows so "my conversations" is a real indexed lookup. */
    conversationMembers: defineTable({
      conversationId: v.id("conversations"),
      userId: v.id("users"),
      joinedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_conversation", ["conversationId"])
      .index("by_user_conversation", ["userId", "conversationId"]),

    servers: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      iconStorageId: v.optional(v.id("_storage")),
      bannerStorageId: v.optional(v.id("_storage")),
      ownerId: v.id("users"),
      isPublic: v.boolean(),
      rules: v.optional(v.string()),
      welcomeMessage: v.optional(v.string()),
      /** Discovery tags shown on explore cards, e.g. "gaming", "coding". */
      tags: v.optional(v.array(v.string())),
      /** Custom invite path segment: kyro.app/invite/<vanityCode>. */
      vanityCode: v.optional(v.string()),
      /** Server-wide lockdown: only staff with manage_messages can post. */
      locked: v.optional(v.boolean()),
      /** Auto-unlock timestamp for timed raid locks. */
      lockedUntil: v.optional(v.number()),
      /** 2–4 char community tag members can wear next to their name. */
      tag: v.optional(v.string()),
      /** Links shown on the community profile and Discovery card. */
      links: v.optional(
        v.array(v.object({ label: v.string(), url: v.string() })),
      ),
      /** Account age required before members can talk here. */
      verificationLevel: v.optional(
        v.union(
          v.literal("none"),
          v.literal("low"),
          v.literal("medium"),
          v.literal("high"),
        ),
      ),
      /** New-account gate at join time in ms (0 = off, 1 day, 7 days). */
      minAccountAgeMs: v.optional(v.number()),
      /** Channel holding the rules: only staff post there. */
      rulesChannelId: v.optional(v.id("channels")),
      /** Community theme colours, shown to viewers with server colours on. */
      themeAccent: v.optional(v.string()),
      themeTint: v.optional(v.string()),
      /** Immutable marker for the official platform community. */
      isPlatformHome: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.optional(v.number()),
    })
      .index("by_owner", ["ownerId"])
      .index("by_created", ["createdAt"])
      .index("by_vanity", ["vanityCode"])
      .index("by_platform_home", ["isPlatformHome"])
      .searchIndex("search_name", {
        searchField: "name",
        filterFields: ["isPublic"],
      }),

    serverMembers: defineTable({
      serverId: v.id("servers"),
      userId: v.id("users"),
      nickname: v.optional(v.string()),
      roleIds: v.array(v.id("serverRoles")),
      joinedAt: v.number(),
      /** Mute every notification from this community. */
      muted: v.optional(v.boolean()),
    })
      .index("by_server", ["serverId"])
      .index("by_user", ["userId"])
      .index("by_server_user", ["serverId", "userId"]),

    serverRoles: defineTable({
      serverId: v.id("servers"),
      name: v.string(),
      color: v.optional(v.string()),
      position: v.number(),
      permissions: v.array(v.string()),
      isDefault: v.boolean(),
    })
      .index("by_server", ["serverId"])
      .index("by_server_position", ["serverId", "position"]),

    categories: defineTable({
      serverId: v.id("servers"),
      name: v.string(),
      position: v.number(),
      createdAt: v.number(),
    })
      .index("by_server", ["serverId"])
      .index("by_server_position", ["serverId", "position"]),

    channels: defineTable({
      serverId: v.id("servers"),
      categoryId: v.optional(v.id("categories")),
      name: v.string(),
      topic: v.optional(v.string()),
      position: v.number(),
      /** Seconds users must wait between messages. 0 disables slow mode. */
      slowMode: v.optional(v.number()),
      /** Read-only channel: only members with manage_messages may post. */
      readOnly: v.optional(v.boolean()),
      /** `text` (default) or `voice` — voice channels host live audio rooms. */
      kind: v.optional(
        v.union(v.literal("text"), v.literal("voice"), v.literal("forum")),
      ),
      /** Per-role permission overrides scoped to this channel. */
      permissionOverwrites: v.optional(
        v.array(
          v.object({
            roleId: v.id("serverRoles"),
            allow: v.array(v.string()),
            deny: v.array(v.string()),
          }),
        ),
      ),
      lastMessageAt: v.optional(v.number()),
      lastMessageSenderId: v.optional(v.id("users")),
      createdAt: v.number(),
      createdById: v.optional(v.id("users")),
    })
      .index("by_server", ["serverId"])
      .index("by_category", ["categoryId"])
      .index("by_server_position", ["serverId", "position"]),

    /** Static or animated custom emoji uploaded by a community. */
    serverEmojis: defineTable({
      serverId: v.id("servers"),
      name: v.string(),
      storageId: v.id("_storage"),
      animated: v.boolean(),
      createdById: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_server", ["serverId"])
      .index("by_server_name", ["serverId", "name"]),

    /** One row per message in a channel *or* a direct-message conversation. */
    messages: defineTable({
      containerType: v.union(v.literal("channel"), v.literal("conversation")),
      containerId: v.string(),
      authorId: v.id("users"),
      content: v.string(),
      createdAt: v.number(),
      editedAt: v.optional(v.number()),
      replyToId: v.optional(v.id("messages")),
      pinnedAt: v.optional(v.number()),
      pinnedById: v.optional(v.id("users")),
      clientId: v.optional(v.string()),
      attachments: v.optional(
        v.array(
          v.object({
            storageId: v.id("_storage"),
            name: v.string(),
            size: v.number(),
            mimeType: v.string(),
          }),
        ),
      ),
      /** Call messages: `call_missed`, `call_outgoing` or `call_incoming`. */
      kind: v.optional(v.string()),
      /** Duration of the call this message records, in milliseconds. */
      callDurationMs: v.optional(v.number()),
    })
      .index("by_container", ["containerId", "createdAt"])
      .index("by_container_client", ["containerId", "clientId"])
      .index("by_author", ["authorId"])
      .searchIndex("search_content", {
        searchField: "content",
        filterFields: ["containerType"],
      }),

    /** A focused conversation branching from one channel or DM message. */
    threads: defineTable({
      parentMessageId: v.id("messages"),
      sourceType: v.union(v.literal("channel"), v.literal("conversation")),
      sourceId: v.string(),
      title: v.string(),
      createdById: v.id("users"),
      createdAt: v.number(),
      lastMessageAt: v.number(),
      replyCount: v.number(),
      locked: v.optional(v.boolean()),
    })
      .index("by_parent", ["parentMessageId"])
      .index("by_source", ["sourceId", "lastMessageAt"]),

    threadMessages: defineTable({
      threadId: v.id("threads"),
      authorId: v.id("users"),
      content: v.string(),
      createdAt: v.number(),
      editedAt: v.optional(v.number()),
    })
      .index("by_thread", ["threadId", "createdAt"])
      .index("by_author", ["authorId"]),

    /** Long-form tagged posts inside a forum channel. */
    forumPosts: defineTable({
      channelId: v.id("channels"),
      serverId: v.id("servers"),
      authorId: v.id("users"),
      title: v.string(),
      content: v.string(),
      tags: v.array(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastCommentAt: v.number(),
      commentCount: v.number(),
      locked: v.optional(v.boolean()),
      pinned: v.optional(v.boolean()),
    })
      .index("by_channel", ["channelId", "lastCommentAt"])
      .index("by_author", ["authorId"])
      .searchIndex("search_forum_posts", {
        searchField: "title",
        filterFields: ["channelId"],
      }),

    forumComments: defineTable({
      postId: v.id("forumPosts"),
      authorId: v.id("users"),
      content: v.string(),
      createdAt: v.number(),
      editedAt: v.optional(v.number()),
    })
      .index("by_post", ["postId", "createdAt"])
      .index("by_author", ["authorId"]),

    polls: defineTable({
      messageId: v.id("messages"),
      createdById: v.id("users"),
      question: v.string(),
      options: v.array(v.object({ id: v.string(), text: v.string() })),
      multiple: v.boolean(),
      createdAt: v.number(),
      closesAt: v.optional(v.number()),
      closedAt: v.optional(v.number()),
    }).index("by_message", ["messageId"]),

    pollVotes: defineTable({
      pollId: v.id("polls"),
      userId: v.id("users"),
      optionIds: v.array(v.string()),
      updatedAt: v.number(),
    })
      .index("by_poll", ["pollId"])
      .index("by_poll_user", ["pollId", "userId"]),

    /**
     * Ownership and lifecycle metadata for every object-storage upload.
     * Storage ids are capabilities, so application code must never accept one
     * unless this table proves who uploaded it and what record claimed it.
     */
    uploads: defineTable({
      storageId: v.id("_storage"),
      ownerId: v.id("users"),
      name: v.string(),
      size: v.number(),
      mimeType: v.string(),
      createdAt: v.number(),
      claimType: v.optional(
        v.union(
          v.literal("message"),
          v.literal("user_avatar"),
          v.literal("user_banner"),
          v.literal("server_icon"),
          v.literal("server_banner"),
          v.literal("server_emoji"),
        ),
      ),
      /** String form of the message, user, or server id that owns the claim. */
      claimId: v.optional(v.string()),
    })
      .index("by_storage", ["storageId"])
      .index("by_owner", ["ownerId"])
      .index("by_claim", ["claimType", "claimId"]),

    reactions: defineTable({
      messageId: v.id("messages"),
      userId: v.id("users"),
      emoji: v.string(),
      createdAt: v.number(),
    })
      .index("by_message", ["messageId"])
      .index("by_message_user", ["messageId", "userId"]),

    /** Read cursor per user per channel or conversation (`key` is either id). */
    reads: defineTable({
      userId: v.id("users"),
      key: v.string(),
      lastReadAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user_key", ["userId", "key"])
      .index("by_user", ["userId"])
      .index("by_key", ["key"]),

    invites: defineTable({
      code: v.string(),
      serverId: v.id("servers"),
      creatorId: v.id("users"),
      createdAt: v.number(),
      expiresAt: v.optional(v.number()),
      maxUses: v.optional(v.number()),
      uses: v.number(),
      revoked: v.optional(v.boolean()),
    })
      .index("by_code", ["code"])
      .index("by_server", ["serverId"]),

    bans: defineTable({
      serverId: v.id("servers"),
      userId: v.id("users"),
      reason: v.optional(v.string()),
      bannedBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_server_user", ["serverId", "userId"])
      .index("by_server", ["serverId"]),

    auditLogs: defineTable({
      serverId: v.id("servers"),
      actorId: v.id("users"),
      action: v.string(),
      targetType: v.optional(v.string()),
      targetId: v.optional(v.string()),
      details: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_server", ["serverId", "createdAt"]),

    /**
     * Platform-wide bans issued from the Admin Portal. A ban blocks every
     * write action on Kyro (messages, servers, friend requests) until it is
     * lifted or its expiry passes.
     */
    siteBans: defineTable({
      userId: v.id("users"),
      bannedById: v.id("users"),
      reason: v.string(),
      createdAt: v.number(),
      /** 0/undefined = permanent. */
      expiresAt: v.optional(v.number()),
      liftedAt: v.optional(v.number()),
      liftedById: v.optional(v.id("users")),
      liftReason: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_created", ["createdAt"]),

    /** Audit trail for every staff action taken in the Admin Portal. */
    adminActions: defineTable({
      actorId: v.id("users"),
      action: v.string(),
      targetType: v.optional(v.string()),
      targetId: v.optional(v.string()),
      details: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_created", ["createdAt"])
      .index("by_actor", ["actorId"]),

    notifications: defineTable({
      userId: v.id("users"),
      type: v.union(
        v.literal("friend_request"),
        v.literal("friend_accept"),
        v.literal("mention"),
        v.literal("reply"),
        v.literal("moderation"),
        v.literal("system"),
      ),
      title: v.string(),
      body: v.optional(v.string()),
      actorId: v.optional(v.id("users")),
      /** Client route to open, e.g. `/dashboard/s/<server>/c/<channel>`. */
      link: v.optional(v.string()),
      /** Channel/conversation key so opening it can clear the badge. */
      containerKey: v.optional(v.string()),
      read: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId", "createdAt"])
      .index("by_user_unread", ["userId", "read"])
      .index("by_container", ["containerKey"])
      .index("by_actor", ["actorId"]),

    reports: defineTable({
      reporterId: v.id("users"),
      reportedUserId: v.optional(v.id("users")),
      messageId: v.optional(v.id("messages")),
      serverId: v.optional(v.id("servers")),
      reason: v.string(),
      details: v.optional(v.string()),
      status: v.union(
        v.literal("open"),
        v.literal("reviewing"),
        v.literal("resolved"),
        v.literal("dismissed"),
      ),
      resolution: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_reported", ["reportedUserId"])
      .index("by_reporter", ["reporterId"])
      .index("by_server", ["serverId"])
      .index("by_message", ["messageId"]),

    /** Ephemeral typing rows; expire a few seconds after the last keystroke. */
    typing: defineTable({
      key: v.string(),
      userId: v.id("users"),
      expiresAt: v.number(),
    })
      .index("by_key", ["key"])
      .index("by_expires", ["expiresAt"]),

    /** Staff warnings against an account; they expire after 3 days. */
    warnings: defineTable({
      userId: v.id("users"),
      issuedById: v.id("users"),
      reason: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_expiry", ["userId", "expiresAt"]),

    /**
     * One-shot codes for "forgot password": requested from the auth screen,
     * delivered by email, single use, and burned after too many wrong tries.
     */
    passwordResetCodes: defineTable({
      /** Lowercased address the code was mailed to. */
      email: v.string(),
      /** SHA-256 of a deployment-peppered email/code tuple. */
      codeHash: v.string(),
      attempts: v.number(),
      expiresAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_email", ["email"])
      .index("by_expiry", ["expiresAt"]),

    /** One-hour request history; kept separately so replacing a code does not
     * accidentally reset the hourly email throttle. */
    passwordResetRequests: defineTable({
      email: v.string(),
      createdAt: v.number(),
    })
      .index("by_email", ["email", "createdAt"])
      .index("by_created", ["createdAt"]),

    /** Bug reports filed from Settings → My Account → Bug hunting. */
    bugReports: defineTable({
      reporterId: v.id("users"),
      title: v.string(),
      details: v.optional(v.string()),
      /** What kind of bug it is, so staff can triage at a glance. */
      category: v.optional(v.string()),
      status: v.union(
        v.literal("open"),
        v.literal("acknowledged"),
        v.literal("fixed"),
        v.literal("not_a_bug"),
      ),
      staffNote: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_reporter", ["reporterId"])
      .index("by_status", ["status"]),

    /** Live audio: one row per member currently sitting in a voice room. */
    voiceSessions: defineTable({
      containerType: v.union(v.literal("channel"), v.literal("conversation")),
      containerId: v.string(),
      userId: v.id("users"),
      joinedAt: v.number(),
      /** Refreshed by the client so stale sessions drop off the roster. */
      lastSeenAt: v.number(),
      muted: v.optional(v.boolean()),
      deafened: v.optional(v.boolean()),
      /** True while this member is broadcasting their screen into the room. */
      sharing: v.optional(v.boolean()),
    })
      .index("by_container", ["containerType", "containerId"])
      .index("by_user", ["userId"]),

    /** WebRTC signaling relayed through Convex — one peer is one user id. */
    voiceSignals: defineTable({
      containerKey: v.string(),
      fromId: v.id("users"),
      toId: v.id("users"),
      kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
      /** JSON-encoded RTCSessionDescriptionInit / RTCIceCandidateInit. */
      payload: v.string(),
      createdAt: v.number(),
    })
      .index("by_to_container", ["toId", "containerKey"])
      .index("by_container", ["containerKey"]),

    channelNotificationSettings: defineTable({
      userId: v.id("users"),
      channelId: v.id("channels"),
      level: v.union(
        v.literal("all"),
        v.literal("mentions"),
        v.literal("none"),
      ),
      updatedAt: v.number(),
    })
      .index("by_user_channel", ["userId", "channelId"])
      .index("by_channel_level", ["channelId", "level"]),

    /** DM voice calls — powers missed-call badges in the conversation list. */
    calls: defineTable({
      conversationId: v.id("conversations"),
      callerId: v.id("users"),
      calleeIds: v.array(v.id("users")),
      startedAt: v.number(),
      answeredAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      /** True when nobody picked up before it was abandoned. */
      missed: v.optional(v.boolean()),
    })
      .index("by_conversation", ["conversationId"])
      .index("by_started", ["startedAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
