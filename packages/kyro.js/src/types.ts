export type Permission =
  | "view_channel"
  | "send_messages"
  | "read_message_history"
  | "manage_messages"
  | "manage_channels"
  | "manage_roles"
  | "kick_members"
  | "ban_members"
  | "manage_server"
  | "mention_everyone"
  | "add_reactions"
  | "attach_files"
  | "use_external_emojis"
  | "create_polls";

export interface User {
  id: string;
  username: string;
  name?: string;
  avatar?: string | null;
  bot?: boolean;
}

export interface BotUser extends User {
  applicationId: string;
  description?: string;
  verified?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface Attachment {
  storageId: string;
  name: string;
  size: number;
  mimeType: string;
  url?: string | null;
}

export interface MessageData {
  id: string;
  channelId: string;
  serverId: string;
  author: User;
  content: string;
  createdAt: number;
  editedAt?: number;
  replyToId?: string;
  embeds?: Embed[];
  attachments?: Attachment[];
}

export interface MessageOptions {
  content?: string;
  replyToId?: string;
  /** Reuse the same ID when retrying an uncertain send to prevent duplicates. */
  clientId?: string;
  embeds?: Embed[];
  attachments?: Attachment[];
}

export interface CommandOption {
  name: string;
  description: string;
  type: "string" | "integer" | "boolean" | "user";
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
}

export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
  permissions?: Permission[];
}

export interface Command extends CommandDefinition {
  id: string;
  applicationId: string;
  serverId?: string;
}

export interface InteractionData {
  id: string;
  commandId: string;
  commandName: string;
  channelId: string;
  serverId: string;
  user: User;
  options: Record<string, string | number | boolean>;
  expiresAt: number;
}

export interface InteractionResponse {
  content: string;
  ephemeral?: boolean;
  embeds?: Embed[];
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: number;
  memberCount?: number;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  topic?: string;
  kind: "text" | "voice" | "forum";
  permissions?: Permission[];
}

export interface Member {
  id: string;
  user: User;
  nickname?: string;
  roleIds: string[];
  joinedAt: number;
}

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  color?: string;
  position?: number;
}

export interface PollOptions {
  question: string;
  options: string[];
  multiple?: boolean;
  durationMinutes?: number;
}

export type BotEventType =
  | "messageCreate"
  | "messageUpdate"
  | "messageDelete"
  | "memberJoin"
  | "memberLeave"
  | "memberUpdate"
  | "serverCreate"
  | "serverUpdate"
  | "channelCreate"
  | "channelDelete"
  | "roleCreate"
  | "roleUpdate"
  | "interactionCreate";

export interface BotEvent<T = unknown> {
  id: string;
  type: BotEventType;
  createdAt: number;
  serverId?: string;
  channelId?: string;
  data: T;
}

/** Supply durable storage when events must stay deduplicated across restarts. */
export interface EventStore {
  has(id: string): boolean | Promise<boolean>;
  mark(id: string): void | Promise<void>;
}

export interface KyroClientOptions {
  token: string | undefined;
  /** Full API base, e.g. https://your-deployment.convex.site/bot-api/v1. */
  apiBase?: string;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  maxRateLimitRetries?: number;
  eventStore?: EventStore;
  /** Inject a transport for testing, observability or an outbound proxy. */
  fetch?: typeof globalThis.fetch;
}
