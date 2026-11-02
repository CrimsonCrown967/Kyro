import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  can,
  hydrateUsers,
  logAudit,
  requireServerAccess,
  requireUser,
  type Ctx,
} from "./lib";
import { parseMentions, PERMISSIONS } from "../lib/permissions";

const MAX_BLOCKED_WORDS = 100;
const MAX_WORD_LENGTH = 40;

export const DEFAULT_AUTOMOD = {
  enabled: true,
  blockedWords: [] as string[],
  blockInvites: true,
  blockLinks: false,
  maxMentions: 10,
  blockCaps: true,
  blockSpam: true,
  exemptRoleIds: [] as Id<"serverRoles">[],
  exemptChannelIds: [] as Id<"channels">[],
};

async function requireManager(ctx: Ctx, serverId: Id<"servers">) {
  const { id } = await requireUser(ctx);
  const access = await requireServerAccess(ctx, serverId, id);
  if (
    access.server.ownerId !== id &&
    !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
  ) {
    throw new Error("You don't have permission to edit AutoMod.");
  }
  return { id, server: access.server };
}

export const getSettings = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    await requireManager(ctx, serverId);
    const settings = await ctx.db
      .query("serverAutomod")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .unique();
    return {
      ...DEFAULT_AUTOMOD,
      ...(settings
        ? {
            enabled: settings.enabled,
            blockedWords: settings.blockedWords,
            blockInvites: settings.blockInvites,
            blockLinks: settings.blockLinks,
            maxMentions: settings.maxMentions,
            blockCaps: settings.blockCaps,
            blockSpam: settings.blockSpam,
            exemptRoleIds: settings.exemptRoleIds,
            exemptChannelIds: settings.exemptChannelIds,
          }
        : {}),
    };
  },
});

export const updateSettings = mutation({
  args: {
    serverId: v.id("servers"),
    enabled: v.boolean(),
    blockedWords: v.array(v.string()),
    blockInvites: v.boolean(),
    blockLinks: v.boolean(),
    maxMentions: v.number(),
    blockCaps: v.boolean(),
    blockSpam: v.boolean(),
    exemptRoleIds: v.array(v.id("serverRoles")),
    exemptChannelIds: v.array(v.id("channels")),
  },
  handler: async (ctx, args) => {
    const { id } = await requireManager(ctx, args.serverId);
    const words = Array.from(
      new Set(
        args.blockedWords
          .map((word) => word.trim().toLowerCase().slice(0, MAX_WORD_LENGTH))
          .filter(Boolean),
      ),
    ).slice(0, MAX_BLOCKED_WORDS);
    const maxMentions = Math.max(0, Math.min(Math.floor(args.maxMentions), 50));
    const exemptRoleIds = args.exemptRoleIds.slice(0, 25);
    const exemptChannelIds = args.exemptChannelIds.slice(0, 50);
    const existing = await ctx.db
      .query("serverAutomod")
      .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
      .unique();
    const payload = {
      serverId: args.serverId,
      enabled: args.enabled,
      blockedWords: words,
      blockInvites: args.blockInvites,
      blockLinks: args.blockLinks,
      maxMentions,
      blockCaps: args.blockCaps,
      blockSpam: args.blockSpam,
      exemptRoleIds,
      exemptChannelIds,
      updatedAt: Date.now(),
      updatedById: id,
    };
    if (existing) await ctx.db.patch(existing._id, payload);
    else await ctx.db.insert("serverAutomod", payload);
    await logAudit(ctx, {
      serverId: args.serverId,
      actorId: id,
      action: "automod.updated",
      targetType: "server",
      targetId: args.serverId,
      details: args.enabled ? "AutoMod settings saved" : "AutoMod disabled",
    });
  },
});

export const recentEvents = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (
      access.server.ownerId !== id &&
      !can(access.permissions, PERMISSIONS.BAN_MEMBERS) &&
      !can(access.permissions, PERMISSIONS.MANAGE_MESSAGES) &&
      !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
    ) {
      throw new Error("You don't have permission to view AutoMod activity.");
    }
    const events = await ctx.db
      .query("automodEvents")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .order("desc")
      .take(50);
    const users = await hydrateUsers(
      ctx,
      events.map((event) => event.userId),
      id,
    );
    const channels = await Promise.all(
      Array.from(new Set(events.map((event) => event.channelId))).map(
        (channelId) => ctx.db.get(channelId),
      ),
    );
    const channelNames = new Map(
      channels
        .filter((channel): channel is Doc<"channels"> => channel !== null)
        .map((channel) => [channel._id, channel.name]),
    );
    return events.map((event) => ({
      id: event._id as string,
      rule: event.rule,
      excerpt: event.excerpt,
      channelName: channelNames.get(event.channelId) ?? "unknown-channel",
      createdAt: event.createdAt,
      author: users.get(event.userId) ?? null,
    }));
  },
});

