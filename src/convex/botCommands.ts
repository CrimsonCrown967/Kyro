import { z } from "zod";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  channelPermissions,
  hasPermission,
} from "../lib/permissions";
import { botCommandSchema } from "../lib/botContracts";
import { botCommandValidator } from "./botRuntimeSchema";
import {
  requireOwnedApplication,
  requireBotChannel,
  requireBotServer,
  botAudit,
} from "./botCore";
import {
  requireActiveUser,
  requireServerAccess,
  requireUser,
  restrictionLevel,
} from "./lib";
import { botFailure, rateLimit, recordBotUsage } from "./botRuntimeLib";
import { emitBotEvent } from "./botEventHooks";

export function commandObject(command: Doc<"botCommands">) {
  return {
    id: command._id,
    applicationId: command.applicationId,
    serverId: command.serverId,
    name: command.name,
    description: command.description,
    options: command.options,
    permissions: command.permissions,
  };
}
export async function listApplicationCommands(
  ctx: QueryCtx | MutationCtx,
  app: Doc<"botApplications">,
  serverId?: Id<"servers">,
) {
  return (
    await ctx.db
      .query("botCommands")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", app._id).eq("serverId", serverId),
      )
      .take(100)
  ).map(commandObject);
}
export async function replaceApplicationCommands(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  input: unknown,
  serverId?: Id<"servers">,
) {
  const parsed = z.array(botCommandSchema).max(100).safeParse(input);
  if (!parsed.success)
    botFailure(
      "INVALID_REQUEST",
      "Commands require valid names, descriptions, options, and permissions (maximum 100 per scope).",
    );
  if (serverId) await requireBotServer(ctx, app, serverId);
  const names = new Set<string>();
  for (const command of parsed.data) {
    if (names.has(command.name))
      botFailure(
        "INVALID_REQUEST",
        "Command names must be unique within a scope.",
      );
    names.add(command.name);
    if (
      command.permissions.some(
        (permission) =>
          !ALL_PERMISSIONS.includes(
            permission as (typeof ALL_PERMISSIONS)[number],
          ),
      )
    )
      botFailure("INVALID_REQUEST", "Unknown command permission.");
    let optional = false;
    const optionNames = new Set<string>();
    for (const option of command.options) {
      if (optionNames.has(option.name))
        botFailure("INVALID_REQUEST", "Option names must be unique.");
      optionNames.add(option.name);
      if (!option.required) optional = true;
      else if (optional)
        botFailure(
          "INVALID_REQUEST",
          "Required options must precede optional options.",
        );
      if (
        option.choices &&
        (option.type === "boolean" ||
          option.type === "user" ||
          option.choices.some((choice) =>
            option.type === "integer"
              ? typeof choice.value !== "number"
              : typeof choice.value !== "string",
          ))
      )
        botFailure(
          "INVALID_REQUEST",
          "Choices must match the option type and are only supported for strings and integers.",
        );
    }
  }
  const existing = await ctx.db
    .query("botCommands")
    .withIndex("by_application", (q) =>
      q.eq("applicationId", app._id).eq("serverId", serverId),
    )
    .take(101);
  for (const command of existing)
    if (!names.has(command.name)) await ctx.db.delete(command._id);
  const commands = [];
  for (const command of parsed.data) {
    const prior = existing.find((row) => row.name === command.name);
    if (prior) {
      await ctx.db.patch(prior._id, { ...command, updatedAt: Date.now() });
      commands.push({
        ...command,
        id: prior._id,
        applicationId: app._id,
        serverId,
      });
    } else {
      const id = await ctx.db.insert("botCommands", {
        ...command,
        applicationId: app._id,
        serverId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      commands.push({ ...command, id, applicationId: app._id, serverId });
    }
  }
  await botAudit(
    ctx,
    app._id,
    app.ownerId,
    "commands.replace",
    `${commands.length} commands; scope ${serverId ?? "global"}`,
  );
  return { commands };
}
async function userChannelAccess(
  ctx: QueryCtx | MutationCtx,
  channelId: Id<"channels">,
  userId: Id<"users">,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel) botFailure("NOT_FOUND", "Channel not found.");
  const access = await requireServerAccess(ctx, channel.serverId, userId);
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
    .collect();
  const permissions =
    access.server.ownerId === userId
      ? access.permissions
      : channelPermissions(
          access.permissions,
          access.member.roleIds,
          roles.find((r) => r.isDefault)?._id ?? null,
          channel.permissionOverwrites,
        );
  if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL))
    botFailure("FORBIDDEN", "You cannot view this channel.");
  return { ...access, channel, permissions };
}
export const list = query({
  args: { applicationId: v.id("botApplications") },
  handler: async (ctx, { applicationId }) => {
    await requireOwnedApplication(ctx, applicationId);
    return (
      await ctx.db
        .query("botCommands")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", applicationId),
        )
        .take(1000)
    ).map(commandObject);
  },
});
export const replace = mutation({
  args: {
    applicationId: v.id("botApplications"),
    serverId: v.optional(v.id("servers")),
    commands: v.array(botCommandValidator),
  },
  handler: async (ctx, { applicationId, serverId, commands }) => {
    const { app } = await requireOwnedApplication(ctx, applicationId);
    if (!(await rateLimit(ctx, `commands:${applicationId}`, 10, 60_000)))
      botFailure(
        "RATE_LIMITED",
        "Command registrations are limited to ten per minute.",
      );
    return await replaceApplicationCommands(ctx, app, commands, serverId);
  },
});
export const listForChannel = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const { id } = await requireUser(ctx);
    const access = await userChannelAccess(ctx, channelId, id);
    const installations = await ctx.db
      .query("botInstallations")
      .withIndex("by_server", (q) => q.eq("serverId", access.server._id))
      .take(100);
    const result = [];
    for (const installation of installations) {
      const app = await ctx.db.get(installation.applicationId);
      if (!app || !app.enabled || app.suspended || app.deletedAt) continue;
      try {
        await requireBotChannel(ctx, app, channelId, PERMISSIONS.VIEW_CHANNEL);
      } catch {
        continue;
      }
      const global = await listApplicationCommands(ctx, app);
      const scoped = await listApplicationCommands(ctx, app, access.server._id);
      const commands = new Map(
        [...global, ...scoped].map((command) => [command.name, command]),
      );
      for (const command of commands.values())
        if (
          command.permissions.every((permission) =>
            hasPermission(
              access.permissions,
              permission as (typeof ALL_PERMISSIONS)[number],
            ),
          )
        )
          result.push({ ...command, applicationName: app.name });
    }
    return result.sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.applicationName.localeCompare(b.applicationName),
    );
  },
});
export const invoke = mutation({
  args: {
    channelId: v.id("channels"),
    commandId: v.id("botCommands"),
    options: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  },
  handler: async (ctx, { channelId, commandId, options }) => {
    const { id, user } = await requireActiveUser(ctx);
    const access = await userChannelAccess(ctx, channelId, id);
    const command = await ctx.db.get(commandId);
    if (
      !command ||
      (command.serverId && command.serverId !== access.server._id)
    )
      botFailure("NOT_FOUND", "Command not found in this server.");
    if (!command.serverId) {
      const scoped = await ctx.db
        .query("botCommands")
        .withIndex("by_application", (q) =>
          q
            .eq("applicationId", command.applicationId)
            .eq("serverId", access.server._id),
        )
        .take(100);
      if (scoped.some((row) => row.name === command.name))
        botFailure(
          "CONFLICT",
          "This command has a server-specific version. Select it again.",
        );
    }
    const app = await ctx.db.get(command.applicationId);
    if (!app || !app.enabled || app.suspended || app.deletedAt)
      botFailure("FORBIDDEN", "This bot is unavailable.");
    await requireBotChannel(ctx, app, channelId, PERMISSIONS.VIEW_CHANNEL);
    if (
      !hasPermission(access.permissions, PERMISSIONS.SEND_MESSAGES) ||
      command.permissions.some(
        (permission) =>
          !hasPermission(
            access.permissions,
            permission as (typeof ALL_PERMISSIONS)[number],
          ),
      )
    )
      botFailure(
        "FORBIDDEN",
        "You do not have the permissions required for this command.",
      );
    if (
      (access.member.communicationDisabledUntil ?? 0) > Date.now() ||
      (await restrictionLevel(ctx, id)) >= 2
    )
      botFailure("FORBIDDEN", "You are restricted from using commands.");
    if (
      (access.channel.readOnly ||
        (access.server.locked &&
          (!access.server.lockedUntil ||
            access.server.lockedUntil > Date.now()))) &&
      !hasPermission(access.permissions, PERMISSIONS.MANAGE_MESSAGES)
    )
      botFailure(
        "FORBIDDEN",
        "Commands cannot be used in this channel right now.",
      );
    if (
      Object.keys(options).some(
        (name) => !command.options.some((option) => option.name === name),
      )
    )
      botFailure("INVALID_REQUEST", "Unknown command option.");
    for (const option of command.options) {
      const value = options[option.name];
      if (value === undefined) {
        if (option.required)
          botFailure("INVALID_REQUEST", `${option.name} is required.`);
        continue;
      }
      if (
        (option.type === "string" &&
          (typeof value !== "string" || value.length > 1000)) ||
        (option.type === "integer" &&
          (typeof value !== "number" || !Number.isSafeInteger(value))) ||
        (option.type === "boolean" && typeof value !== "boolean")
      )
        botFailure(
          "INVALID_REQUEST",
          `${option.name} must be a ${option.type}.`,
        );
      if (
        option.choices?.length &&
        !option.choices.some((choice) => choice.value === value)
      )
        botFailure(
          "INVALID_REQUEST",
          `${option.name} must match one of the available choices.`,
        );
      if (option.type === "user") {
        const targetId =
          typeof value === "string" ? ctx.db.normalizeId("users", value) : null;
        const member = targetId
          ? await ctx.db
              .query("serverMembers")
              .withIndex("by_server_user", (q) =>
                q.eq("serverId", access.server._id).eq("userId", targetId),
              )
              .unique()
          : null;
        if (!member)
          botFailure(
            "INVALID_REQUEST",
            `${option.name} must identify a server member.`,
          );
      }
    }
    if (!(await rateLimit(ctx, `interaction:${id}`, 10, 10_000)))
      botFailure("RATE_LIMITED", "Wait before using another command.");
    const now = Date.now();
    const interactionId = await ctx.db.insert("botInteractions", {
      applicationId: app._id,
      commandId,
      commandName: command.name,
      channelId,
      serverId: access.server._id,
      userId: id,
      optionsJson: JSON.stringify(options),
      createdAt: now,
      expiresAt: now + 15 * 60_000,
    });
    await emitBotEvent(ctx, {
      type: "interactionCreate",
      serverId: access.server._id,
      channelId,
      applicationId: app._id,
      data: {
        id: interactionId,
        commandId,
        commandName: command.name,
        channelId,
        serverId: access.server._id,
        user: { id, username: user.username ?? user.name ?? "member" },
        options,
        expiresAt: now + 15 * 60_000,
      },
    });
    await recordBotUsage(ctx, app._id, "commands");
    return { interactionId };
  },
});
export const ownInteractions = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const { id } = await requireUser(ctx);
    await userChannelAccess(ctx, channelId, id);
    const rows = await ctx.db
      .query("botInteractions")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", id).eq("channelId", channelId),
      )
      .order("desc")
      .take(30);
    return await Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        commandName: row.commandName,
        applicationName: (await ctx.db.get(row.applicationId))?.name ?? "Bot",
        status: row.respondedAt
          ? ("responded" as const)
          : row.expiresAt <= Date.now()
            ? ("expired" as const)
            : ("pending" as const),
        response: row.response?.ephemeral ? row.response : undefined,
        createdAt: row.createdAt,
      })),
    );
  },
});
