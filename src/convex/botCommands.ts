import { v } from "convex/values";
import { mutation, query } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./functions";
import { commandSchema } from "../lib/botContract";
import {
  channelPermissions,
  hasPermission,
  type Permission,
} from "../lib/permissions";
import {
  requireActiveUser,
  requireServerAccess,
  restrictionLevel,
  type Ctx,
} from "./lib";
import {
  auditBot,
  activeBot,
  botChannel,
  botError,
  botServer,
  limit,
  ownerApp,
  tableId,
} from "./botLib";
import { queueBotEvent } from "./botEvents";
import { evaluateAutomod } from "./automod";

export async function registerCommand(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  raw: unknown,
) {
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success)
    botError(
      400,
      "INVALID_COMMAND",
      parsed.error.issues[0]?.message ?? "Invalid command.",
    );
  const command = parsed.data;
  const serverId = command.serverId
    ? tableId(ctx, "servers", command.serverId)
    : undefined;
  if (serverId) await botServer(ctx, app, serverId);
  const existing = await ctx.db
    .query("botCommands")
    .withIndex("by_app_scope_name", (q) =>
      q
        .eq("applicationId", app._id)
        .eq("serverId", serverId)
        .eq("name", command.name),
    )
    .unique();
  const fields = {
    applicationId: app._id,
    serverId,
    name: command.name,
    description: command.description,
    permissions: command.permissions,
    options: command.options,
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  if (
    (
      await ctx.db
        .query("botCommands")
        .withIndex("by_app", (q) => q.eq("applicationId", app._id))
        .take(100)
    ).length >= 100
  )
    botError(
      409,
      "COMMAND_LIMIT",
      "An application may register up to 100 commands.",
    );
  return ctx.db.insert("botCommands", fields);
}
export const save = mutation({
  args: { applicationId: v.id("botApplications"), command: v.any() },
  handler: async (ctx, args) => {
    const app = await ownerApp(ctx, args.applicationId);
    const id = await registerCommand(ctx, app, args.command);
    await auditBot(ctx, app._id, "command.save", app.ownerId);
    return id;
  },
});
export const remove = mutation({
  args: {
    applicationId: v.id("botApplications"),
    commandId: v.id("botCommands"),
  },
  handler: async (ctx, args) => {
    const app = await ownerApp(ctx, args.applicationId);
    const command = await ctx.db.get(args.commandId);
    if (!command || command.applicationId !== app._id)
      botError(404, "NOT_FOUND", "Command not found.");
    await ctx.db.delete(command._id);
    await auditBot(ctx, app._id, "command.delete", app.ownerId);
  },
});
async function humanChannel(ctx: Ctx, channelId: Id<"channels">) {
  const { id } = await requireActiveUser(ctx);
  const channel = await ctx.db.get(channelId);
  if (!channel) botError(404, "NOT_FOUND", "Channel not found.");
  const access = await requireServerAccess(ctx, channel.serverId, id);
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
    .collect();
  const permissions =
    access.server.ownerId === id
      ? access.permissions
      : channelPermissions(
          access.permissions,
          access.member.roleIds,
          roles.find((r) => r.isDefault)?._id ?? null,
          channel.permissionOverwrites,
        );
  if (!hasPermission(permissions, "view_channel"))
    botError(403, "MISSING_PERMISSION", "You cannot view this channel.");
  return { id, channel, ...access, permissions };
}
export const forChannel = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const access = await humanChannel(ctx, channelId);
    const installs = await ctx.db
      .query("botInstallations")
      .withIndex("by_server", (q) => q.eq("serverId", access.channel.serverId))
      .collect();
    const result = [];
    for (const install of installs) {
      const app = await ctx.db.get(install.applicationId);
      if (!app || !app.enabled || app.suspended || app.deletedAt) continue;
      try {
        await activeBot(ctx, app.tokenHash ?? "");
        await botChannel(ctx, app, channelId);
      } catch {
        continue;
      }
      const bot = await ctx.db.get(app.botUserId);
      const commands = await ctx.db
        .query("botCommands")
        .withIndex("by_app", (q) => q.eq("applicationId", app._id))
        .collect();
      const scoped = new Map<string, Doc<"botCommands">>();
      for (const command of commands.filter((c) => !c.serverId))
        scoped.set(command.name, command);
      for (const command of commands.filter(
        (c) => c.serverId === access.channel.serverId,
      ))
        scoped.set(command.name, command);
      for (const command of scoped.values())
        if (
          command.permissions.every((p) =>
            hasPermission(access.permissions, p as Permission),
          )
        )
          result.push({
            id: command._id,
            name: `${bot?.username}:${command.name}`,
            description: command.description,
            applicationName: app.name,
            options: command.options,
          });
    }
    return result;
  },
});
export const execute = mutation({
  args: {
    channelId: v.id("channels"),
    commandId: v.id("botCommands"),
    options: v.any(),
  },
  handler: async (ctx, args) => {
    const access = await humanChannel(ctx, args.channelId);
    const command = await ctx.db.get(args.commandId);
    if (
      !command ||
      (command.serverId && command.serverId !== access.channel.serverId)
    )
      botError(404, "NOT_FOUND", "Command not available here.");
    if (
      !command.serverId &&
      (await ctx.db
        .query("botCommands")
        .withIndex("by_app_scope_name", (q) =>
          q
            .eq("applicationId", command.applicationId)
            .eq("serverId", access.channel.serverId)
            .eq("name", command.name),
        )
        .first())
    )
      botError(409, "COMMAND_OVERRIDDEN", "Use the server-specific command.");
    const app = await ctx.db.get(command.applicationId);
    if (
      !app ||
      !app.enabled ||
      app.suspended ||
      app.deletedAt ||
      !app.tokenHash
    )
      botError(403, "BOT_UNAVAILABLE", "This bot is unavailable.");
    await activeBot(ctx, app.tokenHash);
    await botChannel(ctx, app, args.channelId);
    if (
      !hasPermission(access.permissions, "send_messages") ||
      !command.permissions.every((p) =>
        hasPermission(access.permissions, p as Permission),
      )
    )
      botError(
        403,
        "MISSING_PERMISSION",
        "You do not have this command's required permissions.",
      );
    if (
      (access.member.communicationDisabledUntil ?? 0) > Date.now() ||
      (await restrictionLevel(ctx, access.id)) >= 2
    )
      botError(
        403,
        "ACCOUNT_RESTRICTED",
        "You cannot use commands while restricted.",
      );
    if (
      (access.channel.readOnly ||
        (access.server.locked &&
          (access.server.lockedUntil === undefined ||
            access.server.lockedUntil > Date.now()))) &&
      !hasPermission(access.permissions, "manage_messages")
    )
      botError(403, "CHANNEL_LOCKED", "Commands are disabled in this channel.");
    if (
      access.server.rulesChannelId === args.channelId &&
      !hasPermission(access.permissions, "manage_server")
    )
      botError(
        403,
        "MISSING_PERMISSION",
        "Manage server is required in the rules channel.",
      );
    const verification = access.server.verificationLevel ?? "none";
    if (
      verification !== "none" &&
      access.server.ownerId !== access.id &&
      !access.member.roleIds.length &&
      !hasPermission(access.permissions, "manage_messages")
    ) {
      const user = await ctx.db.get(access.id);
      if (
        Date.now() - (user?.createdAt ?? Date.now()) <
        { low: 300000, medium: 3600000, high: 86400000 }[verification]
      )
        botError(
          403,
          "ACCOUNT_TOO_NEW",
          "Your account does not meet this server's age requirement.",
        );
    }
    if (access.channel.slowMode) {
      const last = await ctx.db
        .query("botInteractions")
        .withIndex("by_user_channel", (q) =>
          q.eq("userId", access.id).eq("channelId", args.channelId),
        )
        .order("desc")
        .first();
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_container", (q) => q.eq("containerId", args.channelId))
        .order("desc")
        .take(100);
      if (
        Math.max(
          last?.createdAt ?? 0,
          messages.find((m) => m.authorId === access.id)?.createdAt ?? 0,
        ) >
        Date.now() - access.channel.slowMode * 1000
      )
        botError(429, "SLOW_MODE", "Channel slow mode is active.");
    }
    const options = args.options as Record<string, unknown>;
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      Object.keys(options).some(
        (k) => !command.options.some((o) => o.name === k),
      )
    )
      botError(400, "INVALID_OPTIONS", "Unknown command options.");
    const clean: Record<string, string | number | boolean> = {};
    for (const option of command.options) {
      const value = options[option.name];
      if (value === undefined || value === "") {
        if (option.required)
          botError(400, "MISSING_OPTION", `${option.name} is required.`);
        continue;
      }
      if (option.type === "string") {
        if (
          typeof value !== "string" ||
          value.length > 1000 ||
          (option.choices?.length && !option.choices.includes(value))
        )
          botError(400, "INVALID_OPTION", `Invalid value for ${option.name}.`);
        clean[option.name] = value;
      } else if (option.type === "integer") {
        if (typeof value !== "number" || !Number.isSafeInteger(value))
          botError(400, "INVALID_OPTION", `${option.name} must be an integer.`);
        clean[option.name] = value;
      } else if (option.type === "boolean") {
        if (typeof value !== "boolean")
          botError(
            400,
            "INVALID_OPTION",
            `${option.name} must be true or false.`,
          );
        clean[option.name] = value;
      } else {
        if (typeof value !== "string")
          botError(
            400,
            "INVALID_OPTION",
            `${option.name} must be a member ID.`,
          );
        const userId = tableId(ctx, "users", value);
        const member = await ctx.db
          .query("serverMembers")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", access.channel.serverId).eq("userId", userId),
          )
          .first();
        if (!member)
          botError(400, "INVALID_OPTION", "Selected user is not a member.");
        clean[option.name] = userId;
      }
    }
    const automod = await evaluateAutomod(ctx, {
      server: access.server,
      channel: access.channel,
      member: access.member,
      permissions: access.permissions,
      userId: access.id,
      content: Object.values(clean).join(" "),
    });
    if (automod) botError(403, "AUTOMOD_BLOCKED", automod.reason);
    if (!(await limit(ctx, `interactions:${access.id}`, 10)))
      botError(429, "RATE_LIMITED", "Wait before using more commands.");
    const now = Date.now();
    const interactionId = await ctx.db.insert("botInteractions", {
      applicationId: app._id,
      commandId: command._id,
      userId: access.id,
      serverId: access.channel.serverId,
      channelId: args.channelId,
      options: JSON.stringify(clean),
      createdAt: now,
      expiresAt: now + 15 * 60000,
    });
    await ctx.db.patch(app._id, { commandsExecuted: app.commandsExecuted + 1 });
    await queueBotEvent(
      ctx,
      access.channel.serverId,
      "interactionCreate",
      {
        id: interactionId,
        commandId: command._id,
        name: command.name,
        userId: access.id,
        channelId: args.channelId,
        serverId: access.channel.serverId,
        options: clean,
        expiresAt: now + 15 * 60000,
      },
      args.channelId,
      app._id,
    );
    return interactionId;
  },
});
export const responses = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const { id } = await humanChannel(ctx, channelId);
    const rows = await ctx.db
      .query("botInteractions")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", id).eq("channelId", channelId),
      )
      .order("desc")
      .take(10);
    return rows
      .filter((r) => r.createdAt > Date.now() - 15 * 60000)
      .map((r) => ({
        id: r._id,
        respondedAt: r.respondedAt,
        ephemeral: r.ephemeral,
        response: r.ephemeral ? r.response : undefined,
        expiresAt: r.expiresAt,
      }));
  },
});
