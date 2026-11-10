import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query, type MutationCtx } from "./functions";
import type { Id } from "./_generated/dataModel";
import {
  ALL_PERMISSIONS,
  CHANNEL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  PERMISSIONS,
} from "../lib/permissions";
import {
  can,
  logAudit,
  requireProfile,
  requireServerAccess,
  requireUser,
} from "./lib";

type TemplateLink = { label: string; url: string };
type TemplateAutomod = {
  enabled: boolean;
  blockedWords: string[];
  blockInvites: boolean;
  blockLinks: boolean;
  maxMentions: number;
  blockCaps: boolean;
  blockSpam: boolean;
  exemptRoleKeys: string[];
  exemptChannelKeys: string[];
};

type TemplateRole = {
  key: string;
  name: string;
  color?: string | null;
  permissions: string[];
  isDefault?: boolean;
  hoist?: boolean;
  mentionable?: boolean;
};
type TemplateCategory = { key: string; name: string; position?: number };
type TemplateChannel = {
  key: string;
  categoryKey?: string | null;
  name: string;
  topic?: string | null;
  kind?: "text" | "voice" | "forum";
  position?: number;
  slowMode?: number;
  readOnly?: boolean;
  permissionOverwrites?: {
    roleKey: string | null;
    allow: string[];
    deny: string[];
  }[];
};
type TemplateSnapshot = {
  format: "kyro-community-template" | "kyro-community-configuration";
  version: number;
  community: {
    name: string;
    description?: string | null;
    rules?: string | null;
    welcomeMessage?: string | null;
    isPublic?: boolean;
    tags?: string[];
    tag?: string | null;
    links?: TemplateLink[];
    verificationLevel?: "none" | "low" | "medium" | "high";
    minAccountAgeMs?: number;
    applyToJoin?: boolean;
    applicationQuestions?: string[];
    themeAccent?: string | null;
    themeTint?: string | null;
    rulesChannelKey?: string | null;
  };
  roles: TemplateRole[];
  categories: TemplateCategory[];
  channels: TemplateChannel[];
  automod?: TemplateAutomod | null;
};

const MOD_PERMISSIONS = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.MANAGE_MESSAGES,
  PERMISSIONS.KICK_MEMBERS,
  PERMISSIONS.MENTION_EVERYONE,
];

function builtIn(
  id: string,
  name: string,
  description: string,
  categories: {
    name: string;
    channels: {
      name: string;
      kind?: "text" | "voice" | "forum";
      topic?: string;
      readOnly?: boolean;
    }[];
  }[],
) {
  const snapshot: TemplateSnapshot = {
    format: "kyro-community-template",
    version: 1,
    community: { name, description, isPublic: true },
    roles: [
      {
        key: "role:everyone",
        name: "@everyone",
        permissions: [...DEFAULT_EVERYONE_PERMISSIONS],
        isDefault: true,
      },
      {
        key: "role:moderator",
        name: "Moderator",
        color: "#5865f2",
        permissions: MOD_PERMISSIONS,
      },
    ],
    categories: categories.map((category, index) => ({
      key: `category:${index}`,
      name: category.name,
      position: index,
    })),
    channels: categories.flatMap((category, categoryIndex) =>
      category.channels.map((channel, channelIndex) => ({
        key: `channel:${categoryIndex}:${channelIndex}`,
        categoryKey: `category:${categoryIndex}`,
        name: channel.name,
        topic: channel.topic ?? null,
        kind: channel.kind ?? "text",
        position: channelIndex,
        readOnly: channel.readOnly ?? false,
      })),
    ),
  };
  return { id: `builtin:${id}`, name, description, snapshot };
}