function escapeWord(word: string) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Runs before a message is stored. Returns a human-readable reason when a
 * rule matches; the caller rejects the send and records the event.
 */
export async function evaluateAutomod(
  ctx: Ctx,
  args: {
    server: Doc<"servers">;
    channel: Doc<"channels">;
    member: Doc<"serverMembers">;
    permissions: string[];
    userId: Id<"users">;
    content: string;
  },
): Promise<{ rule: string; reason: string } | null> {
  if (!args.content.trim()) return null;
  if (
    args.server.ownerId === args.userId ||
    can(args.permissions, PERMISSIONS.MANAGE_MESSAGES)
  ) {
    return null;
  }
  const settings = await ctx.db
    .query("serverAutomod")
    .withIndex("by_server", (q) => q.eq("serverId", args.server._id))
    .unique();
  if (!settings?.enabled) return null;
  if (settings.exemptChannelIds.includes(args.channel._id)) return null;
  if (
    settings.exemptRoleIds.some((roleId) =>
      args.member.roleIds.includes(roleId),
    )
  ) {
    return null;
  }

  const content = args.content;
  const lower = content.toLowerCase();

  for (const word of settings.blockedWords) {
    if (!word) continue;
    const pattern = new RegExp(`\\b${escapeWord(word)}\\b`, "i");
    if (pattern.test(lower)) {
      return {
        rule: "blocked-word",
        reason: `AutoMod stopped this message: "${word}" is a blocked word.`,
      };
    }
  }

  if (
    settings.blockInvites &&
    /(discord\.gg\/|discord(?:app)?\.com\/invite\/|kyro\.nylix\.org\/invite\/|kyro\.app\/invite\/)/i.test(
      content,
    )
  ) {
    return {
      rule: "invite-link",
      reason: "AutoMod stopped this message: invite links aren't allowed here.",
    };
  }

  if (settings.blockLinks && /https?:\/\/\S+/i.test(content)) {
    return {
      rule: "link",
      reason: "AutoMod stopped this message: links aren't allowed here.",
    };
  }

  if (settings.maxMentions > 0) {
    const mentions = new Set([
      ...parseMentions(content),
      ...(lower.includes("@everyone") ? ["everyone"] : []),
      ...(lower.includes("@here") ? ["here"] : []),
    ]);
    if (mentions.size > settings.maxMentions) {
      return {
        rule: "mention-spam",
        reason: `AutoMod stopped this message: up to ${settings.maxMentions} mentions are allowed.`,
      };
    }
  }

  if (settings.blockCaps) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    const uppercase = content.replace(/[^A-Z]/g, "");
    if (letters.length >= 12 && uppercase.length / letters.length >= 0.7) {
      return {
        rule: "excessive-caps",
        reason: "AutoMod stopped this message: too many capital letters.",
      };
    }
  }

  if (settings.blockSpam) {
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_container", (q) => q.eq("containerId", args.channel._id))
      .order("desc")
      .take(20);
    const normalized = lower.replace(/\s+/g, " ").trim();
    const repeats = recent.filter(
      (message) =>
        message.authorId === args.userId &&
        message.createdAt > Date.now() - 30_000 &&
        message.content.toLowerCase().replace(/\s+/g, " ").trim() ===
          normalized,
    ).length;
    if (repeats >= 2) {
      return {
        rule: "duplicate-spam",
        reason: "AutoMod stopped this message: don't repeat the same message.",
      };
    }
  }

  return null;
}

/** Records a blocked attempt so moderators can see what AutoMod caught. */
export async function recordAutomodEvent(
  ctx: MutationCtx,
  args: {
    serverId: Id<"servers">;
    channelId: Id<"channels">;
    userId: Id<"users">;
    rule: string;
    content: string;
  },
) {
  await ctx.db.insert("automodEvents", {
    serverId: args.serverId,
    channelId: args.channelId,
    userId: args.userId,
    rule: args.rule,
    excerpt: args.content.slice(0, 200),
    createdAt: Date.now(),
  });
}
