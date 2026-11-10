import { z } from "zod";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  authenticateBot,
  requireBotChannel,
  requireBotServer,
  validateBotPermissions,
  botAudit,
} from "./botCore";
import {
  PERMISSIONS,
  parseRoleMentionIds,
  type Permission,
} from "../lib/permissions";
import { customEmojiIds } from "../lib/emoji";
import { botEmbedSchema, botMessageSchema } from "../lib/botContracts";
import { botFailure, rateLimit, recordBotUsage } from "./botRuntimeLib";
import { emitBotEvent } from "./botEventHooks";
import { acknowledgeEvents, pollEvents } from "./botEvents";
import {
  listApplicationCommands,
  replaceApplicationCommands,
} from "./botCommands";
import { evaluateAutomod } from "./automod";
import { deleteChannelData, deleteMessageData } from "./cleanup";
import {
  claimUpload,
  requireOwnedUpload,
  isAllowedUploadType,
  MAX_UPLOAD_BYTES,
} from "./uploadSecurity";
import { logAudit } from "./lib";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    botFailure(
      "INVALID_REQUEST",
      result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .slice(0, 4)
        .join("; "),
    );
  return result.data;
}
function normalizedId<
  T extends
    | "servers"
    | "channels"
    | "messages"
    | "users"
    | "serverRoles"
    | "botInteractions",