const BUILT_INS = [
  builtIn(
    "community",
    "Community Hub",
    "A welcoming general-purpose community.",
    [
      {
        name: "Start here",
        channels: [
          { name: "welcome", readOnly: true, topic: "Welcome new members" },
          { name: "rules", readOnly: true, topic: "Community rules" },
          { name: "announcements", readOnly: true },
        ],
      },
      {
        name: "Community",
        channels: [
          { name: "general" },
          { name: "introductions" },
          { name: "media" },
          { name: "General voice", kind: "voice" },
        ],
      },
    ],
  ),
  builtIn("gaming", "Gaming Squad", "LFG, clips, game chat and voice rooms.", [
    {
      name: "Info",
      channels: [
        { name: "announcements", readOnly: true },
        { name: "rules", readOnly: true },
      ],
    },
    {
      name: "Squad",
      channels: [
        { name: "general" },
        { name: "looking-for-group" },
        { name: "clips-and-highlights" },
        { name: "Lobby", kind: "voice" },
        { name: "Competitive", kind: "voice" },
      ],
    },
  ]),
  builtIn(
    "creator",
    "Creator Community",
    "Content planning, feedback and fan discussion.",
    [
      {
        name: "Creator updates",
        channels: [
          { name: "announcements", readOnly: true },
          { name: "new-content", readOnly: true },
        ],
      },
      {
        name: "Community",
        channels: [
          { name: "general" },
          { name: "suggestions" },
          { name: "fan-creations" },
          { name: "Hangout", kind: "voice" },
        ],
      },
    ],
  ),
  builtIn(
    "study",
    "Study Group",
    "Subjects, resources and quiet study rooms.",
    [
      {
        name: "Information",
        channels: [
          { name: "announcements", readOnly: true },
          { name: "resources" },
        ],
      },
      {
        name: "Study",
        channels: [
          { name: "general" },
          { name: "homework-help", kind: "forum" },
          { name: "Study room", kind: "voice" },
          { name: "Silent room", kind: "voice" },
        ],
      },
    ],
  ),
] as const;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  return Array.isArray(value)
    ? value
        .flatMap((entry) => {
          const text = textValue(entry, maxLength);
          return text ? [text] : [];
        })
        .slice(0, maxItems)
    : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function discordRolePermissions(value: unknown, isDefault: boolean) {
  let bits: bigint;
  try {
    bits = BigInt(typeof value === "string" ? value : 0);
  } catch {
    return isDefault ? [...DEFAULT_EVERYONE_PERMISSIONS] : [];
  }
  const permissions = new Set<string>();
  const add = (bit: bigint, permission: string) => {
    if ((bits & bit) !== 0n) permissions.add(permission);
  };
  if ((bits & 8n) !== 0n) return [...ALL_PERMISSIONS];
  add(1n, PERMISSIONS.CREATE_INVITES);
  add(2n, PERMISSIONS.KICK_MEMBERS);
  add(4n, PERMISSIONS.BAN_MEMBERS);
  add(16n, PERMISSIONS.MANAGE_CHANNELS);
  add(32n, PERMISSIONS.MANAGE_SERVER);
  add(128n, PERMISSIONS.VIEW_AUDIT_LOG);
  if ((bits & 512n) !== 0n) {
    permissions.add(PERMISSIONS.VIDEO);
    permissions.add(PERMISSIONS.SHARE_SCREEN);
  }
  add(1_024n, PERMISSIONS.VIEW_CHANNEL);
  add(2_048n, PERMISSIONS.SEND_MESSAGES);
  add(8_192n, PERMISSIONS.MANAGE_MESSAGES);
  add(131_072n, PERMISSIONS.MENTION_EVERYONE);
  add(1_048_576n, PERMISSIONS.CONNECT_VOICE);
  add(2_097_152n, PERMISSIONS.SPEAK_VOICE);
  if ((bits & (4_194_304n | 8_388_608n | 16_777_216n)) !== 0n) {
    permissions.add(PERMISSIONS.MANAGE_VOICE);
  }
  add(268_435_456n, PERMISSIONS.MANAGE_ROLES);
  add(1_073_741_824n, PERMISSIONS.MANAGE_EMOJIS);
  return Array.from(permissions);
}

