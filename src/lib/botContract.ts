import { z } from "zod";
import { PERMISSIONS, type Permission } from "./permissions";

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
  PERMISSIONS.UPLOAD_ATTACHMENTS,
  PERMISSIONS.USE_EXTERNAL_EMOJIS,
  PERMISSIONS.CREATE_POLLS,
];
export const DEFAULT_BOT_PERMISSIONS = [
  "view_channel",
  "send_messages",
  "read_message_history",
];
export const BOT_EVENTS = [
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
export const BOT_CATEGORIES = [
  "General",
  "Moderation",
  "Utilities",
  "Games",
  "Community",
  "Productivity",
] as const;
export const permissionSchema = z
  .array(
    z
      .string()
      .refine(
        (p) => BOT_PERMISSIONS.includes(p as Permission),
        "Unsupported bot permission",
      ),
  )
  .max(BOT_PERMISSIONS.length)
  .transform((p) => [...new Set(p)]);
export const commandSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    description: z.string().trim().min(1).max(100),
    serverId: z.string().optional(),
    permissions: permissionSchema.default([]),
    options: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
            description: z.string().trim().min(1).max(100),
            type: z.enum(["string", "integer", "boolean", "user"]),
            required: z.boolean().default(false),
            choices: z.array(z.string().min(1).max(100)).max(25).optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict()
  .refine(
    (c) => new Set(c.options.map((o) => o.name)).size === c.options.length,
    "Option names must be unique",
  );
export type BotCommand = z.infer<typeof commandSchema>;
const safeUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => /^https:\/\//i.test(value), "Use an HTTPS URL");
export const embedSchema = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(2000).optional(),
    url: safeUrl.optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    fields: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            value: z.string().max(1000),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();
export const messageSchema = z
  .object({
    content: z.string().max(2000).default(""),
    embeds: z.array(embedSchema).max(3).default([]),
    replyToId: z.string().optional(),
    attachmentIds: z.array(z.string()).max(6).default([]),
    nonce: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (m) => m.content.trim() || m.embeds.length || m.attachmentIds.length,
    "A message cannot be empty",
  );
export type BotMessageInput = z.infer<typeof messageSchema>;
export const pollSchema = z
  .object({
    question: z.string().trim().min(1).max(300),
    options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
    multipleChoice: z.boolean().default(false),
    durationMinutes: z.number().int().min(1).max(10080).optional(),
  })
  .strict();

/** Secrets are created in browser memory; only this digest is sent to Convex. */
export async function generateBotCredential() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `kyro_bot_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return {
    token,
    tokenHash: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
