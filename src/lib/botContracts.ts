import { z } from "zod";
import { PERMISSIONS } from "./permissions";

export const BOT_PERMISSION_LIST = [
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

export const BOT_EVENT_TYPES = [
  "messageCreate",
  "messageUpdate",
  "messageDelete",
  "memberJoin",
  "memberLeave",
  "memberUpdate",
  "serverCreate",
  "serverUpdate",
  "channelCreate",
  "channelDelete",
  "roleCreate",
  "roleUpdate",
  "interactionCreate",
] as const;
export type BotEventType = (typeof BOT_EVENT_TYPES)[number];
export const botCommandOptionSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    description: z.string().trim().min(1).max(100),
    type: z.enum(["string", "integer", "boolean", "user"]),
    required: z.boolean().optional(),
    choices: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            value: z.union([z.string().max(100), z.number().int()]),
          })
          .strict(),
      )
      .max(25)
      .optional(),
  })
  .strict();
export const botCommandSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    description: z.string().trim().min(1).max(100),
    options: z.array(botCommandOptionSchema).max(25).default([]),
    permissions: z.array(z.string()).max(32).default([]),
  })
  .strict();
export type BotCommandInput = z.input<typeof botCommandSchema>;
export const botEmbedSchema = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(2000).optional(),
    url: z
      .string()
      .url()
      .refine((url) => url.startsWith("https://"))
      .optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    fields: z
      .array(
        z
          .object({
            name: z.string().min(1).max(256),
            value: z.string().min(1).max(1000),
            inline: z.boolean().optional(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();
export const botMessageSchema = z
  .object({
    content: z.string().max(2000).default(""),
    clientId: z.string().min(1).max(100).optional(),
    replyToId: z.string().optional(),
    embeds: z.array(botEmbedSchema).max(4).optional(),
    attachments: z
      .array(
        z
          .object({
            storageId: z.string(),
            name: z.string().max(200),
            size: z.number().int().positive(),
            mimeType: z.string().max(100),
          })
          .strict(),
      )
      .max(6)
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.content.trim() || input.embeds?.length || input.attachments?.length,
    "Messages need content, embeds, or attachments.",
  );
