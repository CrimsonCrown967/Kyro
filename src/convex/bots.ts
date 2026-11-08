import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { customEmojiIds } from "../lib/emoji";
import { channelPermissions, PERMISSIONS } from "../lib/permissions";
import {
  can,
  logAudit,
  markRead,
  requireActiveUser,
  requireServerAccess,
  requireUser,
  restrictionLevel,
  type Ctx,
} from "./lib";
import { evaluateAutomod, recordAutomodEvent } from "./automod";

const COMMAND_NAME = /^[a-z0-9_-]{2,24}$/;
const MAX_SERVER_COMMANDS = 100;
const RATE_WINDOW_MS = 5_000;
const RATE_WINDOW_MESSAGES = 5;
const BUILT_INS = [
  { name: "help", description: "List commands available in this server." },
  { name: "ping", description: "Check whether Kyro Bot is awake." },
  { name: "coinflip", description: "Flip a coin." },
  { name: "roll", description: "Roll a die, for example /roll 20." },
  { name: "server", description: "Show a quick server summary." },
] as const;

async function requireBotManager(ctx: Ctx, serverId: Id<"servers">) {
  const { id } = await requireActiveUser(ctx);
  const access = await requireServerAccess(ctx, serverId, id);
  if (!can(access.permissions, PERMISSIONS.MANAGE_SERVER)) {
    throw new Error("You don't have permission to manage server bots.");
  }
  return { id, access };
}

async function commandChannelAccess(
  ctx: Ctx,
  channelId: Id<"channels">,
  userId: Id<"users">,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel) throw new Error("That channel no longer exists.");
  const access = await requireServerAccess(ctx, channel.serverId, userId);
  const defaultRole = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
    .filter((q) => q.eq(q.field("isDefault"), true))
    .first();
  const permissions =
    access.server.ownerId === userId
      ? access.permissions
      : channelPermissions(
          access.permissions,
          access.member.roleIds,
          defaultRole?._id ?? null,
          channel.permissionOverwrites,
        );
  if (!can(permissions, PERMISSIONS.VIEW_CHANNEL)) {
    throw new Error("You don't have permission to view this channel.");
  }
  return { channel, access, permissions };
}

async function requireUsableCustomEmojis(
  ctx: Ctx,
  userId: Id<"users">,
  content: string,
) {
  for (const rawId of customEmojiIds(content)) {
    const emojiId = ctx.db.normalizeId("serverEmojis", rawId);
    const emoji = emojiId ? await ctx.db.get(emojiId) : null;
    if (!emoji) throw new Error("That custom emoji is no longer available.");
    const membership = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", emoji.serverId).eq("userId", userId),
      )
      .unique();
    if (!membership) {
      throw new Error(
        "You must be a member of the emoji's community to use it.",
      );
    }
  }
}

async function requireServerOwnedCustomEmojis(
  ctx: Ctx,
  serverId: Id<"servers">,
  content: string,
) {
  for (const rawId of customEmojiIds(content)) {
    const emojiId = ctx.db.normalizeId("serverEmojis", rawId);
    const emoji = emojiId ? await ctx.db.get(emojiId) : null;
    if (!emoji || emoji.serverId !== serverId) {
      throw new Error("Bot responses can only use emojis from this community.");
    }
  }
}

export const listForChannel = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const { id } = await requireUser(ctx);
    const { channel } = await commandChannelAccess(ctx, channelId, id);
    const custom = await ctx.db
      .query("serverBotCommands")
      .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
      .take(MAX_SERVER_COMMANDS);
    return [
      ...BUILT_INS.map((command) => ({ ...command, builtIn: true as const })),
      ...custom
        .filter((command) => command.enabled)
        .map((command) => ({
          id: command._id as string,
          name: command.name,
          description: command.description,
          builtIn: false as const,
        })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listForServer = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    await requireBotManager(ctx, serverId);
    const commands = await ctx.db
      .query("serverBotCommands")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .take(MAX_SERVER_COMMANDS);
    return {
      canManage: true,
      builtIns: BUILT_INS,
      commands: commands.map((command) => ({
        id: command._id as string,
        name: command.name,
        description: command.description,
        response: command.response,
        enabled: command.enabled,
      })),
    };
  },
});

