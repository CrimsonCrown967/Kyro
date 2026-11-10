import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  can,
  getServerAccess,
  isPlatformAdmin,
  isPlatformStaff,
  isReservedUsername,
  logAudit,
  requireActiveUser,
  requireProfile,
  requireServerAccess,
  type Ctx,
} from "./lib";
import {
  ALL_PERMISSIONS,
  canDelegatePermissions,
  PERMISSIONS,
} from "../lib/permissions";
import {
  assertBotActive,
  BOT_EVENTS,
  botAudit,
  botError,
  DEFAULT_BOT_PERMISSIONS,
  requireOwnedApplication,
  validateBotPermissions,
} from "./botCore";
import { claimUpload, deleteClaimedUpload } from "./uploadSecurity";
import { emitAuditedBotEvent, emitBotEvent } from "./botEventHooks";

const CATEGORIES = [
  "general",
  "moderation",
  "music",
  "games",
  "productivity",
  "community",
  "utilities",
];
const MAX_APPLICATIONS = 25;
const MAX_INSTALLATIONS = 100;
function checkedText(value: string, label: string, max: number, min = 0) {
  const clean = value.trim();
  if (clean.length < min || clean.length > max)
    botError(
      "INVALID_REQUEST",
      `${label} must contain ${min}–${max} characters.`,
    );
  return clean;
}
async function checkedUsername(
  ctx: Ctx,
  value: string,
  currentId?: Id<"users">,
) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,32}$/.test(username) || isReservedUsername(username))
    botError(
      "INVALID_REQUEST",
      "Choose a username with 2–32 letters, numbers, or underscores.",
    );
  const existing = await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", username))
    .unique();
  if (existing && existing._id !== currentId)
    botError("INVALID_REQUEST", "That username is already in use.");
  return username;
}
async function checkedHash(ctx: Ctx, tokenHash: string) {
  if (!/^[a-f0-9]{64}$/.test(tokenHash))
    botError("INVALID_REQUEST", "A SHA-256 token hash is required.");
  if (
    await ctx.db
      .query("botApplications")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .first()
  )
    botError("INVALID_REQUEST", "Generate a new unique token.");
  return tokenHash;
}
async function liveInstallations(
  ctx: Ctx,
  applicationId: Id<"botApplications">,
  botUserId: Id<"users">,
) {
  const rows = await ctx.db
    .query("botInstallations")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  const result: typeof rows = [];
  for (const row of rows)
    if (await getServerAccess(ctx, row.serverId, botUserId)) result.push(row);
  return result;
}
/** Explicit projections: no credentials, hashes, emails, or internal documents cross this boundary. */
async function publicApplication(ctx: Ctx, app: Doc<"botApplications">) {
  const bot = await ctx.db.get(app.botUserId);
  const owner = await ctx.db.get(app.ownerId);
  return {
    id: app._id,
    botUserId: app.botUserId,
    name: app.name,
    description: app.description,
    username: bot?.username ?? "deleted_bot",
    botDescription: app.botDescription,
    iconUrl: app.iconStorageId
      ? await ctx.storage.getUrl(app.iconStorageId)
      : null,
    bannerUrl: app.bannerStorageId
      ? await ctx.storage.getUrl(app.bannerStorageId)
      : null,
    avatarUrl: bot?.avatarStorageId
      ? await ctx.storage.getUrl(bot.avatarStorageId)
      : null,
    enabled: app.enabled,
    suspended: app.suspended,
    verified: app.verified,
    featured: app.featured,
    discoverable: app.discoverable,
    category: app.category,
    defaultPermissions: app.defaultPermissions,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    installationCount: (await liveInstallations(ctx, app._id, app.botUserId))
      .length,
    owner: {
      id: app.ownerId,
      name: owner?.name ?? owner?.username ?? "Deleted user",
      username: owner?.username ?? null,
    },
    online:
      app.enabled &&
      !app.suspended &&
      (app.lastSeen ?? 0) > Date.now() - 150_000,
  };
}
async function ownerApplication(ctx: Ctx, app: Doc<"botApplications">) {
  return {
    ...(await publicApplication(ctx, app)),
    hasToken: Boolean(app.tokenHash),
    tokenVersion: app.tokenVersion,
    tokenUpdatedAt: app.tokenUpdatedAt ?? null,
    subscriptions: app.subscriptions,
    webhookUrl: app.webhookUrl ?? "",
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireActiveUser(ctx);
    const apps = await ctx.db
      .query("botApplications")
      .withIndex("by_owner", (q) => q.eq("ownerId", id))
      .collect();
    return await Promise.all(
      apps.filter((a) => !a.deletedAt).map((app) => ownerApplication(ctx, app)),
    );
  },
});
export const get = query({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const { id } = await requireActiveUser(ctx);
    const normalized = ctx.db.normalizeId("botApplications", applicationId);
    const app = normalized ? await ctx.db.get(normalized) : null;
    if (!app || app.deletedAt || app.ownerId !== id) return null;
    return await ownerApplication(ctx, app);
  },
});
export const create = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    description: v.optional(v.string()),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const { id } = await requireProfile(ctx);
    const existing = await ctx.db
      .query("botApplications")
      .withIndex("by_owner", (q) => q.eq("ownerId", id))
      .collect();
    if (existing.filter((a) => !a.deletedAt).length >= MAX_APPLICATIONS)
      botError("INVALID_REQUEST", "You can own up to 25 applications.");
    if (
      existing.filter((a) => a.createdAt > Date.now() - 86_400_000).length >= 25
    )
      botError("RATE_LIMITED", "You can create up to 25 applications per day.");
    const name = checkedText(args.name, "Application name", 80, 2);
    const description = checkedText(
      args.description ?? "",
      "Description",
      2000,
    );
    const username = await checkedUsername(ctx, args.username);
    const tokenHash = await checkedHash(ctx, args.tokenHash);
    const now = Date.now();
    const botUserId = await ctx.db.insert("users", {
      name: username,
      username,
      bio: description,
      isBot: true,
      createdAt: now,
      status: "offline",
      dmPolicy: "nobody",
      allowFriendRequests: false,
      suggestible: false,
    });
    const applicationId = await ctx.db.insert("botApplications", {
      ownerId: id,
      botUserId,
      name,
      description,
      botDescription: description,
      enabled: true,
      suspended: false,
      discoverable: false,
      verified: false,
      featured: false,
      category: "general",
      defaultPermissions: DEFAULT_BOT_PERMISSIONS,
      tokenHash,
      tokenVersion: 1,
      tokenUpdatedAt: now,
      subscriptions: ["interactionCreate", "messageCreate"],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(botUserId, { botApplicationId: applicationId });
    await botAudit(ctx, applicationId, id, "application.create");
    return applicationId;
  },
});
export const update = mutation({
  args: {
    applicationId: v.id("botApplications"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    username: v.optional(v.string()),
    botDescription: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    discoverable: v.optional(v.boolean()),
    category: v.optional(v.string()),
    defaultPermissions: v.optional(v.array(v.string())),
    subscriptions: v.optional(v.array(v.string())),
    webhookUrl: v.optional(v.string()),
    iconStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { app, ownerId } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    const patch: Partial<Doc<"botApplications">> = { updatedAt: Date.now() };
    if (args.name !== undefined)
      patch.name = checkedText(args.name, "Application name", 80, 2);
    if (args.description !== undefined)
      patch.description = checkedText(args.description, "Description", 2000);
    if (args.botDescription !== undefined) {
      patch.botDescription = checkedText(
        args.botDescription,
        "Bot description",
        2000,
      );
      await ctx.db.patch(app.botUserId, { bio: patch.botDescription });
    }
    if (args.username !== undefined) {
      const username = await checkedUsername(ctx, args.username, app.botUserId);
      await ctx.db.patch(app.botUserId, { username, name: username });
    }
    if (args.defaultPermissions !== undefined)
      patch.defaultPermissions = validateBotPermissions(
        args.defaultPermissions,
      );
    if (args.enabled !== undefined) {
      if (app.suspended && args.enabled)
        botError("FORBIDDEN", "Only Kyro staff can restore a suspended bot.");
      patch.enabled = args.enabled;
      if (!args.enabled) {
        patch.lastSeen = undefined;
        await ctx.db.patch(app.botUserId, {
          status: "offline",
          lastSeen: undefined,
        });
      }
    }
    if (args.discoverable !== undefined) patch.discoverable = args.discoverable;
    if (args.category !== undefined) {
      if (!CATEGORIES.includes(args.category))
        botError("INVALID_REQUEST", "Choose a supported category.");
      patch.category = args.category;
    }
    if (args.subscriptions !== undefined) {
      if (
        args.subscriptions.length > BOT_EVENTS.length ||
        args.subscriptions.some(
          (e) => !(BOT_EVENTS as readonly string[]).includes(e),
        )
      )
        botError("INVALID_REQUEST", "Unsupported event subscription.");
      patch.subscriptions = [...new Set(args.subscriptions)];
    }
    if (args.webhookUrl !== undefined) {
      const raw = args.webhookUrl.trim();
      if (raw) {
        let url: URL;
        try {
          url = new URL(raw);
        } catch {
          botError("INVALID_REQUEST", "Enter a public HTTPS webhook URL.");
        }
        if (
          raw.length > 2000 ||
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.hash ||
          (url.port && url.port !== "443")
        )
          botError(
            "INVALID_REQUEST",
            "Webhooks require HTTPS on port 443 without credentials or fragments.",
          );
      }
      patch.webhookUrl = raw || undefined;
    }
    for (const [field, claimType] of [
      ["iconStorageId", "application_icon"],
      ["bannerStorageId", "application_banner"],
    ] as const) {
      const storageId = args[field];
      if (storageId && storageId !== app[field]) {
        await claimUpload(ctx, ownerId, storageId, claimType, app._id, {
          imageOnly: true,
        });
        await deleteClaimedUpload(ctx, app[field], claimType, app._id);
        patch[field] = storageId;
      }
    }
    if (args.avatarStorageId) {
      const bot = await ctx.db.get(app.botUserId);
      if (bot?.avatarStorageId !== args.avatarStorageId) {
        await claimUpload(
          ctx,
          ownerId,
          args.avatarStorageId,
          "user_avatar",
          app.botUserId,
          { imageOnly: true },
        );
        await deleteClaimedUpload(
          ctx,
          bot?.avatarStorageId,
          "user_avatar",
          app.botUserId,
        );
        await ctx.db.patch(app.botUserId, {
          avatarStorageId: args.avatarStorageId,
        });
      }
    }
    await ctx.db.patch(app._id, patch);
    await botAudit(
      ctx,
      app._id,
      ownerId,
      "application.update",
      Object.keys(args)
        .filter((k) => k !== "applicationId")
        .join(", "),
    );
  },
});
export const rotateToken = mutation({
  args: { applicationId: v.id("botApplications"), tokenHash: v.string() },
  handler: async (ctx, { applicationId, tokenHash }) => {
    const { app, ownerId } = await requireOwnedApplication(ctx, applicationId);
    await checkedHash(ctx, tokenHash);
    await ctx.db.patch(applicationId, {
      tokenHash,
      tokenVersion: app.tokenVersion + 1,
      tokenUpdatedAt: Date.now(),
      updatedAt: Date.now(),
      lastSeen: undefined,
    });
    await ctx.db.patch(app.botUserId, {
      status: "offline",
      lastSeen: undefined,
    });
    await botAudit(ctx, applicationId, ownerId, "token.rotate");
  },
});

async function manager(ctx: Ctx, serverId: Id<"servers">) {
  const { id } = await requireActiveUser(ctx);
  const access = await requireServerAccess(ctx, serverId, id);
  if (!can(access.permissions, PERMISSIONS.MANAGE_SERVER))
    botError(
      "FORBIDDEN",
      "Manage Server is required to manage bot installations.",
    );
  return { id, access };
}
export const eligibleServers = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    const { id } = await requireActiveUser(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app) botError("NOT_FOUND", "Application not found.");
    await assertBotActive(ctx, app);
    const memberships = await ctx.db
      .query("serverMembers")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect();
    const result = [];
    for (const membership of memberships) {
      const access = await getServerAccess(ctx, membership.serverId, id);
      if (!access || !can(access.permissions, PERMISSIONS.MANAGE_SERVER))
        continue;
      const installed = await getServerAccess(
        ctx,
        access.server._id,
        app.botUserId,
      );
      result.push({
        id: access.server._id,
        name: access.server.name,
        permissions: can(access.permissions, PERMISSIONS.ADMINISTRATOR)
          ? ALL_PERMISSIONS
          : access.permissions,
        installed: Boolean(installed),
      });
    }
    return result;
  },
});
export const install = mutation({
  args: {
    applicationId: v.id("botApplications"),
    serverId: v.id("servers"),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, access } = await manager(ctx, args.serverId);
    const app = await ctx.db.get(args.applicationId);
    if (!app) botError("NOT_FOUND", "Application not found.");
    await assertBotActive(ctx, app);
    const permissions = validateBotPermissions(args.permissions);
    if (
      !canDelegatePermissions(
        access.permissions,
        permissions,
        access.server.ownerId === id,
      )
    )
      botError("FORBIDDEN", "You can only grant permissions you hold.");
    if (
      await ctx.db
        .query("bans")
        .withIndex("by_server_user", (q) =>
          q.eq("serverId", args.serverId).eq("userId", app.botUserId),
        )
        .first()
    )
      botError("FORBIDDEN", "Unban this bot before installing it.");
    const old = await ctx.db
      .query("botInstallations")
      .withIndex("by_application_server", (q) =>
        q.eq("applicationId", app._id).eq("serverId", args.serverId),
      )
      .unique();
    if (old && (await getServerAccess(ctx, args.serverId, app.botUserId)))
      botError(
        "INVALID_REQUEST",
        "This bot is already installed. Edit its permissions in server settings.",
      );
    if (old) {
      await ctx.db.delete(old._id);
      if (await ctx.db.get(old.roleId)) await ctx.db.delete(old.roleId);
    }
    if (
      (
        await ctx.db
          .query("botInstallations")
          .withIndex("by_application", (q) => q.eq("applicationId", app._id))
          .take(MAX_INSTALLATIONS)
      ).length >= MAX_INSTALLATIONS
    )
      botError(
        "INVALID_REQUEST",
        "This application has reached its 100-server installation limit.",
      );
    if (
      (
        await ctx.db
          .query("botInstallations")
          .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
          .take(100)
      ).length >= 100
    )
      botError("INVALID_REQUEST", "This server has reached its 100-bot limit.");
    const roles = await ctx.db
      .query("serverRoles")
      .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
      .collect();
    // A new bot starts immediately above @everyone, below every existing ranked role.
    const smallest = Math.min(
      1,
      ...roles
        .filter((r) => !r.isDefault && r.position > 0)
        .map((r) => r.position),
    );
    const roleId = await ctx.db.insert("serverRoles", {
      serverId: args.serverId,
      name: `${app.name.slice(0, 50)} Bot`,
      color: "#5865F2",
      position: smallest / 2,
      permissions,
      isDefault: false,
      hoist: true,
    });
    const now = Date.now();
    await ctx.db.insert("serverMembers", {
      serverId: args.serverId,
      userId: app.botUserId,
      roleIds: [roleId],
      joinedAt: now,
    });
    const installationId = await ctx.db.insert("botInstallations", {
      applicationId: app._id,
      serverId: args.serverId,
      roleId,
      permissions,
      installedById: id,
      createdAt: now,
      updatedAt: now,
    });
    await emitAuditedBotEvent(ctx, {
      serverId: args.serverId,
      action: "member.join",
      targetId: app.botUserId,
    });
    await emitBotEvent(ctx, {
      type: "serverCreate",
      serverId: args.serverId,
      applicationId: app._id,
      data: {
        id: args.serverId,
        name: access.server.name,
        description: access.server.description,
        ownerId: access.server.ownerId,
        createdAt: access.server.createdAt,
      },
    });
    await logAudit(ctx, {
      serverId: args.serverId,
      actorId: id,
      action: "bot.install",
      targetType: "bot",
      targetId: app._id,
      details: app.name,
    });
    await botAudit(ctx, app._id, id, "bot.install", args.serverId);
    return installationId;
  },
});
export const installations = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    await manager(ctx, serverId);
    const rows = await ctx.db
      .query("botInstallations")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    const result = [];
    for (const row of rows) {
      const app = await ctx.db.get(row.applicationId);
      if (
        !app ||
        app.deletedAt ||
        !(await getServerAccess(ctx, serverId, app.botUserId))
      )
        continue;
      const bot = await ctx.db.get(app.botUserId);
      result.push({
        id: row._id,
        applicationId: app._id,
        name: app.name,
        username: bot?.username ?? "bot",
        avatarUrl: bot?.avatarStorageId
          ? await ctx.storage.getUrl(bot.avatarStorageId)
          : null,
        permissions: row.permissions,
        enabled: app.enabled && !app.suspended,
      });
    }
    return result;
  },
});
export const updateInstallation = mutation({
  args: {
    installationId: v.id("botInstallations"),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.installationId);
    if (!row) botError("NOT_FOUND", "Installation not found.");
    const { id, access } = await manager(ctx, row.serverId);
    const permissions = validateBotPermissions(args.permissions);
    if (
      !canDelegatePermissions(
        access.permissions,
        permissions,
        access.server.ownerId === id,
      )
    )
      botError("FORBIDDEN", "You can only grant permissions you hold.");
    const role = await ctx.db.get(row.roleId);
    if (!role)
      botError(
        "INVALID_REQUEST",
        "The bot role was removed. Reinstall the bot.",
      );
    const roles = await ctx.db
      .query("serverRoles")
      .withIndex("by_server", (q) => q.eq("serverId", row.serverId))
      .collect();
    const top = Math.max(
      0,
      ...roles
        .filter((r) => access.member.roleIds.includes(r._id))
        .map((r) => r.position),
    );
    if (access.server.ownerId !== id && role.position >= top)
      botError(
        "FORBIDDEN",
        "You cannot change a bot role at or above your own role.",
      );
    await ctx.db.patch(row._id, { permissions, updatedAt: Date.now() });
    await ctx.db.patch(row.roleId, { permissions });
    await botAudit(
      ctx,
      row.applicationId,
      id,
      "installation.permissions",
      permissions.join(", "),
    );
    await logAudit(ctx, {
      serverId: row.serverId,
      actorId: id,
      action: "bot.permissions",
      targetId: row.applicationId,
      details: permissions.join(", "),
    });
  },
});
async function removeInstallation(
  ctx: Parameters<typeof botAudit>[0],
  row: Doc<"botInstallations">,
  botUserId: Id<"users">,
) {
  const member = await ctx.db
    .query("serverMembers")
    .withIndex("by_server_user", (q) =>
      q.eq("serverId", row.serverId).eq("userId", botUserId),
    )
    .unique();
  if (member) await ctx.db.delete(member._id);
  await emitBotEvent(ctx, {
    type: "memberLeave",
    serverId: row.serverId,
    data: { serverId: row.serverId, userId: botUserId },
  });
  // A role may have been assigned to other members; detach it before removal.
  const members = await ctx.db
    .query("serverMembers")
    .withIndex("by_server", (q) => q.eq("serverId", row.serverId))
    .collect();
  for (const other of members)
    if (other.roleIds.includes(row.roleId))
      await ctx.db.patch(other._id, {
        roleIds: other.roleIds.filter((r) => r !== row.roleId),
      });
  if (await ctx.db.get(row.roleId)) await ctx.db.delete(row.roleId);
  await ctx.db.delete(row._id);
}
export const uninstall = mutation({
  args: { installationId: v.id("botInstallations") },
  handler: async (ctx, { installationId }) => {
    const row = await ctx.db.get(installationId);
    if (!row) botError("NOT_FOUND", "Installation not found.");
    const { id } = await manager(ctx, row.serverId);
    const app = await ctx.db.get(row.applicationId);
    if (!app) botError("NOT_FOUND", "Application not found.");
    await removeInstallation(ctx, row, app.botUserId);
    await logAudit(ctx, {
      serverId: row.serverId,
      actorId: id,
      action: "bot.uninstall",
      targetType: "bot",
      targetId: app._id,
    });
    await botAudit(ctx, app._id, id, "bot.uninstall", row.serverId);
  },
});
export const remove = mutation({
  args: { applicationId: v.id("botApplications"), confirmation: v.string() },
  handler: async (ctx, { applicationId, confirmation }) => {
    const { app, ownerId } = await requireOwnedApplication(ctx, applicationId);
    if (confirmation !== app.name)
      botError(
        "INVALID_REQUEST",
        "Type the application name to confirm deletion.",
      );
    // Revoke immediately. Retain a tombstone so historical messages and audit references remain valid.
    await ctx.db.patch(app._id, {
      enabled: false,
      discoverable: false,
      tokenHash: undefined,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
      webhookUrl: undefined,
      subscriptions: [],
    });
    const rows = await ctx.db
      .query("botInstallations")
      .withIndex("by_application", (q) => q.eq("applicationId", app._id))
      .collect();
    for (const row of rows) {
      await removeInstallation(ctx, row, app.botUserId);
      await logAudit(ctx, {
        serverId: row.serverId,
        actorId: ownerId,
        action: "bot.application_delete",
        targetId: app._id,
      });
    }
    await ctx.db.patch(app.botUserId, {
      status: "offline",
      lastSeen: undefined,
      deletedAt: Date.now(),
    });
    await botAudit(ctx, applicationId, ownerId, "application.delete");
  },
});