function parseSnapshot(value: string): TemplateSnapshot {
  if (value.length > 250_000)
    throw new Error("That template file is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const candidate = objectValue(parsed);
  if (
    !candidate ||
    (candidate.format !== "kyro-community-template" &&
      candidate.format !== "kyro-community-configuration") ||
    candidate.version !== 1 ||
    !Array.isArray(candidate.channels) ||
    !Array.isArray(candidate.categories) ||
    !Array.isArray(candidate.roles)
  ) {
    throw new Error("This is not a Kyro community template or configuration.");
  }
  const community = objectValue(candidate.community);
  const communityName = textValue(community?.name, 64);
  if (!community || !communityName) {
    throw new Error("The template is missing a community name.");
  }
  const verification = community.verificationLevel;
  const automodValue = objectValue(candidate.automod);
  const links = Array.isArray(community.links)
    ? community.links
        .flatMap((entry) => {
          const link = objectValue(entry);
          const label = textValue(link?.label, 32);
          const url = textValue(link?.url, 200);
          return label && url ? [{ label, url }] : [];
        })
        .slice(0, 5)
    : [];
  const roles = candidate.roles.slice(0, 50).flatMap((entry, index) => {
    const role = objectValue(entry);
    if (!role) return [];
    return [
      {
        key: textValue(role.key, 160) ?? `role:${index}`,
        name: textValue(role.name, 64) ?? `Role ${index + 1}`,
        color: textValue(role.color, 16) ?? null,
        permissions: stringList(role.permissions, ALL_PERMISSIONS.length, 64),
        isDefault: role.isDefault === true,
        hoist: role.hoist === true,
        mentionable: role.mentionable === true,
      },
    ];
  });
  const categories = candidate.categories
    .slice(0, 50)
    .flatMap((entry, index) => {
      const category = objectValue(entry);
      if (!category) return [];
      return [
        {
          key: textValue(category.key, 160) ?? `category:${index}`,
          name: textValue(category.name, 64) ?? `Category ${index + 1}`,
          position: numberValue(category.position),
        },
      ];
    });
  const channels = candidate.channels.slice(0, 100).flatMap((entry, index) => {
    const channel = objectValue(entry);
    if (!channel) return [];
    const kind = channel.kind;
    const normalizedKind: TemplateChannel["kind"] =
      kind === "voice" || kind === "forum" || kind === "text" ? kind : "text";
    const overwrites = Array.isArray(channel.permissionOverwrites)
      ? channel.permissionOverwrites
          .flatMap((overwriteEntry) => {
            const overwrite = objectValue(overwriteEntry);
            if (!overwrite) return [];
            const roleKey = textValue(overwrite.roleKey, 160) ?? null;
            return [
              {
                roleKey,
                allow: stringList(overwrite.allow, ALL_PERMISSIONS.length, 64),
                deny: stringList(overwrite.deny, ALL_PERMISSIONS.length, 64),
              },
            ];
          })
          .slice(0, 50)
      : [];
    return [
      {
        key: textValue(channel.key, 160) ?? `channel:${index}`,
        categoryKey: textValue(channel.categoryKey, 160) ?? null,
        name: textValue(channel.name, 64) ?? `channel-${index + 1}`,
        topic: textValue(channel.topic, 300) ?? null,
        kind: normalizedKind,
        position: numberValue(channel.position),
        slowMode: numberValue(channel.slowMode),
        readOnly: channel.readOnly === true,
        permissionOverwrites: overwrites,
      },
    ];
  });
  return {
    format: candidate.format,
    version: 1,
    community: {
      name: communityName,
      description: textValue(community.description, 400) ?? null,
      rules: textValue(community.rules, 2000) ?? null,
      welcomeMessage: textValue(community.welcomeMessage, 500) ?? null,
      isPublic:
        typeof community.isPublic === "boolean"
          ? community.isPublic
          : undefined,
      tags: stringList(community.tags, 5, 24),
      tag: textValue(community.tag, 4) ?? null,
      links,
      verificationLevel:
        verification === "low" ||
        verification === "medium" ||
        verification === "high"
          ? verification
          : "none",
      minAccountAgeMs: numberValue(community.minAccountAgeMs),
      applyToJoin: community.applyToJoin === true,
      applicationQuestions: stringList(community.applicationQuestions, 5, 200),
      themeAccent: textValue(community.themeAccent, 16) ?? null,
      themeTint: textValue(community.themeTint, 16) ?? null,
      rulesChannelKey: textValue(community.rulesChannelKey, 160) ?? null,
    },
    roles,
    categories,
    channels,
    automod: automodValue
      ? {
          enabled: automodValue.enabled !== false,
          blockedWords: stringList(automodValue.blockedWords, 100, 40),
          blockInvites: automodValue.blockInvites !== false,
          blockLinks: automodValue.blockLinks === true,
          maxMentions: numberValue(automodValue.maxMentions) ?? 10,
          blockCaps: automodValue.blockCaps !== false,
          blockSpam: automodValue.blockSpam !== false,
          exemptRoleKeys: stringList(automodValue.exemptRoleKeys, 25, 160),
          exemptChannelKeys: stringList(
            automodValue.exemptChannelKeys,
            50,
            160,
          ),
        }
      : null,
  };
}

function cleanChannelName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "channel"
  );
}