>(ctx: MutationCtx, table: T, value: string): Id<T> {
  const id = ctx.db.normalizeId(table, value);
  if (!id) botFailure("NOT_FOUND", "Resource not found.");
  return id;
}
function requirePermission(permissions: string[], permission: Permission) {
  if (!permissions.includes(permission))
    botFailure("FORBIDDEN", `Missing permission: ${permission}.`);
}
export async function publicBotUser(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return { id: userId, username: "deleted-user", bot: false };
  return {
    id: user._id,
    username: user.username ?? user.name ?? "member",
    name: user.name,
    avatar: user.avatarStorageId
      ? await ctx.storage.getUrl(user.avatarStorageId)
      : user.image,
    bot: user.isBot === true,
  };
}
export async function messageObject(
  ctx: MutationCtx,
  message: Doc<"messages">,
) {
  const channelId = ctx.db.normalizeId("channels", message.containerId);
  const channel = channelId ? await ctx.db.get(channelId) : null;
  return {
    id: message._id,
    channelId: message.containerId,
    serverId: channel?.serverId,
    author: await publicBotUser(ctx, message.authorId),
    content: message.content,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    replyToId: message.replyToId,
    embeds: message.embeds,
    attachments: await Promise.all(
      (message.attachments ?? []).map(async (a) => ({
        ...a,
        url: await ctx.storage.getUrl(a.storageId),
      })),
    ),
  };
}
async function validateContent(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  access: Awaited<ReturnType<typeof requireBotChannel>>,
  content: string,
) {
  if ((access.member.communicationDisabledUntil ?? 0) > Date.now())
    botFailure("FORBIDDEN", "This bot is timed out in this server.");
  if (
    (access.channel.readOnly ||
      (access.server.locked &&
        (!access.server.lockedUntil ||
          access.server.lockedUntil > Date.now()))) &&
    !access.permissions.includes(PERMISSIONS.MANAGE_MESSAGES)
  )
    botFailure("FORBIDDEN", "This channel is currently read-only.");
  if (
    access.server.rulesChannelId === access.channel._id &&
    !access.permissions.includes(PERMISSIONS.MANAGE_SERVER)
  )
    botFailure(
      "FORBIDDEN",
      "Posting in the rules channel requires Manage Server.",
    );
  if (/(^|\s)@(everyone|here)\b/i.test(content))
    requirePermission(access.permissions, PERMISSIONS.MENTION_EVERYONE);
  for (const raw of parseRoleMentionIds(content)) {
    const roleId = normalizedId(ctx, "serverRoles", raw);
    const role = await ctx.db.get(roleId);
    if (!role || role.serverId !== access.server._id)
      botFailure("INVALID_REQUEST", "Role mention is not in this server.");
    if (!role.mentionable)
      requirePermission(access.permissions, PERMISSIONS.MENTION_EVERYONE);
  }
  for (const raw of customEmojiIds(content)) {
    const emojiId = ctx.db.normalizeId("serverEmojis", raw);
    const emoji = emojiId ? await ctx.db.get(emojiId) : null;
    if (!emoji) botFailure("INVALID_REQUEST", "Custom emoji not found.");
    if (emoji.serverId !== access.server._id) {
      requirePermission(access.permissions, PERMISSIONS.USE_EXTERNAL_EMOJIS);
      await requireBotServer(ctx, app, emoji.serverId);
    }
  }
  const blocked = await evaluateAutomod(ctx, {
    server: access.server,
    channel: access.channel,
    member: access.member,
    permissions: access.permissions,
    userId: app.botUserId,
    content,
  });
  if (blocked) botFailure("AUTOMOD_BLOCKED", blocked.reason);
}
export async function sendBotMessage(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  channelId: Id<"channels">,
  input: unknown,
) {
  const data = parse(botMessageSchema, input);
  const access = await requireBotChannel(
    ctx,
    app,
    channelId,
    PERMISSIONS.SEND_MESSAGES,
  );
  if (access.channel.kind === "voice" || access.channel.kind === "forum")
    botFailure("INVALID_REQUEST", "Messages require a text channel.");
  await validateContent(
    ctx,
    app,
    access,
    [
      data.content,
      ...(data.embeds ?? []).map((embed) =>
        [
          embed.title,
          embed.description,
          ...(embed.fields ?? []).map(
            (field) => `${field.name} ${field.value}`,
          ),
        ]
          .filter(Boolean)
          .join(" "),
      ),
    ].join(" "),
  );
  if (data.clientId) {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_container_client", (q) =>
        q.eq("containerId", channelId).eq("clientId", data.clientId),
      )
      .collect();
    const own = existing.find((row) => row.authorId === app.botUserId);
    if (own) return await messageObject(ctx, own);
  }
  if (!(await rateLimit(ctx, `message:${app._id}:${channelId}`, 5, 5000)))
    botFailure(
      "RATE_LIMITED",
      "Message rate limit exceeded. Retry in five seconds.",
    );
  if (access.channel.slowMode) {
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_container", (q) => q.eq("containerId", channelId))
      .order("desc")
      .take(100);
    const mine = recent.find((message) => message.authorId === app.botUserId);
    if (mine && Date.now() - mine.createdAt < access.channel.slowMode * 1000)
      botFailure("RATE_LIMITED", "Channel slow mode is active.");
  }
  const replyToId = data.replyToId
    ? normalizedId(ctx, "messages", data.replyToId)
    : undefined;
  if (replyToId) {
    const reply = await ctx.db.get(replyToId);
    if (
      !reply ||
      reply.containerType !== "channel" ||
      reply.containerId !== channelId
    )
      botFailure(
        "INVALID_REQUEST",
        "Reply must reference a message in this channel.",
      );
  }
  const attachments = [];
  if (data.attachments?.length)
    requirePermission(access.permissions, PERMISSIONS.ATTACH_FILES);
  for (const input of data.attachments ?? []) {
    const storageId = ctx.db.system.normalizeId("_storage", input.storageId);
    if (!storageId) botFailure("INVALID_REQUEST", "Invalid attachment ID.");
    const upload = await requireOwnedUpload(ctx, app.botUserId, storageId);
    if (upload.claimType)
      botFailure("INVALID_REQUEST", "Attachment is already in use.");
    attachments.push({
      storageId,
      name: upload.name,
      size: upload.size,
      mimeType: upload.mimeType,
    });
  }
  const now = Date.now();
  const id = await ctx.db.insert("messages", {
    containerType: "channel",
    containerId: channelId,
    authorId: app.botUserId,
    content: data.content.trim(),
    createdAt: now,
    replyToId,
    clientId: data.clientId,
    embeds: data.embeds,
    attachments: attachments.length ? attachments : undefined,
    kind: "bot_response",
    botName: (await ctx.db.get(app.botUserId))?.name ?? app.name,
  });
  for (const attachment of attachments)
    await claimUpload(ctx, app.botUserId, attachment.storageId, "message", id);
  await ctx.db.patch(channelId, {
    lastMessageAt: now,
    lastMessageSenderId: app.botUserId,
  });
  const message = (await ctx.db.get(id))!;
  const result = await messageObject(ctx, message);
  await emitBotEvent(ctx, {
    type: "messageCreate",
    serverId: access.server._id,
    channelId,
    data: result,
  });
  return result;
}
async function roleContext(
  ctx: MutationCtx,
  app: Doc<"botApplications">,
  serverId: Id<"servers">,
  permission: Permission,
) {
  const access = await requireBotServer(ctx, app, serverId);
  requirePermission(access.permissions, permission);
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", serverId))
    .collect();
  const top = Math.max(
    0,
    ...roles
      .filter((role) => access.member.roleIds.includes(role._id))
      .map((role) => role.position),
  );
  return { ...access, roles, top };
}
async function editableRole(
  ctx: MutationCtx,
  access: Awaited<ReturnType<typeof roleContext>>,
  roleId: Id<"serverRoles">,
) {
  const role = access.roles.find((item) => item._id === roleId);
  if (!role || role.isDefault || role.position >= access.top)
    botFailure(
      "FORBIDDEN",
      "Bots can manage only roles below their highest role.",
    );
  const installs = await ctx.db
    .query("botInstallations")
    .withIndex("by_server", (q) => q.eq("serverId", access.server._id))
    .collect();
  if (installs.some((install) => install.roleId === roleId))
    botFailure(
      "FORBIDDEN",
      "Bot installation roles are managed by server administrators.",
    );
  return role;
}
function delegatePermissions(
  access: Awaited<ReturnType<typeof roleContext>>,
  permissions: string[],
) {
  const valid = validateBotPermissions(permissions);
  if (valid.some((permission) => !access.permissions.includes(permission)))
    botFailure(
      "FORBIDDEN",
      "Bots may grant only permissions they currently hold.",
    );
  return valid;
}
export const gate = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const app = await authenticateBot(ctx, tokenHash);
    const allowed = await rateLimit(ctx, `api:${app._id}`, 120, 60_000);
    await recordBotUsage(ctx, app._id, "requests");
    await ctx.db.patch(app._id, { apiRequests: (app.apiRequests ?? 0) + 1 });
    return { applicationId: app._id, allowed };
  },
});
export const authorizeUpload = internalMutation({
  args: { tokenHash: v.string(), channelId: v.string() },
  handler: async (ctx, { tokenHash, channelId: rawChannelId }) => {
    const channelId = normalizedId(ctx, "channels", rawChannelId);
    const app = await authenticateBot(ctx, tokenHash);
    const access = await requireBotChannel(
      ctx,
      app,
      channelId,
      PERMISSIONS.ATTACH_FILES,
    );
    requirePermission(access.permissions, PERMISSIONS.SEND_MESSAGES);
    if (!(await rateLimit(ctx, `upload:${app._id}`, 10, 60_000)))
      botFailure("RATE_LIMITED", "Uploads are limited to ten per minute.");
    return channelId;
  },
});
export const registerAttachment = internalMutation({
  args: {
    tokenHash: v.string(),
    channelId: v.id("channels"),
    storageId: v.id("_storage"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const app = await authenticateBot(ctx, args.tokenHash);
    await requireBotChannel(ctx, app, args.channelId, PERMISSIONS.ATTACH_FILES);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (
      !metadata ||
      metadata.size > MAX_UPLOAD_BYTES ||
      !isAllowedUploadType(metadata.contentType ?? "")
    )
      botFailure("INVALID_REQUEST", "Invalid attachment type or size.");
    let name: string;
    try {
      name = decodeURIComponent(args.name)
        .split("\u0000").join("")
        .replace(/[\r\n]/g, "")
        .slice(0, 120);
    } catch {
      botFailure("INVALID_REQUEST", "Invalid attachment filename.");
    }
    const data = {
      storageId: args.storageId,
      name: name || "attachment",
      size: metadata.size,
      mimeType: metadata.contentType!,
    };
    await ctx.db.insert("uploads", {
      ...data,
      ownerId: app.botUserId,
      createdAt: Date.now(),
    });
    return data;
  },
});
export const execute = internalMutation({
  args: {
    tokenHash: v.string(),
    method: v.string(),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    bodyJson: v.string(),
  },
  handler: async (ctx, args) => {
    const app = await authenticateBot(ctx, args.tokenHash);
    const path = args.path.split("/").filter(Boolean);
    const body: unknown = JSON.parse(args.bodyJson);
    const method = args.method;
    if (args.path === "/users/@me" && method === "GET")
      return {
        ...(await publicBotUser(ctx, app.botUserId)),
        applicationId: app._id,
      };
    if (args.path === "/gateway/heartbeat" && method === "POST") {
      const now = Date.now();
      await ctx.db.patch(app._id, { lastSeen: now });
      await ctx.db.patch(app.botUserId, { lastSeen: now, status: "online" });
      return { online: true, timestamp: now };
    }
    if (args.path === "/events" && method === "GET")
      return await pollEvents(
        ctx,
        app,
        parse(
          z.coerce.number().int().min(1).max(50).default(50),
          args.query.limit,
        ),
      );
    if (args.path === "/events/ack" && method === "POST")
      return await acknowledgeEvents(
        ctx,
        app,
        parse(
          z.object({ eventIds: z.array(z.string()).max(100) }).strict(),
          body,
        ).eventIds,
      );
    if (args.path === "/applications/@me/commands") {
      if (method === "GET")
        return {
          commands: await listApplicationCommands(
            ctx,
            app,
            args.query.serverId
              ? normalizedId(ctx, "servers", args.query.serverId)
              : undefined,
          ),
        };
      if (method === "PUT") {
        const input = parse(
          z
            .object({
              serverId: z.string().optional(),
              commands: z.array(z.unknown()).max(100),
            })
            .strict(),
          body,
        );
        return await replaceApplicationCommands(
          ctx,
          app,
          input.commands,
          input.serverId
            ? normalizedId(ctx, "servers", input.serverId)
            : undefined,
        );
      }
    }
    if (
      path[0] === "interactions" &&
      path.length === 3 &&
      path[2] === "responses" &&
      method === "POST"
    ) {
      const id = normalizedId(ctx, "botInteractions", path[1]);
      const interaction = await ctx.db.get(id);
      if (!interaction || interaction.applicationId !== app._id)
        botFailure("NOT_FOUND", "Interaction not found.");
      await requireBotChannel(
        ctx,
        app,
        interaction.channelId,
        PERMISSIONS.SEND_MESSAGES,
      );
      const input = parse(
        z
          .object({
            content: z.string().max(2000).default(""),
            ephemeral: z.boolean().default(false),
            embeds: z.array(botEmbedSchema).max(4).optional(),
          })
          .strict()
          .refine(
            (data) => data.content.trim() || data.embeds?.length,
            "Response requires content.",
          ),
        body,
      );
      if (interaction.respondedAt) {
        if (JSON.stringify(interaction.response) === JSON.stringify(input))
          return {
            id,
            messageId: interaction.responseMessageId,
            ephemeral: input.ephemeral,
          };
        botFailure("CONFLICT", "This interaction has already been answered.");
      }
      if (interaction.expiresAt <= Date.now())
        botFailure("EXPIRED", "This interaction has expired.");
      const access = await requireBotChannel(
        ctx,
        app,
        interaction.channelId,
        PERMISSIONS.SEND_MESSAGES,
      );
      await validateContent(ctx, app, access, input.content);
      const message = input.ephemeral
        ? null
        : await sendBotMessage(ctx, app, interaction.channelId, {
            content: input.content,
            embeds: input.embeds,
          });
      await ctx.db.patch(id, {
        response: input,
        respondedAt: Date.now(),
        responseMessageId: message?.id,
      });
      return { id, messageId: message?.id, ephemeral: input.ephemeral };
    }
    if (path[0] === "channels" && path[1]) {
      const channelId = normalizedId(ctx, "channels", path[1]);
      const access = await requireBotChannel(ctx, app, channelId);
      if (path.length === 2 && method === "GET")
        return {
          id: channelId,
          serverId: access.server._id,
          name: access.channel.name,
          topic: access.channel.topic,
          kind: access.channel.kind ?? "text",
          permissions: access.permissions,
        };
      if (path.length === 2 && method === "DELETE") {
        requirePermission(access.permissions, PERMISSIONS.MANAGE_CHANNELS);
        await deleteChannelData(ctx, access.channel);
        return { deleted: true };
      }
      if (path[2] === "messages" && path.length === 3) {
        if (method === "POST")
          return await sendBotMessage(ctx, app, channelId, body);
        if (method === "GET") {
          requirePermission(
            access.permissions,
            PERMISSIONS.READ_MESSAGE_HISTORY,
          );
          const limit = parse(
            z.coerce.number().int().min(1).max(100).default(50),
            args.query.limit,
          );
          const before = args.query.before
            ? parse(z.coerce.number().finite().positive(), args.query.before)
            : undefined;
          const rows = await ctx.db
            .query("messages")
            .withIndex("by_container", (q) =>
              before
                ? q.eq("containerId", channelId).lt("createdAt", before)
                : q.eq("containerId", channelId),
            )
            .order("desc")
            .take(limit + 1);
          return {
            messages: await Promise.all(
              rows.slice(0, limit).map((row) => messageObject(ctx, row)),
            ),
            hasMore: rows.length > limit,
          };
        }
      }
      if (path[2] === "messages" && path[3]) {
        const messageId = normalizedId(ctx, "messages", path[3]);
        const message = await ctx.db.get(messageId);
        if (
          !message ||
          message.containerType !== "channel" ||
          message.containerId !== channelId
        )
          botFailure("NOT_FOUND", "Message not found.");
        if (path.length === 4 && method === "GET") {
          requirePermission(
            access.permissions,
            PERMISSIONS.READ_MESSAGE_HISTORY,
          );
          return await messageObject(ctx, message);
        }
        if (path.length === 4 && method === "PATCH") {
          if (message.authorId !== app.botUserId)
            botFailure("FORBIDDEN", "Bots can edit only their own messages.");
          requirePermission(access.permissions, PERMISSIONS.SEND_MESSAGES);
          const data = parse(
            z
              .object({
                content: z.string().max(2000).optional(),
                embeds: z.array(botEmbedSchema).max(4).optional(),
              })
              .strict()
              .refine(
                (value) =>
                  value.content !== undefined || value.embeds !== undefined,
                "Provide content or embeds.",
              ),
            body,
          );
          const content = data.content ?? message.content;
          const embeds = data.embeds ?? message.embeds;
          if (
            !content.trim() &&
            !embeds?.length &&
            !message.attachments?.length
          )
            botFailure(
              "INVALID_REQUEST",
              "Messages need content, embeds, or attachments.",
            );
          await validateContent(
            ctx,
            app,
            access,
            [
              content,
              ...(embeds ?? []).map((embed) => JSON.stringify(embed)),
            ].join(" "),
          );
          await ctx.db.patch(messageId, { ...data, editedAt: Date.now() });
          const result = await messageObject(
            ctx,
            (await ctx.db.get(messageId))!,
          );
          await emitBotEvent(ctx, {
            type: "messageUpdate",
            serverId: access.server._id,
            channelId,
            data: result,
          });
          return result;
        }
        if (path.length === 4 && method === "DELETE") {
          if (message.authorId !== app.botUserId)
            requirePermission(access.permissions, PERMISSIONS.MANAGE_MESSAGES);
          await deleteMessageData(ctx, message);
          await botAudit(
            ctx,
            app._id,
            app.botUserId,
            "message.delete",
            messageId,
          );
          return { deleted: true };
        }
        if (path[4] === "reactions" && path.length === 5 && method === "POST") {
          requirePermission(access.permissions, PERMISSIONS.ADD_REACTIONS);
          const { emoji } = parse(
            z.object({ emoji: z.string().min(1).max(100) }).strict(),
            body,
          );
          await validateContent(ctx, app, access, emoji);
          const existing = await ctx.db
            .query("reactions")
            .withIndex("by_message_user", (q) =>
              q.eq("messageId", messageId).eq("userId", app.botUserId),
            )
            .collect();
          if (!existing.some((row) => row.emoji === emoji))
            await ctx.db.insert("reactions", {
              messageId,
              userId: app.botUserId,
              emoji,
              createdAt: Date.now(),
            });
          return { added: true };
        }
      }
      if (path[2] === "polls" && path.length === 3 && method === "POST") {
        requirePermission(access.permissions, PERMISSIONS.CREATE_POLLS);
        const data = parse(
          z
            .object({
              question: z.string().trim().min(3).max(200),
              options: z
                .array(z.string().trim().min(1).max(100))
                .min(2)
                .max(10),
              multiple: z.boolean().default(false),
              durationMinutes: z.number().int().min(5).max(10080).optional(),
            })
            .strict(),
          body,
        );
        if (new Set(data.options).size !== data.options.length)
          botFailure("INVALID_REQUEST", "Poll options must be distinct.");
        await validateContent(
          ctx,
          app,
          access,
          [data.question, ...data.options].join(" "),
        );
        const message = await sendBotMessage(ctx, app, channelId, {
          content: data.question,
        });
        const pollId = await ctx.db.insert("polls", {
          messageId: message.id,
          createdById: app.botUserId,
          question: data.question,
          options: data.options.map((text, index) => ({
            id: `option-${index + 1}`,
            text,
          })),
          multiple: data.multiple,
          createdAt: Date.now(),
          closesAt: data.durationMinutes
            ? Date.now() + data.durationMinutes * 60_000
            : undefined,
        });
        return { id: pollId, message };
      }
    }
    if (path[0] === "servers" && path[1]) {
      const serverId = normalizedId(ctx, "servers", path[1]);
      const access = await requireBotServer(ctx, app, serverId);
      if (path.length === 2 && method === "GET") {
        const members = await ctx.db
          .query("serverMembers")
          .withIndex("by_server", (q) => q.eq("serverId", serverId))
          .collect();
        return {
          id: serverId,
          name: access.server.name,
          description: access.server.description,
          ownerId: access.server.ownerId,
          createdAt: access.server.createdAt,
          memberCount: members.length,
        };
      }
      if (path[2] === "channels" && path.length === 3 && method === "GET") {
        const channels = await ctx.db
          .query("channels")
          .withIndex("by_server", (q) => q.eq("serverId", serverId))
          .collect();
        const visible = [];
        for (const channel of channels) {
          try {
            const a = await requireBotChannel(ctx, app, channel._id);
            visible.push({
              id: channel._id,
              serverId,
              name: channel.name,
              topic: channel.topic,
              kind: channel.kind ?? "text",
              permissions: a.permissions,
            });
          } catch {
            /* Denied channels are private. */
          }
        }
        return { channels: visible };
      }
      if (path[2] === "channels" && path.length === 3 && method === "POST") {
        requirePermission(access.permissions, PERMISSIONS.MANAGE_CHANNELS);
        const data = parse(
          z
            .object({
              name: z
                .string()
                .trim()
                .regex(/^[a-z0-9_-]{1,80}$/),
              topic: z.string().max(500).optional(),
            })
            .strict(),
          body,
        );
        const channels = await ctx.db
          .query("channels")
          .withIndex("by_server", (q) => q.eq("serverId", serverId))
          .take(500);
        if (channels.length >= 500)
          botFailure("INVALID_REQUEST", "Server channel limit reached.");
        const id = await ctx.db.insert("channels", {
          serverId,
          ...data,
          position: channels.length,
          kind: "text",
          createdAt: Date.now(),
          createdById: app.botUserId,
        });
        const result = { id, serverId, ...data, kind: "text" };
        await emitBotEvent(ctx, {
          type: "channelCreate",
          serverId,
          channelId: id,
          data: result,
        });
        return result;
      }
      if (path[2] === "roles") {
        const roles = await roleContext(
          ctx,
          app,
          serverId,
          PERMISSIONS.MANAGE_ROLES,
        );
        const schema = z
          .object({
            name: z.string().trim().min(2).max(60),
            permissions: z.array(z.string()).max(32),
            color: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional(),
          })
          .strict();
        if (path.length === 3 && method === "POST") {
          const data = parse(schema, body);
          const permissions = delegatePermissions(roles, data.permissions);
          if (roles.top <= 0 || roles.roles.length >= 250)
            botFailure(
              "FORBIDDEN",
              "Move the bot role above a role it may manage, or reduce the role count.",
            );
          if (
            roles.roles.some(
              (role) => role.name.toLowerCase() === data.name.toLowerCase(),
            )
          )
            botFailure("CONFLICT", "Role name already exists.");
          const below = Math.max(
            0,
            ...roles.roles
              .filter((role) => role.position < roles.top)
              .map((role) => role.position),
          );
          const id = await ctx.db.insert("serverRoles", {
            serverId,
            name: data.name,
            color: data.color,
            permissions,
            position: (below + roles.top) / 2,
            isDefault: false,
          });
          const result = { id, serverId, ...data, permissions };
          await logAudit(ctx, {
            serverId,
            actorId: app.botUserId,
            action: "role.create",
            targetId: id,
          });
          return result;
        }
        if (path.length === 4 && method === "PATCH") {
          const id = normalizedId(ctx, "serverRoles", path[3]);
          const role = await editableRole(ctx, roles, id);
          const data = parse(schema.partial(), body);
          const permissions = data.permissions
            ? delegatePermissions(roles, data.permissions)
            : role.permissions;
          if (
            data.name &&
            roles.roles.some(
              (entry) =>
                entry._id !== id &&
                entry.name.toLowerCase() === data.name!.toLowerCase(),
            )
          )
            botFailure("CONFLICT", "Role name already exists.");
          await ctx.db.patch(id, { ...data, permissions });
          const result = {
            id,
            serverId,
            name: data.name ?? role.name,
            color: data.color ?? role.color,
            permissions,
          };
          await logAudit(ctx, {
            serverId,
            actorId: app.botUserId,
            action: "role.update",
            targetId: id,
          });
          return result;
        }
      }
      if ((path[2] === "members" || path[2] === "bans") && path[3]) {
        const userId = normalizedId(ctx, "users", path[3]);
        const member = await ctx.db
          .query("serverMembers")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId).eq("userId", userId),
          )
          .unique();
        if (!member) botFailure("NOT_FOUND", "Server member not found.");
        if (path[2] === "members" && path.length === 4 && method === "GET")
          return {
            id: member._id,
            user: await publicBotUser(ctx, userId),
            nickname: member.nickname,
            roleIds: member.roleIds,
            joinedAt: member.joinedAt,
          };
        const permission =
          path[2] === "bans"
            ? PERMISSIONS.BAN_MEMBERS
            : path[4] === "roles"
              ? PERMISSIONS.MANAGE_ROLES
              : PERMISSIONS.KICK_MEMBERS;
        const roles = await roleContext(ctx, app, serverId, permission);
        const targetTop = Math.max(
          0,
          ...roles.roles
            .filter((role) => member.roleIds.includes(role._id))
            .map((role) => role.position),
        );
        if (
          userId === access.server.ownerId ||
          userId === app.botUserId ||
          targetTop >= roles.top
        )
          botFailure(
            "FORBIDDEN",
            "The target member must be below the bot's highest role.",
          );
        if (
          path[2] === "members" &&
          path.length === 5 &&
          path[4] === "roles" &&
          method === "PUT"
        ) {
          const data = parse(
            z.object({ roleIds: z.array(z.string()).max(100) }).strict(),
            body,
          );
          const roleIds = [
            ...new Set(
              data.roleIds.map((id) => normalizedId(ctx, "serverRoles", id)),
            ),
          ];
          for (const roleId of new Set([...member.roleIds, ...roleIds]))
            if (member.roleIds.includes(roleId) !== roleIds.includes(roleId)) {
              const role = await editableRole(ctx, roles, roleId);
              delegatePermissions(roles, role.permissions);
            }
          await ctx.db.patch(member._id, { roleIds });
          await logAudit(ctx, {
            serverId,
            actorId: app.botUserId,
            action: "member.roles",
            targetId: userId,
          });
          return { roleIds };
        }
        if (
          path.length === 4 &&
          ((path[2] === "members" && method === "DELETE") ||
            (path[2] === "bans" && method === "PUT"))
        ) {
          const data = parse(
            z.object({ reason: z.string().max(500).optional() }).strict(),
            body,
          );
          await ctx.db.delete(member._id);
          const action = path[2] === "bans" ? "ban" : "kick";
          if (action === "ban") {
            const existing = await ctx.db
              .query("bans")
              .withIndex("by_server_user", (q) =>
                q.eq("serverId", serverId).eq("userId", userId),
              )
              .unique();
            if (!existing)
              await ctx.db.insert("bans", {
                serverId,
                userId,
                reason: data.reason,
                bannedBy: app.botUserId,
                createdAt: Date.now(),
              });
          }
          await ctx.db.insert("moderationCases", {
            serverId,
            userId,
            moderatorId: app.botUserId,
            action,
            reason: data.reason ?? `Removed by ${app.name}`,
            createdAt: Date.now(),
          });
          await logAudit(ctx, {
            serverId,
            actorId: app.botUserId,
            action: `member.${action}`,
            targetId: userId,
            details: data.reason,
          });
          return { removed: true };
        }
      }
    }
    botFailure("NOT_FOUND", "Unknown Bot API endpoint or method.");
  },
});
