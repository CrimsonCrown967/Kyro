import { v } from "convex/values";
import { z } from "zod";
import { internalMutation } from "./functions";
import {
  activeBot,
  auditBot,
  botChannel,
  botError,
  botServer,
  botTarget,
  limit,
  messageDto,
  tableId,
  validPermissions,
} from "./botLib";
import { messageSchema, pollSchema } from "../lib/botContract";
import { sendBotMessage, validateBotMessage } from "./botMessages";
import { registerCommand } from "./botCommands";
import { deleteChannelData, deleteMessageData } from "./cleanup";
import { isAllowedUploadType, MAX_UPLOAD_BYTES } from "./uploadSecurity";
import { eventDto, eventVisible } from "./botEvents";
import { renewPresence } from "./presence";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    botError(
      400,
      "INVALID_REQUEST",
      result.error.issues[0]?.message ?? "Invalid request.",
    );
  return result.data;
}
export const authorize = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const app = await activeBot(ctx, tokenHash);
    if (!(await limit(ctx, `api:${app._id}`, 120)))
      return { allowed: false as const };
    await ctx.db.patch(app._id, {
      apiRequests: app.apiRequests + 1,
      lastActiveAt: Date.now(),
    });
    const botUser = await ctx.db.get(app.botUserId);
    if (botUser) await renewPresence(ctx, botUser);
    return { allowed: true as const };
  },
});
export const execute = internalMutation({
  args: {
    tokenHash: v.string(),
    method: v.string(),
    path: v.string(),
    body: v.any(),
    query: v.any(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const app = await activeBot(ctx, args.tokenHash);
    const p = args.path.split("/").filter(Boolean);
    const method = args.method;
    const body: unknown = args.body;
    if (method === "GET" && p.length === 1 && p[0] === "me") {
      const bot = await ctx.db.get(app.botUserId);
      return {
        id: app.botUserId,
        applicationId: app._id,
        name: app.name,
        username: bot?.username,
        verified: app.verified,
      };
    }
    if (p[0] === "commands") {
      if (method === "GET" && p.length === 1)
        return (
          await ctx.db
            .query("botCommands")
            .withIndex("by_app", (q) => q.eq("applicationId", app._id))
            .collect()
        ).map((c) => ({
          id: c._id,
          serverId: c.serverId ?? null,
          name: c.name,
          description: c.description,
          permissions: c.permissions,
          options: c.options,
          updatedAt: c.updatedAt,
        }));
      if (method === "POST" && p.length === 1) {
        const id = await registerCommand(ctx, app, body);
        await auditBot(ctx, app._id, "command.register");
        return { id };
      }
      if (method === "DELETE" && p.length === 2) {
        const command = await ctx.db.get(tableId(ctx, "botCommands", p[1]));
        if (!command || command.applicationId !== app._id)
          botError(404, "NOT_FOUND", "Command not found.");
        await ctx.db.delete(command._id);
        await auditBot(ctx, app._id, "command.delete");
        return { deleted: true };
      }
    }
    if (p[0] === "events") {
      if (method === "GET" && p.length === 1) {
        if (app.deliveryMode !== "poll")
          botError(
            409,
            "WEBHOOK_MODE",
            "Switch the application to SDK polling to consume events here.",
          );
        const now = Date.now();
        const due = await ctx.db
          .query("botEvents")
          .withIndex("by_app_status_due", (q) =>
            q
              .eq("applicationId", app._id)
              .eq("status", "pending")
              .lte("nextAttemptAt", now),
          )
          .take(25);
        const retry = await ctx.db
          .query("botEvents")
          .withIndex("by_app_status_due", (q) =>
            q
              .eq("applicationId", app._id)
              .eq("status", "leased")
              .lte("nextAttemptAt", now),
          )
          .take(25 - due.length);
        const events = [];
        for (const event of [...due, ...retry]) {
          if (
            event.attempts >= 6 ||
            event.expiresAt < now ||
            !(await eventVisible(ctx, app, event))
          ) {
            await ctx.db.patch(event._id, {
              status: "dead",
              lastError: "EXPIRED_OR_ACCESS_REVOKED",
            });
            continue;
          }
          await ctx.db.patch(event._id, {
            status: "leased",
            attempts: event.attempts + 1,
            leaseUntil: now + 60000,
            nextAttemptAt: now + 60000,
          });
          events.push(eventDto(event));
        }
        return { events };
      }
      if (method === "POST" && p[1] === "ack") {
        const { ids } = parse(
          z.object({ ids: z.array(z.string()).min(1).max(25) }).strict(),
          body,
        );
        for (const value of ids) {
          const event = await ctx.db.get(tableId(ctx, "botEvents", value));
          if (!event || event.applicationId !== app._id)
            botError(404, "NOT_FOUND", "Event not found.");
          if (event.status === "leased")
            await ctx.db.patch(event._id, {
              status: "delivered",
              deliveredAt: Date.now(),
            });
        }
        return { acknowledged: ids.length };
      }
    }
    if (
      p[0] === "interactions" &&
      p.length === 3 &&
      p[2] === "response" &&
      method === "POST"
    ) {
      const interaction = await ctx.db.get(
        tableId(ctx, "botInteractions", p[1]),
      );
      if (!interaction || interaction.applicationId !== app._id)
        botError(404, "NOT_FOUND", "Interaction not found.");
      if (interaction.respondedAt)
        botError(
          409,
          "ALREADY_RESPONDED",
          "This interaction already has a response.",
        );
      if (interaction.expiresAt < Date.now())
        botError(410, "INTERACTION_EXPIRED", "Interaction expired.");
      const response = parse(
        z
          .object({
            content: z.string().min(1).max(2000),
            ephemeral: z.boolean().default(false),
          })
          .strict(),
        body,
      );
      await botChannel(ctx, app, interaction.channelId, "send_messages");
      if (response.ephemeral)
        await validateBotMessage(
          ctx,
          app,
          interaction.channelId,
          messageSchema.parse({ content: response.content }),
          true,
        );
      let messageId;
      if (!response.ephemeral)
        messageId = (
          await sendBotMessage(ctx, app, interaction.channelId, {
            content: response.content,
            nonce: `interaction:${interaction._id}`,
          })
        ).id;
      await ctx.db.patch(interaction._id, {
        respondedAt: Date.now(),
        ephemeral: response.ephemeral,
        response: response.ephemeral ? response.content : undefined,
        messageId,
      });
      return {
        id: interaction._id,
        ephemeral: response.ephemeral,
        messageId: messageId ?? null,
      };
    }
    if (p[0] === "servers") {
      if (p.length === 1 && method === "GET") {
        const rows = await ctx.db
          .query("botInstallations")
          .withIndex("by_app", (q) => q.eq("applicationId", app._id))
          .collect();
        const servers = [];
        for (const row of rows) {
          try {
            const access = await botServer(
              ctx,
              app,
              row.serverId,
              "view_channel",
            );
            servers.push({
              id: row.serverId,
              name: access.server.name,
              permissions: access.permissions,
            });
          } catch {
            /* Removed memberships do not retain access. */
          }
        }
        return { servers };
      }
      const serverId = tableId(ctx, "servers", p[1] ?? "");
      const access = await botServer(ctx, app, serverId, "view_channel");
      if (p.length === 2 && method === "GET")
        return {
          id: serverId,
          name: access.server.name,
          description: access.server.description ?? "",
          ownerId: access.server.ownerId,
          permissions: access.permissions,
        };
      if (p.length === 2 && method === "PATCH") {
        await botServer(ctx, app, serverId, "manage_server");
        const patch = parse(
          z
            .object({
              name: z.string().trim().min(2).max(64).optional(),
              description: z.string().max(1000).optional(),
            })
            .strict(),
          body,
        );
        await ctx.db.patch(serverId, { ...patch, updatedAt: Date.now() });
        await auditBot(ctx, app._id, "server.update", undefined, serverId);
        return { id: serverId };
      }
      if (p[2] === "channels" && p.length === 3) {
        if (method === "GET") {
          const channels = await ctx.db
            .query("channels")
            .withIndex("by_server", (q) => q.eq("serverId", serverId))
            .collect();
          const visible = [];
          for (const channel of channels) {
            try {
              await botChannel(ctx, app, channel._id);
              visible.push({
                id: channel._id,
                serverId,
                name: channel.name,
                kind: channel.kind ?? "text",
                topic: channel.topic ?? "",
              });
            } catch {
              /* Filter hidden channels. */
            }
          }
          return { channels: visible };
        }
        if (method === "POST") {
          await botServer(ctx, app, serverId, "manage_channels");
          const data = parse(
            z
              .object({
                name: z.string().regex(/^[a-z0-9_-]{1,64}$/),
                topic: z.string().max(1000).optional(),
              })
              .strict(),
            body,
          );
          const id = await ctx.db.insert("channels", {
            ...data,
            serverId,
            kind: "text",
            position: 0,
            createdAt: Date.now(),
            createdById: app.botUserId,
          });
          await auditBot(ctx, app._id, "channel.create", undefined, id);
          return { id };
        }
      }
      if (p[2] === "members" && p[3]) {
        const userId = tableId(ctx, "users", p[3]);
        const member = await ctx.db
          .query("serverMembers")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId).eq("userId", userId),
          )
          .first();
        if (!member) botError(404, "NOT_FOUND", "Member not found.");
        if (method === "GET" && p.length === 4) {
          const user = await ctx.db.get(userId);
          return {
            id: userId,
            name: user?.name,
            username: user?.username,
            bot: Boolean(user?.botApplicationId),
            nickname: member.nickname ?? null,
            roleIds: member.roleIds,
            joinedAt: member.joinedAt,
          };
        }
        if (method === "DELETE" && p.length === 4) {
          const target = await botTarget(
            ctx,
            app,
            serverId,
            userId,
            "kick_members",
          );
          await ctx.db.delete(target.target._id);
          await auditBot(ctx, app._id, "member.kick", undefined, userId);
          return { removed: true };
        }
        if (
          p[4] === "roles" &&
          p.length === 6 &&
          (method === "PUT" || method === "DELETE")
        ) {
          const target = await botTarget(
            ctx,
            app,
            serverId,
            userId,
            "manage_roles",
          );
          const role = await ctx.db.get(tableId(ctx, "serverRoles", p[5]));
          if (
            !role ||
            role.serverId !== serverId ||
            role.isDefault ||
            role.botApplicationId ||
            role.position >= target.top(target.member.roleIds) ||
            role.permissions.some(
              (permission) => !target.permissions.includes(permission),
            )
          )
            botError(
              403,
              "ROLE_HIERARCHY",
              "Cannot delegate or modify this role.",
            );
          await ctx.db.patch(member._id, {
            roleIds:
              method === "PUT"
                ? [...new Set([...member.roleIds, role._id])]
                : member.roleIds.filter((id) => id !== role._id),
          });
          await auditBot(ctx, app._id, "member.roles", undefined, userId);
          return { updated: true };
        }
      }
      if (p[2] === "bans" && p.length === 4 && method === "PUT") {
        const userId = tableId(ctx, "users", p[3]);
        const target = await botTarget(
          ctx,
          app,
          serverId,
          userId,
          "ban_members",
        );
        const { reason } = parse(
          z.object({ reason: z.string().min(1).max(300) }).strict(),
          body,
        );
        await ctx.db.delete(target.target._id);
        const old = await ctx.db
          .query("bans")
          .withIndex("by_server_user", (q) =>
            q.eq("serverId", serverId).eq("userId", userId),
          )
          .first();
        if (!old)
          await ctx.db.insert("bans", {
            serverId,
            userId,
            reason,
            bannedBy: app.botUserId,
            createdAt: Date.now(),
          });
        await auditBot(ctx, app._id, "member.ban", undefined, userId);
        return { banned: true };
      }
      if (p[2] === "roles") {
        if (method === "GET" && p.length === 3)
          return {
            roles: (
              await ctx.db
                .query("serverRoles")
                .withIndex("by_server", (q) => q.eq("serverId", serverId))
                .collect()
            ).map((r) => ({
              id: r._id,
              name: r.name,
              permissions: r.permissions,
              position: r.position,
              color: r.color ?? null,
              isDefault: r.isDefault,
              managed: Boolean(r.botApplicationId),
            })),
          };
        await botServer(ctx, app, serverId, "manage_roles");
        const roles = await ctx.db
          .query("serverRoles")
          .withIndex("by_server", (q) => q.eq("serverId", serverId))
          .collect();
        const top = Math.max(
          0,
          ...roles
            .filter((r) => access.member.roleIds.includes(r._id))
            .map((r) => r.position),
        );
        if (method === "POST" && p.length === 3) {
          const data = parse(
            z
              .object({
                name: z.string().min(1).max(64),
                color: z
                  .string()
                  .regex(/^#[a-f0-9]{6}$/i)
                  .optional(),
                permissions: z.array(z.string()),
              })
              .strict(),
            body,
          );
          const permissions = validPermissions(data.permissions);
          if (
            top <= 1 ||
            permissions.some((p) => !access.permissions.includes(p))
          )
            botError(
              403,
              "CANNOT_DELEGATE",
              "Move the bot role higher and grant the necessary permissions first.",
            );
          const id = await ctx.db.insert("serverRoles", {
            serverId,
            ...data,
            permissions,
            position: 1,
            isDefault: false,
          });
          await auditBot(ctx, app._id, "role.create", undefined, id);
          return { id };
        }
        if (p.length === 4) {
          const role = await ctx.db.get(tableId(ctx, "serverRoles", p[3]));
          if (
            !role ||
            role.serverId !== serverId ||
            role.isDefault ||
            role.botApplicationId ||
            role.position >= top
          )
            botError(
              403,
              "ROLE_HIERARCHY",
              "Role must be below the bot and cannot be managed.",
            );
          if (method === "PATCH") {
            const data = parse(
              z
                .object({
                  name: z.string().min(1).max(64).optional(),
                  color: z
                    .string()
                    .regex(/^#[a-f0-9]{6}$/i)
                    .optional(),
                  permissions: z.array(z.string()).optional(),
                })
                .strict(),
              body,
            );
            if (data.permissions) {
              data.permissions = validPermissions(data.permissions);
              if (data.permissions.some((p) => !access.permissions.includes(p)))
                botError(
                  403,
                  "CANNOT_DELEGATE",
                  "Bot cannot grant permissions it does not hold.",
                );
            }
            await ctx.db.patch(role._id, data);
            await auditBot(ctx, app._id, "role.update", undefined, role._id);
            return { id: role._id };
          }
          if (method === "DELETE") {
            await ctx.db.delete(role._id);
            await auditBot(ctx, app._id, "role.delete", undefined, role._id);
            return { deleted: true };
          }
        }
      }
    }
    if (p[0] === "channels") {
      const channelId = tableId(ctx, "channels", p[1] ?? "");
      const access = await botChannel(ctx, app, channelId);
      if (p.length === 2) {
        if (method === "GET")
          return {
            id: channelId,
            serverId: access.channel.serverId,
            name: access.channel.name,
            kind: access.channel.kind ?? "text",
            topic: access.channel.topic ?? "",
            permissions: access.permissions,
          };
        if (method === "PATCH") {
          await botChannel(ctx, app, channelId, "manage_channels");
          const patch = parse(
            z
              .object({
                name: z
                  .string()
                  .regex(/^[a-z0-9_-]{1,64}$/)
                  .optional(),
                topic: z.string().max(1000).optional(),
              })
              .strict(),
            body,
          );
          await ctx.db.patch(channelId, patch);
          await auditBot(ctx, app._id, "channel.update", undefined, channelId);
          return { id: channelId };
        }
        if (method === "DELETE") {
          await botChannel(ctx, app, channelId, "manage_channels");
          await deleteChannelData(ctx, access.channel);
          await auditBot(ctx, app._id, "channel.delete", undefined, channelId);
          return { deleted: true };
        }
      }
      if (p[2] === "uploads" && method === "POST") {
        await botChannel(ctx, app, channelId, "upload_attachments");
        if (p.length === 3)
          return {
            uploadUrl: await ctx.storage.generateUploadUrl(),
            maximumBytes: MAX_UPLOAD_BYTES,
          };
        if (p[3] === "register" && p.length === 4) {
          const data = parse(
            z
              .object({
                storageId: z.string(),
                name: z.string().min(1).max(255),
              })
              .strict(),
            body,
          );
          const storageId = tableId(ctx, "_storage", data.storageId);
          const old = await ctx.db
            .query("uploads")
            .withIndex("by_storage", (q) => q.eq("storageId", storageId))
            .first();
          if (old) {
            if (old.ownerId !== app.botUserId)
              botError(
                403,
                "UPLOAD_OWNERSHIP",
                "Upload belongs to another account.",
              );
            return { storageId };
          }
          const meta = await ctx.db.system.get("_storage", storageId);
          if (
            !meta ||
            meta.size > MAX_UPLOAD_BYTES ||
            !isAllowedUploadType(meta.contentType ?? "")
          )
            botError(
              400,
              "INVALID_UPLOAD",
              "Unsupported file or file exceeds 10 MiB.",
            );
          await ctx.db.insert("uploads", {
            storageId,
            ownerId: app.botUserId,
            name: data.name,
            size: meta.size,
            mimeType: meta.contentType!,
            createdAt: Date.now(),
          });
          return { storageId };
        }
      }
      if (p[2] === "messages") {
        if (p.length === 3 && method === "POST")
          return sendBotMessage(ctx, app, channelId, body);
        if (p.length === 3 && method === "GET") {
          await botChannel(ctx, app, channelId, "read_message_history");
          const query = parse(
            z
              .object({
                limit: z.coerce.number().int().min(1).max(100).default(50),
                before: z.coerce.number().finite().optional(),
                cursor: z.string().max(10000).optional(),
              })
              .strict(),
            args.query,
          );
          const page = await ctx.db
            .query("messages")
            .withIndex("by_container", (q) =>
              query.before === undefined
                ? q.eq("containerId", channelId)
                : q.eq("containerId", channelId).lt("createdAt", query.before),
            )
            .order("desc")
            .paginate({ numItems: query.limit, cursor: query.cursor ?? null });
          const rows = page.page;
          return {
            messages: await Promise.all(rows.map((m) => messageDto(ctx, m))),
            nextCursor: page.isDone ? null : page.continueCursor,
            nextBefore:
              rows.length === query.limit
                ? rows[rows.length - 1].createdAt
                : null,
          };
        }
        const message = await ctx.db.get(tableId(ctx, "messages", p[3] ?? ""));
        if (!message || message.containerId !== channelId)
          botError(404, "NOT_FOUND", "Message not found.");
        if (p.length === 4 && method === "GET") {
          await botChannel(ctx, app, channelId, "read_message_history");
          return messageDto(ctx, message);
        }
        if (p.length === 4 && method === "PATCH") {
          if (message.authorId !== app.botUserId)
            botError(
              403,
              "NOT_AUTHOR",
              "Bots may only edit their own messages.",
            );
          const input = parse(messageSchema, body);
          if (input.attachmentIds.length)
            botError(
              400,
              "INVALID_EDIT",
              "Attachments cannot be replaced in an edit.",
            );
          await validateBotMessage(ctx, app, channelId, input, true);
          await ctx.db.patch(message._id, {
            content: input.content,
            embeds: input.embeds,
            editedAt: Date.now(),
          });
          return messageDto(ctx, (await ctx.db.get(message._id))!);
        }
        if (p.length === 4 && method === "DELETE") {
          if (message.authorId !== app.botUserId)
            await botChannel(ctx, app, channelId, "manage_messages");
          await deleteMessageData(ctx, message);
          await auditBot(
            ctx,
            app._id,
            "message.delete",
            undefined,
            message._id,
          );
          return { deleted: true };
        }
        if (p[4] === "reactions" && p.length === 5 && method === "POST") {
          await botChannel(ctx, app, channelId, "add_reactions");
          const { emoji } = parse(
            z.object({ emoji: z.string().min(1).max(64) }).strict(),
            body,
          );
          await validateBotMessage(
            ctx,
            app,
            channelId,
            messageSchema.parse({ content: emoji }),
            true,
          );
          const mine = await ctx.db
            .query("reactions")
            .withIndex("by_message_user", (q) =>
              q.eq("messageId", message._id).eq("userId", app.botUserId),
            )
            .collect();
          if (!mine.some((r) => r.emoji === emoji))
            await ctx.db.insert("reactions", {
              messageId: message._id,
              userId: app.botUserId,
              emoji,
              createdAt: Date.now(),
            });
          return { added: true };
        }
        if (p[4] === "polls" && p.length === 5 && method === "POST") {
          await botChannel(ctx, app, channelId, "create_polls");
          if (message.authorId !== app.botUserId)
            botError(
              403,
              "NOT_AUTHOR",
              "Polls must be attached to the bot's own message.",
            );
          const poll = parse(pollSchema, body);
          await validateBotMessage(
            ctx,
            app,
            channelId,
            messageSchema.parse({
              content: [poll.question, ...poll.options].join("\n"),
            }),
            true,
          );
          const old = await ctx.db
            .query("polls")
            .withIndex("by_message", (q) => q.eq("messageId", message._id))
            .first();
          if (old) botError(409, "POLL_EXISTS", "Message already has a poll.");
          const id = await ctx.db.insert("polls", {
            messageId: message._id,
            createdById: app.botUserId,
            question: poll.question,
            options: poll.options.map((text, i) => ({
              id: `option-${i + 1}`,
              text,
            })),
            multiple: poll.multipleChoice,
            createdAt: Date.now(),
            closesAt: poll.durationMinutes
              ? Date.now() + poll.durationMinutes * 60000
              : undefined,
          });
          return { id };
        }
      }
    }
    botError(404, "NOT_FOUND", "Unknown bot API endpoint or HTTP method.");
  },
});