async function instantiate(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  snapshot: TemplateSnapshot,
  nameOverride?: string,
  publicOverride?: boolean,
  source: "template" | "configuration" = "template",
) {
  const name = (nameOverride?.trim() || snapshot.community.name.trim()).slice(
    0,
    64,
  );
  if (name.length < 2) throw new Error("Community names are 2–64 characters.");
  const tags = Array.from(
    new Set(
      (snapshot.community.tags ?? [])
        .map((tag) => tag.trim().toLowerCase().slice(0, 24))
        .filter((tag) => /^[a-z0-9][a-z0-9 &+-]*$/.test(tag)),
    ),
  ).slice(0, 5);
  const tagValue = snapshot.community.tag?.trim().toUpperCase().slice(0, 4);
  const tag =
    tagValue && /^[A-Z0-9]{2,4}$/.test(tagValue) ? tagValue : undefined;
  const links = (snapshot.community.links ?? [])
    .map((link) => ({
      label: link.label.trim().slice(0, 32),
      url: link.url.trim().slice(0, 200),
    }))
    .filter(
      (link) =>
        link.label.length > 0 &&
        link.url.length > 0 &&
        /^https?:\/\//i.test(link.url),
    )
    .slice(0, 5);
  const verification = snapshot.community.verificationLevel ?? "none";
  const minAccountAgeMs = [0, 86_400_000, 604_800_000].includes(
    Math.floor(snapshot.community.minAccountAgeMs ?? 0),
  )
    ? Math.floor(snapshot.community.minAccountAgeMs ?? 0)
    : 0;
  const hexColour = /^#[0-9a-f]{6}$/i;
  const themeAccent = hexColour.test(snapshot.community.themeAccent ?? "")
    ? snapshot.community.themeAccent!
    : undefined;
  const themeTint = hexColour.test(snapshot.community.themeTint ?? "")
    ? snapshot.community.themeTint!
    : undefined;
  const now = Date.now();
  const serverId = await ctx.db.insert("servers", {
    name,
    description:
      snapshot.community.description?.trim().slice(0, 400) || undefined,
    rules: snapshot.community.rules?.trim().slice(0, 2000) || undefined,
    welcomeMessage:
      snapshot.community.welcomeMessage?.trim().slice(0, 500) || undefined,
    ownerId,
    isPublic: publicOverride ?? snapshot.community.isPublic ?? true,
    tags,
    tag,
    links: links.length > 0 ? links : undefined,
    verificationLevel: verification,
    minAccountAgeMs: minAccountAgeMs || undefined,
    applyToJoin: snapshot.community.applyToJoin || undefined,
    applicationQuestions: (snapshot.community.applicationQuestions ?? [])
      .map((question) => question.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 5),
    themeAccent,
    themeTint,
    createdAt: now,
  });
  await ctx.db.insert("serverMembers", {
    serverId,
    userId: ownerId,
    roleIds: [],
    joinedAt: now,
  });

  const allowed = new Set<string>(ALL_PERMISSIONS);
  const safeEveryone = new Set<string>(DEFAULT_EVERYONE_PERMISSIONS);
  const allowedChannel = new Set<string>(CHANNEL_PERMISSIONS);
  const roleIds = new Map<string, Id<"serverRoles">>();
  const roles = snapshot.roles.slice(0, 50);
  const defaultRole = roles.find(
    (role) => role.isDefault || role.name === "@everyone",
  );
  const defaultId = await ctx.db.insert("serverRoles", {
    serverId,
    name: "@everyone",
    position: 0,
    permissions: (
      defaultRole?.permissions ?? DEFAULT_EVERYONE_PERMISSIONS
    ).filter((permission) => safeEveryone.has(permission)),
    isDefault: true,
  });
  if (defaultRole) roleIds.set(defaultRole.key, defaultId);
  for (const [index, role] of roles
    .filter((entry) => entry !== defaultRole)
    .entries()) {
    const roleId = await ctx.db.insert("serverRoles", {
      serverId,
      name: role.name.trim().slice(0, 64) || `Role ${index + 1}`,
      color: /^#[0-9a-f]{6}$/i.test(role.color ?? "") ? role.color! : undefined,
      position: index + 1,
      permissions: role.permissions.filter(
        (permission) =>
          allowed.has(permission) && permission !== PERMISSIONS.ADMINISTRATOR,
      ),
      isDefault: false,
      hoist: role.hoist === true || undefined,
      mentionable: role.mentionable === true || undefined,
    });
    roleIds.set(role.key, roleId);
  }

  const categoryIds = new Map<string, Id<"categories">>();
  for (const [index, category] of snapshot.categories.slice(0, 50).entries()) {
    const categoryId = await ctx.db.insert("categories", {
      serverId,
      name: category.name.trim().slice(0, 64) || `Category ${index + 1}`,
      position: index,
      createdAt: now,
    });
    categoryIds.set(category.key, categoryId);
  }

  const channelIds = new Map<string, Id<"channels">>();
  for (const [index, channel] of snapshot.channels.slice(0, 100).entries()) {
    const permissionOverwrites = (channel.permissionOverwrites ?? []).flatMap(
      (overwrite) => {
        const roleId = overwrite.roleKey
          ? roleIds.get(overwrite.roleKey)
          : undefined;
        if (!roleId) return [];
        return [
          {
            roleId,
            allow: overwrite.allow.filter((permission) =>
              allowedChannel.has(permission),
            ),
            deny: overwrite.deny.filter((permission) =>
              allowedChannel.has(permission),
            ),
          },
        ];
      },
    );
    const channelId = await ctx.db.insert("channels", {
      serverId,
      categoryId: channel.categoryKey
        ? categoryIds.get(channel.categoryKey)
        : undefined,
      name: cleanChannelName(channel.name),
      topic: channel.topic?.trim().slice(0, 300) || undefined,
      kind:
        channel.kind === "voice" || channel.kind === "forum"
          ? channel.kind
          : undefined,
      position: Number.isFinite(channel.position)
        ? Math.max(0, Math.floor(channel.position!))
        : index,
      slowMode: Math.max(0, Math.min(Math.floor(channel.slowMode ?? 0), 21600)),
      readOnly: channel.readOnly === true || undefined,
      permissionOverwrites:
        permissionOverwrites.length > 0 ? permissionOverwrites : undefined,
      createdAt: now,
      createdById: ownerId,
    });
    channelIds.set(channel.key, channelId);
  }
  if (snapshot.channels.length === 0) {
    await ctx.db.insert("channels", {
      serverId,
      name: "general",
      topic: "Talk about anything with the community",
      position: 0,
      createdAt: now,
      createdById: ownerId,
    });
  }
  const rulesChannelId = snapshot.community.rulesChannelKey
    ? channelIds.get(snapshot.community.rulesChannelKey)
    : undefined;
  if (rulesChannelId) await ctx.db.patch(serverId, { rulesChannelId });
  if (snapshot.automod) {
    await ctx.db.insert("serverAutomod", {
      serverId,
      enabled: snapshot.automod.enabled,
      blockedWords: Array.from(
        new Set(
          snapshot.automod.blockedWords
            .map((word) => word.trim().toLowerCase().slice(0, 40))
            .filter(Boolean),
        ),
      ).slice(0, 100),
      blockInvites: snapshot.automod.blockInvites,
      blockLinks: snapshot.automod.blockLinks,
      maxMentions: Math.max(
        0,
        Math.min(Math.floor(snapshot.automod.maxMentions), 50),
      ),
      blockCaps: snapshot.automod.blockCaps,
      blockSpam: snapshot.automod.blockSpam,
      exemptRoleIds: snapshot.automod.exemptRoleKeys
        .flatMap((key) => {
          const roleId = roleIds.get(key);
          return roleId ? [roleId] : [];
        })
        .slice(0, 25),
      exemptChannelIds: snapshot.automod.exemptChannelKeys
        .flatMap((key) => {
          const channelId = channelIds.get(key);
          return channelId ? [channelId] : [];
        })
        .slice(0, 50),
      updatedAt: now,
      updatedById: ownerId,
    });
  }
  await logAudit(ctx, {
    serverId,
    actorId: ownerId,
    action:
      source === "configuration"
        ? "server.import_configuration"
        : "server.create_from_template",
    targetType: "server",
    targetId: serverId,
    details:
      source === "configuration"
        ? `Imported ${name} from a Kyro configuration`
        : `Created ${name} from a community template`,
  });
  return serverId;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const [published, mine] = await Promise.all([
      ctx.db
        .query("serverTemplates")
        .withIndex("by_public", (q) => q.eq("isPublic", true))
        .order("desc")
        .take(50),
      ctx.db
        .query("serverTemplates")
        .withIndex("by_creator", (q) => q.eq("creatorId", id))
        .order("desc")
        .take(20),
    ]);
    const rows = [
      ...published,
      ...mine.filter(
        (entry) => !published.some((row) => row._id === entry._id),
      ),
    ];
    const creators = await Promise.all(
      Array.from(new Set(rows.map((row) => row.creatorId))).map((creatorId) =>
        ctx.db.get(creatorId),
      ),
    );
    const creatorNames = new Map(
      creators.flatMap((user) =>
        user
          ? [[user._id, user.name ?? user.username ?? "Kyro member"] as const]
          : [],
      ),
    );
    return [
      ...BUILT_INS.map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        creatorName: "Kyro",
        builtIn: true,
        uses: 0,
        mine: false,
        channelCount: entry.snapshot.channels.length,
      })),
      ...rows.map((row) => {
        const snapshot = parseSnapshot(row.snapshotJson);
        return {
          id: row._id as string,
          name: row.name,
          description: row.description,
          creatorName: creatorNames.get(row.creatorId) ?? "Kyro member",
          builtIn: false,
          uses: row.uses,
          mine: row.creatorId === id,
          channelCount: snapshot.channels.length,
        };
      }),
    ];
  },
});

