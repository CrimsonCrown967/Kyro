import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  activeSiteBan,
  can,
  getServerAccess,
  requireActiveUser,
  restrictionLevel,
  type Ctx,
} from "./lib";
import {
  channelPermissions,
  PERMISSIONS,
  type Permission,
} from "../lib/permissions";
import { BOT_EVENT_TYPES } from "../lib/botContracts";

export const BOT_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.READ_MESSAGE_HISTORY,
  PERMISSIONS.MANAGE_MESSAGES,
  PERMISSIONS.MANAGE_CHANNELS,
  PERMISSIONS.MANAGE_ROLES,
  PERMISSIONS.KICK_MEMBERS,
  PERMISSIONS.BAN_MEMBERS,
  PERMISSIONS.MANAGE_SERVER,
  PERMISSIONS.MENTION_EVERYONE,
  PERMISSIONS.ADD_REACTIONS,
  PERMISSIONS.ATTACH_FILES,
  PERMISSIONS.USE_EXTERNAL_EMOJIS,
  PERMISSIONS.CREATE_POLLS,
];
export const DEFAULT_BOT_PERMISSIONS = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.READ_MESSAGE_HISTORY,
];
export const BOT_EVENTS = BOT_EVENT_TYPES;

export function botError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}
export function validateBotPermissions(permissions: string[]): string[] {
  if (
    permissions.length > BOT_PERMISSIONS.length ||
    permissions.some((p) => !BOT_PERMISSIONS.includes(p as Permission))
  ) {
    botError(
      "INVALID_REQUEST",
      "Select supported bot permissions. Administrator is never available to bots.",
    );
  }
  return [...new Set(permissions)];
}
export async function requireOwnedApplication(
  ctx: Ctx,
  applicationId: Id<"botApplications">,
) {
  const { id } = await requireActiveUser(ctx);
  const app = await ctx.db.get(applicationId);
  if (!app || app.deletedAt || app.ownerId !== id)
    botError("NOT_FOUND", "Application not found.");
  return { app, ownerId: id };
}
export async function assertBotActive(ctx: Ctx, app: Doc<"botApplications">) {
  const owner = await ctx.db.get(app.ownerId);
  const bot = await ctx.db.get(app.botUserId);
  if (
    !app.enabled ||
    app.suspended ||
    app.deletedAt ||
    !owner ||
    owner.deletedAt ||
    !bot ||
    bot.deletedAt ||
    (await activeSiteBan(ctx, app.ownerId)) ||
    (await activeSiteBan(ctx, app.botUserId)) ||
    (await restrictionLevel(ctx, app.ownerId)) >= 3
  ) {
    botError("FORBIDDEN", "This bot is unavailable or has been disabled.");
  }
}
/** Only HTTP actions accept the bearer token. Internal functions receive its SHA-256 hash. */
export async function authenticateBot(
  ctx: Ctx,
  tokenHash: string,
): Promise<Doc<"botApplications">> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash))
    botError("UNAUTHORIZED", "Invalid bot credentials.");
  const app = await ctx.db
    .query("botApplications")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!app) botError("UNAUTHORIZED", "Invalid bot credentials.");
  await assertBotActive(ctx, app);
  return app;
}
export async function requireBotServer(
  ctx: Ctx,
  app: Doc<"botApplications">,
  serverId: Id<"servers">,
) {
  await assertBotActive(ctx, app);
  const installation = await ctx.db
    .query("botInstallations")
    .withIndex("by_application_server", (q) =>
      q.eq("applicationId", app._id).eq("serverId", serverId),
    )
    .unique();
  const access = await getServerAccess(ctx, serverId, app.botUserId);
  if (!installation || !access)
    botError("FORBIDDEN", "The bot is not installed in this server.");
  const managedRole = await ctx.db.get(installation.roleId);
  if (
    !managedRole ||
    managedRole.serverId !== serverId ||
    !access.member.roleIds.includes(managedRole._id)
  )
    botError(
      "FORBIDDEN",
      "The bot installation role was revoked. Reinstall the bot to restore access.",
    );
  const bans = await ctx.db
    .query("bans")
    .withIndex("by_server_user", (q) =>
      q.eq("serverId", serverId).eq("userId", app.botUserId),
    )
    .collect();
  if (bans.length) botError("FORBIDDEN", "The bot is banned from this server.");
  // Removing or changing the managed role takes effect immediately. No admin shortcut crosses the installation ceiling.
  const permissions = installation.permissions.filter(
    (p) =>
      BOT_PERMISSIONS.includes(p as Permission) &&
      managedRole.permissions.includes(p) &&
      can(access.permissions, p as Permission),
  );
  return { ...access, permissions, installation };
}
export async function requireBotChannel(
  ctx: Ctx,
  app: Doc<"botApplications">,
  channelId: Id<"channels">,
  permission?: Permission,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel) botError("NOT_FOUND", "Channel not found.");
  const access = await requireBotServer(ctx, app, channel.serverId);
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
    .collect();
  const adjusted = channelPermissions(
    access.permissions,
    access.member.roleIds,
    roles.find((r) => r.isDefault)?._id ?? null,
    channel.permissionOverwrites,
  );
  const permissions = adjusted.filter(
    (p) => access.permissions.includes(p) && p !== PERMISSIONS.ADMINISTRATOR,
  );
  if (
    !permissions.includes(PERMISSIONS.VIEW_CHANNEL) ||
    (permission && !permissions.includes(permission))
  ) {
    botError(
      "FORBIDDEN",
      `Missing channel permission: ${permission ?? PERMISSIONS.VIEW_CHANNEL}.`,
    );
  }
  return { ...access, channel, permissions };
}
export async function botAudit(
  ctx: MutationCtx,
  applicationId: Id<"botApplications">,
  actorId: Id<"users">,
  action: string,
  details?: string,
) {
  await ctx.db.insert("botAuditLogs", {
    applicationId,
    actorId,
    action,
    details: details?.slice(0, 500),
    createdAt: Date.now(),
  });
}