export const getPublic = query({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const normalized = ctx.db.normalizeId("botApplications", applicationId);
    const app = normalized ? await ctx.db.get(normalized) : null;
    if (!app || app.deletedAt || app.suspended || !app.enabled) return null;
    try {
      await assertBotActive(ctx, app);
    } catch {
      return null;
    }
    return await publicApplication(ctx, app);
  },
});
export const ownedInstallations = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    const { app } = await requireOwnedApplication(ctx, applicationId);
    const rows = await liveInstallations(ctx, applicationId, app.botUserId);
    return await Promise.all(
      rows.map(async (row) => ({
        id: row.serverId,
        name: (await ctx.db.get(row.serverId))!.name,
      })),
    );
  },
});
export const directory = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    sort: v.optional(
      v.union(v.literal("popular"), v.literal("recent"), v.literal("featured")),
    ),
  },
  handler: async (ctx, args) => {
    const search = checkedText(args.search ?? "", "Search", 100);
    const rows = search
      ? await ctx.db
          .query("botApplications")
          .withSearchIndex("search_name", (q) =>
            q
              .search("name", search)
              .eq("discoverable", true)
              .eq("enabled", true),
          )
          .take(100)
      : await ctx.db
          .query("botApplications")
          .withIndex("by_directory", (q) =>
            q.eq("discoverable", true).eq("enabled", true),
          )
          .order("desc")
          .take(100);
    const result = [];
    for (const app of rows) {
      if (
        app.deletedAt ||
        app.suspended ||
        (args.category && app.category !== args.category) ||
        (args.sort === "featured" && !app.featured)
      )
        continue;
      try {
        await assertBotActive(ctx, app);
      } catch {
        continue;
      }
      result.push(await publicApplication(ctx, app));
    }
    return result.sort((a, b) =>
      args.sort === "popular"
        ? b.installationCount - a.installationCount
        : b.createdAt - a.createdAt,
    );
  },
});
export const analytics = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    const { app } = await requireOwnedApplication(ctx, applicationId);
    const installations = await liveInstallations(
      ctx,
      applicationId,
      app.botUserId,
    );
    const users = new Set<string>();
    for (const row of installations) {
      const members = await ctx.db
        .query("serverMembers")
        .withIndex("by_server", (q) => q.eq("serverId", row.serverId))
        .collect();
      for (const member of members) {
        const user = await ctx.db.get(member.userId);
        if (user && !user.isBot && !user.deletedAt) users.add(member.userId);
      }
    }
    const usage = await ctx.db
      .query("botApiUsage")
      .withIndex("by_application_day", (q) =>
        q.eq("applicationId", applicationId),
      )
      .collect();
    return {
      installationCount: installations.length,
      usersReached: users.size,
      apiRequests: usage.reduce((sum, r) => sum + r.requests, 0),
      commandsExecuted: usage.reduce((sum, r) => sum + r.commands, 0),
    };
  },
});
export const audit = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    await requireOwnedApplication(ctx, applicationId);
    const rows = await ctx.db
      .query("botAuditLogs")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .order("desc")
      .take(100);
    return rows.map((r) => ({
      id: r._id,
      action: r.action,
      details: r.details ?? "",
      createdAt: r.createdAt,
    }));
  },
});
export const report = mutation({
  args: { applicationId: v.id("botApplications"), reason: v.string() },
  handler: async (ctx, { applicationId, reason }) => {
    const { id } = await requireActiveUser(ctx);
    const app = await ctx.db.get(applicationId);
    if (!app || app.deletedAt) botError("NOT_FOUND", "Application not found.");
    const clean = checkedText(reason, "Report reason", 2000, 10);
    const recent = await ctx.db
      .query("botReports")
      .withIndex("by_reporter", (q) =>
        q.eq("reporterId", id).gt("createdAt", Date.now() - 86_400_000),
      )
      .take(10);
    if (
      recent.length >= 10 ||
      recent.some(
        (r) => r.applicationId === applicationId && r.status === "open",
      )
    )
      botError(
        "RATE_LIMITED",
        "Your report is already recorded, or you have reached today's report limit.",
      );
    await ctx.db.insert("botReports", {
      applicationId,
      reporterId: id,
      reason: clean,
      status: "open",
      createdAt: Date.now(),
    });
  },
});
export const reports = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireActiveUser(ctx);
    if (!isPlatformStaff(user))
      botError("FORBIDDEN", "Only Kyro staff can review reports.");
    return await ctx.db
      .query("botReports")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(100);
  },
});
export const moderationList = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    const { user } = await requireActiveUser(ctx);
    if (!isPlatformStaff(user))
      botError("FORBIDDEN", "Only Kyro staff can review bots.");
    const term = checkedText(search ?? "", "Search", 100);
    const rows = term
      ? await ctx.db
          .query("botApplications")
          .withSearchIndex("search_name", (q) => q.search("name", term))
          .take(100)
      : await ctx.db.query("botApplications").order("desc").take(100);
    return rows
      .filter((app) => !app.deletedAt)
      .map((app) => ({
        id: app._id,
        name: app.name,
        ownerId: app.ownerId,
        enabled: app.enabled,
        suspended: app.suspended,
        verified: app.verified,
        featured: app.featured,
      }));
  },
});
export const moderate = mutation({
  args: {
    applicationId: v.id("botApplications"),
    suspended: v.optional(v.boolean()),
    verified: v.optional(v.boolean()),
    featured: v.optional(v.boolean()),
    reportId: v.optional(v.id("botReports")),
  },
  handler: async (ctx, args) => {
    const { id, user } = await requireActiveUser(ctx);
    if (!isPlatformAdmin(user))
      botError(
        "FORBIDDEN",
        "Only Kyro administrators can moderate bot applications.",
      );
    const app = await ctx.db.get(args.applicationId);
    if (!app || (app.deletedAt && (args.suspended !== undefined || args.verified !== undefined || args.featured !== undefined || !args.reportId))) botError("NOT_FOUND", "Application not found.");
    const patch: Partial<Doc<"botApplications">> = { updatedAt: Date.now() };
    if (args.suspended !== undefined) patch.suspended = args.suspended;
    if (args.suspended) {
      patch.tokenHash = undefined;
      patch.enabled = false;
      patch.discoverable = false;
      await ctx.db.patch(app.botUserId, {
        status: "offline",
        lastSeen: undefined,
      });
    }
    if (args.verified !== undefined) {
      patch.verified = args.verified;
      await ctx.db.patch(app.botUserId, { verified: args.verified });
    }
    if (args.featured !== undefined) patch.featured = args.featured;
    if (args.reportId) {
      const report = await ctx.db.get(args.reportId);
      if (!report || report.applicationId !== app._id)
        botError("INVALID_REQUEST", "Report does not match this application.");
      await ctx.db.patch(report._id, {
        status: "resolved",
        reviewedById: id,
        reviewedAt: Date.now(),
      });
    }
    await ctx.db.patch(app._id, patch);
    await botAudit(
      ctx,
      app._id,
      id,
      "application.moderate",
      args.suspended ? "Suspended and token revoked" : "Staff review",
    );
  },
});