export const create = mutation({
  args: {
    serverId: v.id("servers"),
    name: v.string(),
    description: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const { id } = await requireBotManager(ctx, args.serverId);
    const name = args.name.trim().toLowerCase();
    if (!COMMAND_NAME.test(name)) {
      throw new Error(
        "Command names use 2–24 lowercase letters, numbers, - or _.",
      );
    }
    if (BUILT_INS.some((command) => command.name === name)) {
      throw new Error("That name belongs to a built-in command.");
    }
    const commands = await ctx.db
      .query("serverBotCommands")
      .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
      .take(MAX_SERVER_COMMANDS);
    if (commands.length >= MAX_SERVER_COMMANDS) {
      throw new Error(
        `A community can have up to ${MAX_SERVER_COMMANDS} commands.`,
      );
    }
    const response = args.response.trim().slice(0, 1800);
    if (!response) throw new Error("Give the bot a response.");
    await requireServerOwnedCustomEmojis(ctx, args.serverId, response);
    const existing = await ctx.db
      .query("serverBotCommands")
      .withIndex("by_server_name", (q) =>
        q.eq("serverId", args.serverId).eq("name", name),
      )
      .unique();
    if (existing) throw new Error("That command already exists.");
    const now = Date.now();
    const commandId = await ctx.db.insert("serverBotCommands", {
      serverId: args.serverId,
      name,
      description: args.description.trim().slice(0, 120) || `Run /${name}`,
      response,
      enabled: true,
      createdById: id,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, {
      serverId: args.serverId,
      actorId: id,
      action: "bot.command_create",
      targetType: "bot_command",
      targetId: commandId,
      details: `Created /${name}`,
    });
    return commandId;
  },
});

export const update = mutation({
  args: {
    commandId: v.id("serverBotCommands"),
    description: v.optional(v.string()),
    response: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command) throw new Error("That command no longer exists.");
    const { id } = await requireBotManager(ctx, command.serverId);
    const patch: {
      description?: string;
      response?: string;
      enabled?: boolean;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.description !== undefined) {
      patch.description = args.description.trim().slice(0, 120);
    }
    if (args.response !== undefined) {
      const response = args.response.trim().slice(0, 1800);
      if (!response) throw new Error("The response can't be empty.");
      await requireServerOwnedCustomEmojis(ctx, command.serverId, response);
      patch.response = response;
    }
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    await ctx.db.patch(args.commandId, patch);
    await logAudit(ctx, {
      serverId: command.serverId,
      actorId: id,
      action: "bot.command_update",
      targetType: "bot_command",
      targetId: args.commandId,
      details: `Updated /${command.name}`,
    });
  },
});

export const remove = mutation({
  args: { commandId: v.id("serverBotCommands") },
  handler: async (ctx, { commandId }) => {
    const command = await ctx.db.get(commandId);
    if (!command) return;
    const { id } = await requireBotManager(ctx, command.serverId);
    await ctx.db.delete(commandId);
    await logAudit(ctx, {
      serverId: command.serverId,
      actorId: id,
      action: "bot.command_delete",
      targetType: "bot_command",
      targetId: commandId,
      details: `Deleted /${command.name}`,
    });
  },
});