export const publish = mutation({
  args: {
    serverId: v.id("servers"),
    name: v.string(),
    description: v.string(),
    isPublic: v.boolean(),
    snapshotJson: v.string(),
  },
  handler: async (ctx, args) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, args.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_SERVER)) {
      throw new Error("You don't have permission to publish this layout.");
    }
    const snapshot = parseSnapshot(args.snapshotJson);
    const mine = await ctx.db
      .query("serverTemplates")
      .withIndex("by_creator", (q) => q.eq("creatorId", id))
      .collect();
    if (mine.length >= 20)
      throw new Error("You can publish up to 20 templates.");
    const now = Date.now();
    const templateId = await ctx.db.insert("serverTemplates", {
      creatorId: id,
      sourceServerId: args.serverId,
      name: args.name.trim().slice(0, 80) || snapshot.community.name,
      description: args.description.trim().slice(0, 300),
      snapshotJson: JSON.stringify({
        ...snapshot,
        format: "kyro-community-template",
      }),
      isPublic: args.isPublic,
      uses: 0,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, {
      serverId: args.serverId,
      actorId: id,
      action: "server.publish_template",
      targetType: "template",
      targetId: templateId,
      details: `Published ${args.name.trim().slice(0, 80) || snapshot.community.name}`,
    });
    return templateId;
  },
});

