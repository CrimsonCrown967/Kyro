import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference } from "convex/server";
import { queueBotEvent } from "./botEvents";
import { mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./functions";
import {
  auditBot,
  activeBot,
  botError,
  humanManager,
  limit,
  ownerApp,
  publicBot,
  validPermissions,
} from "./botLib";
import {
  isPlatformAdmin,
  isReservedUsername,
  requireActiveUser,
  requireUser,
  USERNAME_PATTERN,
} from "./lib";
import { claimUpload, deleteClaimedUpload } from "./uploadSecurity";
import {
  BOT_CATEGORIES,
  BOT_EVENTS,
  DEFAULT_BOT_PERMISSIONS,
} from "../lib/botContract";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const apps = await ctx.db
      .query("botApplications")
      .withIndex("by_owner", (q) => q.eq("ownerId", id))
      .collect();
    return Promise.all(
      apps.filter((a) => !a.deletedAt).map((a) => publicBot(ctx, a)),
    );
  },
});
export const get = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    const app = await ownerApp(ctx, applicationId);
    const [commands, logs, deliveries, installs] = await Promise.all([
      ctx.db
        .query("botCommands")
        .withIndex("by_app", (q) => q.eq("applicationId", applicationId))
        .collect(),
      ctx.db
        .query("botAuditLogs")
        .withIndex("by_app", (q) => q.eq("applicationId", applicationId))
        .order("desc")
        .take(50),
      ctx.db
        .query("botEvents")
        .withIndex("by_app_created", (q) =>
          q.eq("applicationId", applicationId),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("botInstallations")
        .withIndex("by_app", (q) => q.eq("applicationId", applicationId))
        .collect(),
    ]);
    const reached = new Set<string>();
    for (const install of installs) {
      const members = await ctx.db
        .query("serverMembers")
        .withIndex("by_server", (q) => q.eq("serverId", install.serverId))
        .take(5000);
      members.forEach((m) => reached.add(m.userId));
    }
    return {
      ...(await publicBot(ctx, app)),
      tokenConfigured: Boolean(app.tokenHash),
      tokenUpdatedAt: app.tokenUpdatedAt,
      events: app.events,
      webhookUrl: app.webhookUrl ?? "",
      deliveryMode: app.deliveryMode,
      apiRequests: app.apiRequests,
      commandsExecuted: app.commandsExecuted,
      usersReached: reached.size,
      suspensionReason: app.suspensionReason ?? null,
      commands,
      logs,
      deliveries: deliveries.map((e) => ({
        id: e._id,
        type: e.type,
        status: e.status,
        attempts: e.attempts,
        lastError: e.lastError ?? null,
        createdAt: e.createdAt,
      })),
      installations: await Promise.all(
        installs.map(async (i) => ({
          id: i._id,
          serverId: i.serverId,
          name: (await ctx.db.get(i.serverId))?.name ?? "Deleted server",
          permissions: i.permissions,
          createdAt: i.createdAt,
        })),
      ),
    };
  },
});
export const create = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    description: v.string(),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const { id } = await requireActiveUser(ctx);
    const name = args.name.trim();
    const username = args.username.trim().toLowerCase();
    if (
      name.length < 2 ||
      name.length > 64 ||
      args.description.length > 1000 ||
      !USERNAME_PATTERN.test(username) ||
      isReservedUsername(username)
    )
      botError(
        400,
        "INVALID_APPLICATION",
        "Use a 2–64 character name and a valid, available username.",
      );
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash))
      botError(400, "INVALID_TOKEN_HASH", "Generate a new secure token.");
    const owned = await ctx.db
      .query("botApplications")
      .withIndex("by_owner", (q) => q.eq("ownerId", id))
      .collect();
    if (owned.filter((a) => !a.deletedAt).length >= 20)
      botError(
        409,
        "APPLICATION_LIMIT",
        "An account may own up to 20 applications.",
      );
    if (
      await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username))
        .first()
    )
      botError(409, "USERNAME_TAKEN", "That username is already taken.");
    if (
      await ctx.db
        .query("botApplications")
        .withIndex("by_token", (q) => q.eq("tokenHash", args.tokenHash))
        .first()
    )
      botError(409, "TOKEN_REUSED", "Generate a new token.");
    const now = Date.now();
    const botUserId = await ctx.db.insert("users", {
      name,
      username,
      bio: args.description,
      dmPolicy: "nobody",
      allowFriendRequests: false,
      suggestible: false,
      status: "offline",
      createdAt: now,
    });
    const applicationId = await ctx.db.insert("botApplications", {
      ownerId: id,
      botUserId,
      name,
      description: args.description,
      enabled: true,
      discoverable: false,
      category: "General",
      verified: false,
      featured: false,
      suspended: false,
      tokenHash: args.tokenHash,
      tokenUpdatedAt: now,
      permissions: DEFAULT_BOT_PERMISSIONS,
      events: ["interactionCreate"],
      deliveryMode: "poll",
      apiRequests: 0,
      commandsExecuted: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(botUserId, { botApplicationId: applicationId });
    await auditBot(ctx, applicationId, "application.create", id);
    return applicationId;
  },
});
export const update = mutation({
  args: {
    applicationId: v.id("botApplications"),
    name: v.string(),
    description: v.string(),
    username: v.string(),
    botDescription: v.string(),
    enabled: v.boolean(),
    discoverable: v.boolean(),
    category: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const app = await ownerApp(ctx, args.applicationId);
    const username = args.username.trim().toLowerCase();
    if (
      args.name.trim().length < 2 ||
      args.name.length > 64 ||
      args.description.length > 1000 ||
      args.botDescription.length > 400 ||
      !USERNAME_PATTERN.test(username) ||
      isReservedUsername(username) ||
      !(BOT_CATEGORIES as readonly string[]).includes(args.category)
    )
      botError(
        400,
        "INVALID_APPLICATION",
        "Check the application name, profile and category.",
      );
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (existing && existing._id !== app.botUserId)
      botError(409, "USERNAME_TAKEN", "That username is already taken.");
    await ctx.db.patch(app._id, {
      name: args.name.trim(),
      description: args.description,
      enabled: args.enabled,
      discoverable: args.discoverable,
      category: args.category,
      permissions: validPermissions(args.permissions),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(app.botUserId, {
      name: args.name.trim(),
      username,
      bio: args.botDescription,
      ...(!args.enabled ? { status: "offline" as const } : {}),
    });
    await auditBot(ctx, app._id, "application.update", app.ownerId);
  },
});
export const token = mutation({
  args: {
    applicationId: v.id("botApplications"),
    tokenHash: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { applicationId, tokenHash }) => {
    const app = await ownerApp(ctx, applicationId);
    if (tokenHash !== null && !/^[a-f0-9]{64}$/.test(tokenHash))
      botError(400, "INVALID_TOKEN_HASH", "Generate a secure token.");
    if (tokenHash) {
      const duplicate = await ctx.db
        .query("botApplications")
        .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
        .first();
      if (duplicate) botError(409, "TOKEN_REUSED", "Generate a new token.");
    }
    await ctx.db.patch(applicationId, {
      tokenHash: tokenHash ?? undefined,
      tokenUpdatedAt: Date.now(),
    });
    await auditBot(
      ctx,
      applicationId,
      tokenHash ? "token.rotate" : "token.revoke",
      app.ownerId,
    );
  },
});
export const asset = mutation({
  args: {
    applicationId: v.id("botApplications"),
    kind: v.union(v.literal("icon"), v.literal("banner"), v.literal("avatar")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { applicationId, kind, storageId }) => {
    const app = await ownerApp(ctx, applicationId);
    const bot = await ctx.db.get(app.botUserId);
    const claim =
      kind === "avatar"
        ? "user_avatar"
        : kind === "icon"
          ? "bot_icon"
          : "bot_banner";
    const claimId = kind === "avatar" ? app.botUserId : app._id;
    const previous =
      kind === "avatar"
        ? bot?.avatarStorageId
        : kind === "icon"
          ? app.iconStorageId
          : app.bannerStorageId;
    await claimUpload(ctx, app.ownerId, storageId, claim, claimId, {
      imageOnly: true,
    });
    if (previous !== storageId)
      await deleteClaimedUpload(ctx, previous, claim, claimId);
    if (kind === "avatar")
      await ctx.db.patch(app.botUserId, { avatarStorageId: storageId });
    else
      await ctx.db.patch(
        applicationId,
        kind === "icon"
          ? { iconStorageId: storageId }
          : { bannerStorageId: storageId },
      );
    await auditBot(ctx, applicationId, `asset.${kind}`, app.ownerId);
  },
});
export const events = mutation({
  args: {
    applicationId: v.id("botApplications"),
    events: v.array(v.string()),
    deliveryMode: v.union(v.literal("poll"), v.literal("webhook")),
    webhookUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const app = await ownerApp(ctx, args.applicationId);
    if (
      args.events.length > BOT_EVENTS.length ||
      args.events.some((e) => !(BOT_EVENTS as readonly string[]).includes(e))
    )
      botError(400, "INVALID_EVENTS", "Select supported events.");
    let webhookUrl: string | undefined;
    if (args.deliveryMode === "webhook") {
      try {
        const url = new URL(args.webhookUrl);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.hash ||
          (url.port && url.port !== "443") ||
          url.hostname === "localhost" ||
          url.hostname.endsWith(".local")
        )
          throw new Error();
        webhookUrl = url.href;
      } catch {
        botError(
          400,
          "INVALID_URL",
          "Use a public HTTPS webhook URL on port 443.",
        );
      }
    }
    await ctx.db.patch(app._id, {
      events: [...new Set([...args.events, "interactionCreate"])],
      deliveryMode: args.deliveryMode,
      webhookUrl,
      updatedAt: Date.now(),
    });
    await auditBot(ctx, app._id, "events.configure", app.ownerId);
    await ctx.scheduler.runAfter(
      0,
      makeFunctionReference<"mutation">("botDelivery:syncDeliveryMode"),
      { applicationId: app._id },
    );
  },
});
async function uninstall(
  ctx: MutationCtx,
  applicationId: Id<"botApplications">,
  serverId: Id<"servers">,
) {
  const app = await ctx.db.get(applicationId);
  const install = await ctx.db
    .query("botInstallations")
    .withIndex("by_app_server", (q) =>
      q.eq("applicationId", applicationId).eq("serverId", serverId),
    )
    .unique();
  if (!app || !install) return;
  const member = await ctx.db
    .query("serverMembers")
    .withIndex("by_server_user", (q) =>
      q.eq("serverId", serverId).eq("userId", app.botUserId),
    )
    .unique();
  if (member) await ctx.db.delete(member._id);
  if (await ctx.db.get(install.roleId)) await ctx.db.delete(install.roleId);
  if (await ctx.db.get(install._id)) await ctx.db.delete(install._id);
}
export const remove = mutation({
  args: { applicationId: v.id("botApplications"), confirmation: v.string() },
  handler: async (ctx, args) => {
    const app = await ownerApp(ctx, args.applicationId);
    if (args.confirmation !== app.name)
      botError(
        400,
        "CONFIRMATION_REQUIRED",
        "Type the application name to confirm deletion.",
      );
    const installs = await ctx.db
      .query("botInstallations")
      .withIndex("by_app", (q) => q.eq("applicationId", app._id))
      .collect();
    for (const install of installs)
      await uninstall(ctx, app._id, install.serverId);
    for (const command of await ctx.db
      .query("botCommands")
      .withIndex("by_app", (q) => q.eq("applicationId", app._id))
      .collect())
      await ctx.db.delete(command._id);
    await ctx.db.patch(app._id, {
      deletedAt: Date.now(),
      tokenHash: undefined,
      enabled: false,
      discoverable: false,
      webhookUrl: undefined,
    });
    await ctx.db.patch(app.botUserId, {
      deletedAt: Date.now(),
      status: "offline",
    });
    const bot = await ctx.db.get(app.botUserId);
    await deleteClaimedUpload(ctx, app.iconStorageId, "bot_icon", app._id);
    await deleteClaimedUpload(ctx, app.bannerStorageId, "bot_banner", app._id);
    await deleteClaimedUpload(
      ctx,
      bot?.avatarStorageId,
      "user_avatar",
      app.botUserId,
    );
    await auditBot(ctx, app._id, "application.delete", app.ownerId);
  },
});
export const directory = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    sort: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apps = await ctx.db
      .query("botApplications")
      .withIndex("by_public", (q) => q.eq("discoverable", true))
      .order("desc")
      .take(500);
    const results = await Promise.all(
      apps
        .filter(
          (a) =>
            !a.deletedAt &&
            !a.suspended &&
            a.enabled &&
            (!args.category || a.category === args.category) &&
            (!args.search ||
              `${a.name} ${a.description}`
                .toLowerCase()
                .includes(args.search.toLowerCase().slice(0, 100))),
        )
        .map(async (a) => {
          try {
            await activeBot(ctx, a.tokenHash ?? "");
            return await publicBot(ctx, a);
          } catch {
            return null;
          }
        }),
    );
    return results
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) =>
        args.sort === "popular"
          ? b.serverCount - a.serverCount
          : args.sort === "recent"
            ? b.createdAt - a.createdAt
            : Number(b.featured) - Number(a.featured) ||
              b.serverCount - a.serverCount,
      )
      .slice(0, 100);
  },
});
export const profile = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    const app = await ctx.db.get(applicationId);
    if (!app || app.deletedAt) return null;
    const viewerId = await getAuthUserId(ctx);
    const viewer = viewerId ? await ctx.db.get(viewerId) : null;
    if (
      (!app.enabled || app.suspended) &&
      viewerId !== app.ownerId &&
      !(viewer && isPlatformAdmin(viewer))
    )
      return null;
    return publicBot(ctx, app);
  },
});
export const installableServers = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const rows = await ctx.db
      .query("serverMembers")
      .withIndex("by_user", (q) => q.eq("userId", id))
      .collect();
    const result = [];
    for (const row of rows) {
      try {
        const access = await humanManager(ctx, row.serverId);
        result.push({
          id: row.serverId,
          name: access.server.name,
          permissions: access.permissions,
        });
      } catch {
        /* Only servers the user can manage. */
      }
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
    const permissions = validPermissions(args.permissions);
    const manager = await humanManager(ctx, args.serverId, permissions);
    const app = await ctx.db.get(args.applicationId);
    if (!app || !app.enabled || app.suspended || app.deletedAt)
      botError(404, "NOT_FOUND", "Bot unavailable.");
    await activeBot(ctx, app.tokenHash ?? "");
    const banned = await ctx.db
      .query("bans")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", args.serverId).eq("userId", app.botUserId),
      )
      .first();
    if (banned)
      botError(403, "BOT_BANNED", "Unban this bot before installing it.");
    const existing = await ctx.db
      .query("botInstallations")
      .withIndex("by_app_server", (q) =>
        q.eq("applicationId", app._id).eq("serverId", args.serverId),
      )
      .unique();
    if (existing) {
      const membership = await ctx.db
        .query("serverMembers")
        .withIndex("by_server_user", (q) =>
          q.eq("serverId", args.serverId).eq("userId", app.botUserId),
        )
        .unique();
      if (membership && (await ctx.db.get(existing.roleId))) {
        await ctx.db.patch(existing._id, { permissions });
        await ctx.db.patch(existing.roleId, { permissions });
        await auditBot(
          ctx,
          app._id,
          "installation.permissions",
          manager.id,
          args.serverId,
        );
        return existing._id;
      }
      await uninstall(ctx, app._id, args.serverId);
    }
    const count = await ctx.db
      .query("botInstallations")
      .withIndex("by_app", (q) => q.eq("applicationId", app._id))
      .take(100);
    if (count.length >= 100)
      botError(
        409,
        "INSTALLATION_LIMIT",
        "This bot has reached the 100-server limit.",
      );
    const roleId = await ctx.db.insert("serverRoles", {
      serverId: args.serverId,
      name: app.name,
      color: "#5865F2",
      position: 1,
      isDefault: false,
      permissions,
      botApplicationId: app._id,
    });
    await ctx.db.insert("serverMembers", {
      serverId: args.serverId,
      userId: app.botUserId,
      roleIds: [roleId],
      joinedAt: Date.now(),
    });
    const id = await ctx.db.insert("botInstallations", {
      applicationId: app._id,
      serverId: args.serverId,
      roleId,
      installedBy: manager.id,
      permissions,
      createdAt: Date.now(),
    });
    await queueBotEvent(
      ctx,
      args.serverId,
      "serverCreate",
      {
        id: manager.server._id,
        name: manager.server.name,
        description: manager.server.description ?? "",
        ownerId: manager.server.ownerId,
      },
      undefined,
      app._id,
    );
    await auditBot(
      ctx,
      app._id,
      "installation.create",
      manager.id,
      args.serverId,
    );
    return id;
  },
});
export const installations = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    await humanManager(ctx, serverId);
    const rows = await ctx.db
      .query("botInstallations")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect();
    return Promise.all(
      rows.map(async (row) => {
        const app = await ctx.db.get(row.applicationId);
        return {
          id: row._id,
          applicationId: row.applicationId,
          permissions: row.permissions,
          name: app?.name ?? "Deleted bot",
          enabled: app?.enabled && !app.suspended,
        };
      }),
    );
  },
});
export const removeInstallation = mutation({
  args: { applicationId: v.id("botApplications"), serverId: v.id("servers") },
  handler: async (ctx, args) => {
    const manager = await humanManager(ctx, args.serverId);
    await uninstall(ctx, args.applicationId, args.serverId);
    await auditBot(
      ctx,
      args.applicationId,
      "installation.remove",
      manager.id,
      args.serverId,
    );
  },
});
export const moderate = mutation({
  args: {
    applicationId: v.id("botApplications"),
    suspended: v.boolean(),
    verified: v.boolean(),
    featured: v.boolean(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { id, user } = await requireActiveUser(ctx);
    if (!isPlatformAdmin(user))
      botError(403, "FORBIDDEN", "Platform admin permission required.");
    if (args.reason.length > 300)
      botError(400, "INVALID_REASON", "Reason must be at most 300 characters.");
    await ctx.db.patch(args.applicationId, {
      suspended: args.suspended,
      suspensionReason: args.reason,
      verified: args.verified,
      featured: args.featured,
    });
    await auditBot(
      ctx,
      args.applicationId,
      "platform.moderate",
      id,
      args.reason,
    );
  },
});
export const report = mutation({
  args: { applicationId: v.id("botApplications"), reason: v.string() },
  handler: async (ctx, args) => {
    const { id } = await requireActiveUser(ctx);
    const app = await ctx.db.get(args.applicationId);
    if (!app || app.deletedAt) botError(404, "NOT_FOUND", "Bot not found.");
    if (args.reason.trim().length < 10 || args.reason.length > 1000)
      botError(
        400,
        "INVALID_REPORT",
        "Describe the issue in 10–1,000 characters.",
      );
    if (!(await limit(ctx, `bot-report:${id}`, 5, 3600000)))
      botError(429, "RATE_LIMITED", "Please wait before reporting again.");
    await ctx.db.insert("reports", {
      reporterId: id,
      reportedUserId: app.botUserId,
      reason: `Bot ${app.name}: ${args.reason}`,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
