import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  activeSiteBan,
  requireActiveUser,
  requireServerAccess,
  type Ctx,
} from "./lib";
import {
  channelPermissions,
  hasPermission,
  type Permission,
} from "../lib/permissions";
import { BOT_PERMISSIONS, permissionSchema } from "../lib/botContract";

export function botError(status: number, code: string, message: string): never {
  throw new ConvexError({ status, code, message });
}
export function validPermissions(value: unknown): string[] {
  const parsed = permissionSchema.safeParse(value);
  if (!parsed.success)
    botError(400, "INVALID_PERMISSIONS", "Select supported bot permissions.");
  return parsed.data;
}
export function tableId<
  T extends
    | "servers"
    | "channels"
    | "messages"
    | "users"
    | "serverRoles"
    | "serverEmojis"
    | "botApplications"
    | "botCommands"
    | "botInteractions"
    | "botEvents"
    | "_storage",
>(ctx: Ctx, table: T, value: string): Id<T> {
  const id =
    table === "_storage"
      ? ctx.db.system.normalizeId("_storage", value)
      : ctx.db.normalizeId(table as Exclude<T, "_storage">, value);
  if (!id) botError(404, "NOT_FOUND", "Resource not found.");
  return id as Id<T>;
}
export async function ownerApp(ctx: Ctx, applicationId: Id<"botApplications">) {
  const { id } = await requireActiveUser(ctx);
  const app = await ctx.db.get(applicationId);
  if (!app || app.deletedAt || app.ownerId !== id)
    botError(404, "NOT_FOUND", "Application not found.");
  return app;
}
export async function activeBot(ctx: Ctx, tokenHash: string) {
  if (!/^[a-f0-9]{64}$/.test(tokenHash))
    botError(401, "UNAUTHORIZED", "Invalid bot credential.");
  const app = await ctx.db
    .query("botApplications")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!app || !app.enabled || app.suspended || app.deletedAt)
    botError(401, "UNAUTHORIZED", "Bot credential is invalid or revoked.");
  const [owner, bot, ownerBan, botBan] = await Promise.all([
    ctx.db.get(app.ownerId),
    ctx.db.get(app.botUserId),
    activeSiteBan(ctx, app.ownerId),
    activeSiteBan(ctx, app.botUserId),
  ]);
  if (!owner || owner.deletedAt || !bot || bot.deletedAt || ownerBan || botBan)
    botError(403, "BOT_UNAVAILABLE", "This bot is unavailable.");
  return app;
}
export async function limit(
  ctx: MutationCtx,
  key: string,
  maximum: number,
  windowMs = 60_000,
): Promise<boolean> {
  const window = Math.floor(Date.now() / windowMs) * windowMs;
  const row = await ctx.db
    .query("botRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row?.window === window && row.count >= maximum) return false;
  if (row)
    await ctx.db.patch(row._id, {
      window,
      count: row.window === window ? row.count + 1 : 1,
    });
  else await ctx.db.insert("botRateLimits", { key, window, count: 1 });
  return true;
}
export async function botServer(
  ctx: Ctx,
  app: Doc<"botApplications">,
  serverId: Id<"servers">,
  permission?: string,
) {
  const install = await ctx.db
    .query("botInstallations")
    .withIndex("by_app_server", (q) =>
      q.eq("applicationId", app._id).eq("serverId", serverId),
    )
    .unique();
  if (!install)
    botError(403, "NOT_INSTALLED", "Install this bot in the server first.");
  const access = await requireServerAccess(ctx, serverId, app.botUserId);
  // Installation permissions are a ceiling, even if somebody assigns an administrator role.
  const permissions = install.permissions.filter((p) =>
    hasPermission(access.permissions, p as Permission),
  );
  if (permission && !permissions.includes(permission))
    botError(403, "MISSING_PERMISSION", `Missing permission: ${permission}.`);
  return { ...access, install, permissions };
}
export async function botChannel(
  ctx: Ctx,
  app: Doc<"botApplications">,
  channelId: Id<"channels">,
  permission?: string,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel) botError(404, "NOT_FOUND", "Channel not found.");
  const access = await botServer(ctx, app, channel.serverId);
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
    .collect();
  // Strip administrator before applying overrides: bots never bypass channel denies.
  const effective = channelPermissions(
    access.permissions.filter((p) => p !== "administrator"),
    access.member.roleIds,
    roles.find((r) => r.isDefault)?._id ?? null,
    channel.permissionOverwrites,
  );
  const permissions = effective.filter((p) =>
    access.install.permissions.includes(p),
  );
  if (
    !permissions.includes("view_channel") ||
    (permission && !permissions.includes(permission))
  )
    botError(
      403,
      "MISSING_PERMISSION",
      `Missing channel permission: ${permission ?? "view_channel"}.`,
    );
  return { ...access, channel, permissions, roles };
}
export async function humanManager(
  ctx: Ctx,
  serverId: Id<"servers">,
  requested: string[] = [],
) {
  const { id } = await requireActiveUser(ctx);
  const access = await requireServerAccess(ctx, serverId, id);
  if (!hasPermission(access.permissions, "manage_server"))
    botError(
      403,
      "MISSING_PERMISSION",
      "Manage community permission is required.",
    );
  if (
    !requested.every((p) => hasPermission(access.permissions, p as Permission))
  )
    botError(
      403,
      "CANNOT_DELEGATE",
      "You cannot grant permissions you do not hold.",
    );
  return { id, ...access };
}
export async function auditBot(
  ctx: MutationCtx,
  applicationId: Id<"botApplications">,
  action: string,
  actorId?: Id<"users">,
  details = "",
) {
  await ctx.db.insert("botAuditLogs", {
    applicationId,
    action,
    actorId,
    details: details.slice(0, 300),
    createdAt: Date.now(),
  });
}
export async function publicBot(ctx: Ctx, app: Doc<"botApplications">) {
  const [bot, owner, installs] = await Promise.all([
    ctx.db.get(app.botUserId),
    ctx.db.get(app.ownerId),
    ctx.db
      .query("botInstallations")
      .withIndex("by_app", (q) => q.eq("applicationId", app._id))
      .collect(),
  ]);
  return {
    id: app._id,
    botId: app.botUserId,
    name: app.name,
    description: app.description,
    username: bot?.username ?? "deleted_bot",
    botDescription: bot?.bio ?? "",
    avatarUrl: bot?.avatarStorageId
      ? await ctx.storage.getUrl(bot.avatarStorageId)
      : null,
    iconUrl: app.iconStorageId
      ? await ctx.storage.getUrl(app.iconStorageId)
      : null,
    bannerUrl: app.bannerStorageId
      ? await ctx.storage.getUrl(app.bannerStorageId)
      : null,
    owner: {
      id: app.ownerId,
      name: owner?.name ?? "Deleted user",
      username: owner?.username ?? null,
    },
    enabled: app.enabled,
    suspended: app.suspended,
    verified: app.verified,
    featured: app.featured,
    discoverable: app.discoverable,
    category: app.category,
    permissions: app.permissions,
    createdAt: app.createdAt,
    serverCount: installs.length,
    lastActiveAt: app.tokenHash ? (app.lastActiveAt ?? null) : null,
    online:
      app.enabled &&
      !app.suspended &&
      Boolean(app.tokenHash) &&
      (app.lastActiveAt ?? 0) > Date.now() - 90_000,
  };
}
export async function messageDto(ctx: Ctx, message: Doc<"messages">) {
  const author = await ctx.db.get(message.authorId);
  return {
    id: message._id,
    channelId: message.containerId,
    content: message.content,
    embeds: message.embeds ?? [],
    replyToId: message.replyToId ?? null,
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    author: {
      id: message.authorId,
      username: author?.username ?? null,
      name: author?.name ?? "Deleted user",
      bot: Boolean(author?.botApplicationId),
    },
    attachments: await Promise.all(
      (message.attachments ?? []).map(async (a) => ({
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
        url: await ctx.storage.getUrl(a.storageId),
      })),
    ),
  };
}
export async function botTarget(
  ctx: Ctx,
  app: Doc<"botApplications">,
  serverId: Id<"servers">,
  userId: Id<"users">,
  permission: string,
) {
  const access = await botServer(ctx, app, serverId, permission);
  if (userId === app.botUserId || userId === access.server.ownerId)
    botError(
      403,
      "ROLE_HIERARCHY",
      "The bot cannot act on itself or the server owner.",
    );
  const target = await ctx.db
    .query("serverMembers")
    .withIndex("by_server_user", (q) =>
      q.eq("serverId", serverId).eq("userId", userId),
    )
    .unique();
  if (!target) botError(404, "NOT_FOUND", "Member not found.");
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", serverId))
    .collect();
  const top = (ids: Id<"serverRoles">[]) =>
    Math.max(
      0,
      ...roles.filter((r) => ids.includes(r._id)).map((r) => r.position),
    );
  if (top(target.roleIds) >= top(access.member.roleIds))
    botError(
      403,
      "ROLE_HIERARCHY",
      "Target must be below the bot's highest role.",
    );
  return { ...access, target, roles, top };
}
export const botPermissionNames = BOT_PERMISSIONS;