export const remove = mutation({
  args: { templateId: v.id("serverTemplates") },
  handler: async (ctx, { templateId }) => {
    const { id } = await requireUser(ctx);
    const template = await ctx.db.get(templateId);
    if (!template) return;
    if (template.creatorId !== id)
      throw new Error("Only the template creator can delete it.");
    await ctx.db.delete(templateId);
  },
});

export const createServer = mutation({
  args: {
    templateKey: v.string(),
    name: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id } = await requireProfile(ctx);
    const builtin = BUILT_INS.find((entry) => entry.id === args.templateKey);
    if (builtin)
      return await instantiate(
        ctx,
        id,
        builtin.snapshot,
        args.name,
        args.isPublic,
      );
    const templateId = ctx.db.normalizeId("serverTemplates", args.templateKey);
    if (!templateId) throw new Error("That template no longer exists.");
    const template = await ctx.db.get(templateId);
    if (!template || (!template.isPublic && template.creatorId !== id)) {
      throw new Error("That template is private or no longer exists.");
    }
    const serverId = await instantiate(
      ctx,
      id,
      parseSnapshot(template.snapshotJson),
      args.name,
      args.isPublic,
    );
    await ctx.db.patch(templateId, {
      uses: template.uses + 1,
      updatedAt: Date.now(),
    });
    return serverId;
  },
});