export const execute = mutation({
  args: { channelId: v.id("channels"), commandLine: v.string() },
  handler: async (ctx, { channelId, commandLine }) => {
    const { id, user } = await requireActiveUser(ctx);
    const { channel, access, permissions } = await commandChannelAccess(
      ctx,
      channelId,
      id,
    );
    if (!can(permissions, PERMISSIONS.SEND_MESSAGES)) {
      throw new Error("You don't have permission to send messages here.");
    }
    if (channel.readOnly && !can(permissions, PERMISSIONS.MANAGE_MESSAGES)) {
      throw new Error("This channel is read-only.");
    }
    const timeoutUntil = access.member.communicationDisabledUntil ?? 0;
    if (
      timeoutUntil > Date.now() &&
      access.server.ownerId !== id &&
      !can(permissions, PERMISSIONS.MANAGE_MESSAGES)
    ) {
      throw new Error(
        `You're timed out in this community until ${new Date(timeoutUntil).toUTCString()}.`,
      );
    }
    if ((await restrictionLevel(ctx, id)) >= 2) {
      throw new Error("Your account is currently restricted from messaging.");
    }

    const lockedNow =
      access.server.locked === true &&
      (access.server.lockedUntil === undefined ||
        access.server.lockedUntil > Date.now());
    if (lockedNow && !can(permissions, PERMISSIONS.MANAGE_MESSAGES)) {
      throw new Error(
        "This community is locked — only staff can post right now.",
      );
    }
    if (
      access.server.rulesChannelId === channel._id &&
      access.server.ownerId !== id &&
      !can(permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error(
        "Only people who can manage this server can post in the rules channel.",
      );
    }
    const verification = access.server.verificationLevel ?? "none";
    if (verification !== "none") {
      const thresholds = {
        low: 5 * 60 * 1000,
        medium: 60 * 60 * 1000,
        high: 24 * 60 * 60 * 1000,
      } as const;
      const exempt =
        access.server.ownerId === id ||
        access.member.roleIds.length > 0 ||
        can(permissions, PERMISSIONS.MANAGE_MESSAGES);
      const accountAge = Date.now() - (user.createdAt ?? Date.now());
      if (!exempt && accountAge < thresholds[verification]) {
        throw new Error(
          verification === "low"
            ? "This community needs accounts that are at least 5 minutes old to talk."
            : verification === "medium"
              ? "This community needs accounts that are at least 1 hour old to talk."
              : "This community needs accounts that are at least 1 day old to talk.",
        );
      }
    }

    const clean = commandLine.trim().slice(0, 500);
    const match = clean.match(/^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i);
    if (!match)
      throw new Error("Commands start with / followed by a command name.");
    const name = match[1].toLowerCase();
    const args = (match[2] ?? "").trim();
    await requireUsableCustomEmojis(ctx, id, clean);
    if (
      /(^|\s)@(everyone|here)\b/i.test(clean) &&
      !can(permissions, PERMISSIONS.MENTION_EVERYONE)
    ) {
      throw new Error(
        "You don't have permission to mention @everyone or @here.",
      );
    }
    if (channel.slowMode && channel.slowMode > 0) {
      const recent = await ctx.db
        .query("messages")
        .withIndex("by_container", (q) => q.eq("containerId", channelId))
        .order("desc")
        .take(30);
      const mine = recent.find((message) => message.authorId === id);
      if (mine) {
        const waitMs = channel.slowMode * 1000 - (Date.now() - mine.createdAt);
        if (waitMs > 0) {
          throw new Error(
            `Slow mode is on — wait ${Math.ceil(waitMs / 1000)}s before posting again.`,
          );
        }
      }
    }
    const recentMine = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("authorId", id))
      .order("desc")
      .take(RATE_WINDOW_MESSAGES);
    const inWindow = recentMine.filter(
      (message) => message.createdAt > Date.now() - RATE_WINDOW_MS,
    ).length;
    if (inWindow + 2 > RATE_WINDOW_MESSAGES) {
      throw new Error("You're sending messages too quickly. Take a breath.");
    }
    const automod = await evaluateAutomod(ctx, {
      server: access.server,
      channel,
      member: access.member,
      permissions,
      userId: id,
      content: clean,
    });
    if (automod) {
      await recordAutomodEvent(ctx, {
        serverId: access.server._id,
        channelId,
        userId: id,
        rule: automod.rule,
        content: clean,
      });
      return { messageId: null, blocked: automod.reason };
    }
    const custom = await ctx.db
      .query("serverBotCommands")
      .withIndex("by_server_name", (q) =>
        q.eq("serverId", channel.serverId).eq("name", name),
      )
      .unique();
    if (custom && !custom.enabled) throw new Error("That command is disabled.");

    const server = access.server;
    const displayName = user.name ?? user.username ?? "member";
    let response: string;
    if (custom) {
      response = custom.response
        .split("{user}")
        .join(displayName)
        .split("{username}")
        .join(user.username ? `@${user.username}` : displayName)
        .split("{server}")
        .join(server.name)
        .split("{args}")
        .join(args || "(no arguments)");
    } else if (name === "help") {
      const customCommands = await ctx.db
        .query("serverBotCommands")
        .withIndex("by_server", (q) => q.eq("serverId", channel.serverId))
        .take(MAX_SERVER_COMMANDS);
      response = [
        "**Kyro Bot commands**",
        ...BUILT_INS.map(
          (command) => `\`/${command.name}\` — ${command.description}`,
        ),
        ...customCommands
          .filter((command) => command.enabled)
          .map((command) => `\`/${command.name}\` — ${command.description}`),
      ].join("\n");
    } else if (name === "ping") {
      response = "Pong! Kyro Bot is online.";
    } else if (name === "coinflip") {
      response = `🪙 **${Date.now() % 2 === 0 ? "Heads" : "Tails"}!**`;
    } else if (name === "roll") {
      const sides = Math.max(2, Math.min(Number.parseInt(args, 10) || 6, 1000));
      response = `🎲 ${displayName} rolled **${(Date.now() % sides) + 1}** on a d${sides}.`;
    } else if (name === "server") {
      const members = await ctx.db
        .query("serverMembers")
        .withIndex("by_server", (q) => q.eq("serverId", server._id))
        .collect();
      response = `**${server.name}** · ${members.length} member${members.length === 1 ? "" : "s"} · created ${new Date(server.createdAt).toISOString().slice(0, 10)}`;
    } else {
      throw new Error(`Unknown command /${name}. Try /help.`);
    }

    const now = Date.now();
    await ctx.db.insert("messages", {
      containerType: "channel",
      containerId: channelId,
      authorId: id,
      content: clean,
      kind: "bot_command",
      createdAt: now,
    });
    const responseId = await ctx.db.insert("messages", {
      containerType: "channel",
      containerId: channelId,
      authorId: id,
      content: response.slice(0, 2000),
      kind: "bot_response",
      botName: custom ? `${server.name} Bot` : "Kyro Bot",
      botCommand: name,
      createdAt: now + 1,
    });
    await ctx.db.patch(channelId, {
      lastMessageAt: now + 1,
      lastMessageSenderId: id,
    });
    await markRead(ctx, id, channelId, now + 1);
    await logAudit(ctx, {
      serverId: server._id,
      actorId: id,
      action: "bot.command",
      targetType: "channel",
      targetId: channelId,
      details: `/${name}`,
    });
    return { messageId: responseId, blocked: null };
  },
});