export const importConfiguration = mutation({
  args: {
    snapshotJson: v.string(),
    name: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id } = await requireProfile(ctx);
    return await instantiate(
      ctx,
      id,
      parseSnapshot(args.snapshotJson),
      args.name,
      args.isPublic,
      "configuration",
    );
  },
});

export const previewDiscordTemplate = action({
  args: { url: v.string() },
  handler: async (_ctx, { url }) => {
    const userId = await getAuthUserId(_ctx);
    if (!userId) throw new Error("Sign in to import a Discord template.");
    const match = url
      .trim()
      .match(
        /(?:discord\.new\/|discord(?:app)?\.com\/template\/)([a-zA-Z0-9_-]+)/i,
      );
    const code =
      match?.[1] ?? (/^[a-zA-Z0-9_-]+$/.test(url.trim()) ? url.trim() : null);
    if (!code || code.length > 128)
      throw new Error("Paste a Discord template URL or template code.");
    const response = await fetch(
      `https://discord.com/api/v10/guilds/templates/${encodeURIComponent(code)}`,
    );
    if (!response.ok)
      throw new Error("Discord could not find that public template.");
    const data = (await response.json()) as {
      name?: string;
      description?: string | null;
      serialized_source_guild?: {
        name?: string;
        description?: string | null;
        roles?: {
          id: string;
          name: string;
          color?: number;
          position?: number;
          permissions?: string;
          hoist?: boolean;
          mentionable?: boolean;
        }[];
        channels?: {
          id: string;
          type: number;
          name: string;
          position?: number;
          parent_id?: string | null;
          topic?: string | null;
          rate_limit_per_user?: number;
        }[];
      };
    };
    const guild = data.serialized_source_guild;
    if (!guild) throw new Error("Discord returned an empty template.");
    const discordCategories = (guild.channels ?? []).filter(
      (channel) => channel.type === 4,
    );
    const snapshot: TemplateSnapshot = {
      format: "kyro-community-template",
      version: 1,
      community: {
        name: guild.name ?? data.name ?? "Imported community",
        description:
          guild.description ?? data.description ?? "Imported from Discord",
        isPublic: true,
      },
      roles: [...(guild.roles ?? [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((role) => {
          const isDefault = role.name === "@everyone";
          return {
            key: `discord-role:${role.id}`,
            name: role.name,
            color: role.color
              ? `#${role.color.toString(16).padStart(6, "0")}`
              : null,
            permissions: discordRolePermissions(role.permissions, isDefault),
            isDefault,
            hoist: role.hoist === true,
            mentionable: role.mentionable === true,
          };
        }),
      categories: [...discordCategories]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((category, index) => ({
          key: `discord-category:${category.id}`,
          name: category.name,
          position: category.position ?? index,
        })),
      channels: (guild.channels ?? [])
        .filter((channel) => channel.type !== 4)
        .map((channel, index) => ({
          key: `discord-channel:${channel.id}`,
          categoryKey: channel.parent_id
            ? `discord-category:${channel.parent_id}`
            : null,
          name: channel.name,
          topic: channel.topic ?? null,
          kind:
            channel.type === 2 || channel.type === 13
              ? "voice"
              : channel.type === 15
                ? "forum"
                : "text",
          position: channel.position ?? index,
          slowMode: channel.rate_limit_per_user ?? 0,
        })),
    };
    return {
      name: snapshot.community.name,
      description: snapshot.community.description ?? null,
      categoryCount: snapshot.categories.length,
      channelCount: snapshot.channels.length,
      roleCount: snapshot.roles.length,
      snapshotJson: JSON.stringify(snapshot),
    };
  },
});
