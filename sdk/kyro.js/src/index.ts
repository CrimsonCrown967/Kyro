import { verify, createPublicKey } from "node:crypto";

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  fields?: { name: string; value: string }[];
}
export interface MessageInput {
  content?: string;
  embeds?: Embed[];
  attachmentIds?: string[];
  replyToId?: string;
  nonce?: string;
}
export interface MessageData {
  id: string;
  channelId: string;
  content: string;
  embeds: Embed[];
  createdAt: number;
  editedAt: number | null;
  replyToId: string | null;
  author: { id: string; name: string; username: string | null; bot: boolean };
  attachments: {
    name: string;
    size: number;
    mimeType: string;
    url: string | null;
  }[];
}
export interface CommandOption {
  name: string;
  description: string;
  type: "string" | "integer" | "boolean" | "user";
  required?: boolean;
  choices?: string[];
}
export interface Command {
  name: string;
  description: string;
  serverId?: string;
  permissions?: string[];
  options?: CommandOption[];
}
export interface BotIdentity {
  id: string;
  applicationId: string;
  name: string;
  username: string;
  verified: boolean;
}
export interface Server {
  id: string;
  name: string;
  permissions: string[];
  description?: string;
  ownerId?: string;
}
export interface Channel {
  id: string;
  serverId: string;
  name: string;
  kind: string;
  topic: string;
  permissions?: string[];
}
export interface Member {
  id: string;
  username: string | null;
  name: string;
  bot: boolean;
  nickname: string | null;
  roleIds: string[];
  joinedAt: number;
}
export interface Role {
  id: string;
  name: string;
  color?: string | null;
  permissions: string[];
  position?: number;
  isDefault?: boolean;
  managed?: boolean;
}
export interface InteractionData {
  id: string;
  commandId: string;
  name: string;
  userId: string;
  channelId: string;
  serverId: string;
  options: Record<string, string | number | boolean>;
  expiresAt: number;
}
export interface BotEvent<T = unknown> {
  id: string;
  type: string;
  serverId: string;
  channelId: string | null;
  timestamp: number;
  data: T;
}
export class KyroApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter: number = 0,
  ) {
    super(message);
    this.name = "KyroApiError";
  }
}
export class KyroMessage implements MessageData {
  id: string;
  channelId: string;
  content: string;
  embeds: Embed[];
  createdAt: number;
  editedAt: number | null;
  replyToId: string | null;
  author: MessageData["author"];
  attachments: MessageData["attachments"];
  constructor(
    private readonly client: KyroClient,
    data: MessageData,
  ) {
    this.id = data.id;
    this.channelId = data.channelId;
    this.content = data.content;
    this.embeds = data.embeds;
    this.createdAt = data.createdAt;
    this.editedAt = data.editedAt;
    this.replyToId = data.replyToId;
    this.author = data.author;
    this.attachments = data.attachments;
  }
  reply(input: string | MessageInput) {
    return this.client.sendMessage(this.channelId, {
      ...(typeof input === "string" ? { content: input } : input),
      replyToId: this.id,
    });
  }
  edit(input: string | MessageInput) {
    return this.client.editMessage(this.channelId, this.id, input);
  }
  delete() {
    return this.client.deleteMessage(this.channelId, this.id);
  }
  react(emoji: string) {
    return this.client.addReaction(this.channelId, this.id, emoji);
  }
}
export class KyroInteraction {
  constructor(
    private readonly client: KyroClient,
    public readonly data: InteractionData,
  ) {}
  get id() {
    return this.data.id;
  }
  get name() {
    return this.data.name;
  }
  get options() {
    return this.data.options;
  }
  get userId() {
    return this.data.userId;
  }
  get channelId() {
    return this.data.channelId;
  }
  get serverId() {
    return this.data.serverId;
  }
  reply(content: string, options: { ephemeral?: boolean } = {}) {
    return this.client.respond(this.id, { content, ...options });
  }
}
export interface ClientEvents {
  ready: BotIdentity;
  error: Error;
  event: BotEvent;
  messageCreate: KyroMessage;
  messageUpdate: KyroMessage;
  messageDelete: { id: string; channelId: string };
  interactionCreate: KyroInteraction;
  memberJoin: Member;
  memberLeave: Member;
  memberUpdate: Member;
  serverCreate: Pick<Server, "id" | "name" | "description" | "ownerId">;
  serverUpdate: Pick<Server, "id" | "name" | "description" | "ownerId">;
  channelCreate: Pick<Channel, "id" | "serverId" | "name" | "kind">;
  channelDelete: { id: string; serverId: string };
  roleCreate: Role;
  roleUpdate: Role;
}
export interface ClientOptions {
  token: string | undefined;
  baseUrl?: string;
  pollIntervalMs?: number;
  fetch?: typeof fetch;
}
export class KyroClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly transport: typeof fetch;
  private readonly interval: number;
  private readonly listeners = new Map<
    keyof ClientEvents,
    Set<(data: never) => void | Promise<void>>
  >();
  private readonly processed = new Set<string>();
  private controller = new AbortController();
  private loop?: Promise<void>;
  private running = false;
  user: BotIdentity | null = null;
  constructor(options: ClientOptions) {
    if (!options.token || !/^kyro_bot_[a-f0-9]{64}$/.test(options.token))
      throw new Error("A valid KYRO_BOT_TOKEN is required.");
    this.token = options.token;
    this.baseUrl = (
      options.baseUrl ?? "https://kyro-chat.cyou/api/bots/v1"
    ).replace(/\/$/, "");
    const url = new URL(this.baseUrl);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("Use HTTPS for the bot API.");
    this.transport = options.fetch ?? fetch;
    this.interval = Math.max(2000, options.pollIntervalMs ?? 2500);
  }
  on<K extends keyof ClientEvents>(
    event: K,
    handler: (data: ClientEvents[K]) => void | Promise<void>,
  ) {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler as (data: never) => void | Promise<void>);
    return this;
  }
  off<K extends keyof ClientEvents>(
    event: K,
    handler: (data: ClientEvents[K]) => void | Promise<void>,
  ) {
    this.listeners
      .get(event)
      ?.delete(handler as (data: never) => void | Promise<void>);
    return this;
  }
  private async emit<K extends keyof ClientEvents>(
    event: K,
    data: ClientEvents[K],
  ) {
    for (const handler of this.listeners.get(event) ?? [])
      await handler(data as never);
  }
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(25000),
      ]),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      data: T;
      error?: { code: string; message: string };
    };
    if (!response.ok || !payload.ok)
      throw new KyroApiError(
        response.status,
        payload.error?.code ?? "HTTP_ERROR",
        payload.error?.message ?? "Kyro request failed.",
        Number(response.headers.get("retry-after") ?? 0),
      );
    return payload.data;
  }
  async login() {
    if (this.running) return this.user!;
    if (this.controller.signal.aborted) this.controller = new AbortController();
    this.user = await this.request<BotIdentity>("GET", "/me");
    this.running = true;
    try {
      await this.emit("ready", this.user);
    } catch (error) {
      this.running = false;
      throw error;
    }
    this.loop = this.pollLoop();
    return this.user;
  }
  async destroy() {
    this.running = false;
    this.controller.abort();
    await this.loop;
  }
  private async pollLoop() {
    while (this.running) {
      let delay = this.interval;
      try {
        const { events } = await this.request<{ events: BotEvent[] }>(
          "GET",
          "/events",
        );
        for (const event of events) {
          if (!this.processed.has(event.id)) {
            await this.handleEvent(event);
            this.processed.add(event.id);
            if (this.processed.size > 10000)
              this.processed.delete(this.processed.values().next().value!);
          }
          await this.request("POST", "/events/ack", { ids: [event.id] });
        }
      } catch (cause) {
        if (!this.running) break;
        const error =
          cause instanceof Error
            ? cause
            : new Error("Bot event handling failed.");
        try {
          await this.emit("error", error);
        } catch {
          /* A throwing error handler must not create an unhandled rejection. */
        }
        if (error instanceof KyroApiError) {
          if (
            error.status === 401 ||
            error.status === 403 ||
            error.code === "WEBHOOK_MODE"
          ) {
            this.running = false;
            break;
          }
          delay = Math.max(delay, error.retryAfter * 1000, 5000);
        } else delay = 5000;
      }
      if (this.running)
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            this.controller.signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, delay);
          this.controller.signal.addEventListener("abort", done, {
            once: true,
          });
        });
    }
  }
  /** Webhook hosts can dispatch a verified envelope through the same handlers. */
  async handleEvent(event: BotEvent) {
    await this.emit("event", event);
    if (event.type === "messageCreate" || event.type === "messageUpdate")
      await this.emit(
        event.type,
        new KyroMessage(this, event.data as MessageData),
      );
    else if (event.type === "interactionCreate")
      await this.emit(
        "interactionCreate",
        new KyroInteraction(this, event.data as InteractionData),
      );
    else if (this.listeners.has(event.type as keyof ClientEvents))
      await this.emit(event.type as keyof ClientEvents, event.data as never);
  }
  async sendMessage(channelId: string, input: string | MessageInput) {
    const body = typeof input === "string" ? { content: input } : input;
    const data = await this.request<MessageData>(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/messages`,
      { ...body, nonce: body.nonce ?? crypto.randomUUID() },
    );
    return new KyroMessage(this, data);
  }
  async editMessage(
    channelId: string,
    messageId: string,
    input: string | MessageInput,
  ) {
    return new KyroMessage(
      this,
      await this.request<MessageData>(
        "PATCH",
        `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
        typeof input === "string" ? { content: input } : input,
      ),
    );
  }
  deleteMessage(channelId: string, messageId: string) {
    return this.request<{ deleted: boolean }>(
      "DELETE",
      `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }
  async messages(
    channelId: string,
    options: { limit?: number; before?: number; cursor?: string } = {},
  ) {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.before !== undefined)
      query.set("before", String(options.before));
    if (options.cursor !== undefined) query.set("cursor", options.cursor);
    const page = await this.request<{
      messages: MessageData[];
      nextBefore: number | null;
      nextCursor: string | null;
    }>("GET", `/channels/${encodeURIComponent(channelId)}/messages?${query}`);
    return {
      ...page,
      messages: page.messages.map((m) => new KyroMessage(this, m)),
    };
  }
  servers() {
    return this.request<{ servers: Server[] }>("GET", "/servers");
  }
  server(id: string) {
    return this.request<Server>("GET", `/servers/${encodeURIComponent(id)}`);
  }
  channels(serverId: string) {
    return this.request<{ channels: Channel[] }>(
      "GET",
      `/servers/${encodeURIComponent(serverId)}/channels`,
    );
  }
  channel(id: string) {
    return this.request<Channel>("GET", `/channels/${encodeURIComponent(id)}`);
  }
  member(serverId: string, userId: string) {
    return this.request<Member>(
      "GET",
      `/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}`,
    );
  }
  registerCommand(command: Command) {
    return this.request<{ id: string }>("POST", "/commands", command);
  }
  deleteCommand(id: string) {
    return this.request<{ deleted: boolean }>(
      "DELETE",
      `/commands/${encodeURIComponent(id)}`,
    );
  }
  respond(id: string, response: { content: string; ephemeral?: boolean }) {
    return this.request<{
      id: string;
      ephemeral: boolean;
      messageId: string | null;
    }>("POST", `/interactions/${encodeURIComponent(id)}/response`, response);
  }
  addReaction(channelId: string, messageId: string, emoji: string) {
    return this.request(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { emoji },
    );
  }
  createPoll(
    channelId: string,
    messageId: string,
    poll: {
      question: string;
      options: string[];
      multipleChoice?: boolean;
      durationMinutes?: number;
    },
  ) {
    return this.request<{ id: string }>(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/polls`,
      poll,
    );
  }
  assignRole(serverId: string, userId: string, roleId: string) {
    return this.request(
      "PUT",
      `/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
      {},
    );
  }
  removeRole(serverId: string, userId: string, roleId: string) {
    return this.request(
      "DELETE",
      `/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
    );
  }
  createRole(
    serverId: string,
    role: { name: string; color?: string; permissions: string[] },
  ) {
    return this.request<{ id: string }>(
      "POST",
      `/servers/${encodeURIComponent(serverId)}/roles`,
      role,
    );
  }
  kick(serverId: string, userId: string) {
    return this.request(
      "DELETE",
      `/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}`,
    );
  }
  roles(serverId: string) {
    return this.request<{ roles: Role[] }>(
      "GET",
      `/servers/${encodeURIComponent(serverId)}/roles`,
    );
  }
  editRole(
    serverId: string,
    roleId: string,
    patch: { name?: string; color?: string; permissions?: string[] },
  ) {
    return this.request<{ id: string }>(
      "PATCH",
      `/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(roleId)}`,
      patch,
    );
  }
  deleteRole(serverId: string, roleId: string) {
    return this.request(
      "DELETE",
      `/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(roleId)}`,
    );
  }
  editServer(serverId: string, patch: { name?: string; description?: string }) {
    return this.request<{ id: string }>(
      "PATCH",
      `/servers/${encodeURIComponent(serverId)}`,
      patch,
    );
  }
  createChannel(serverId: string, channel: { name: string; topic?: string }) {
    return this.request<{ id: string }>(
      "POST",
      `/servers/${encodeURIComponent(serverId)}/channels`,
      channel,
    );
  }
  editChannel(channelId: string, patch: { name?: string; topic?: string }) {
    return this.request<{ id: string }>(
      "PATCH",
      `/channels/${encodeURIComponent(channelId)}`,
      patch,
    );
  }
  deleteChannel(channelId: string) {
    return this.request("DELETE", `/channels/${encodeURIComponent(channelId)}`);
  }
  ban(serverId: string, userId: string, reason: string) {
    return this.request(
      "PUT",
      `/servers/${encodeURIComponent(serverId)}/bans/${encodeURIComponent(userId)}`,
      { reason },
    );
  }
  async upload(channelId: string, file: Blob, name: string) {
    const { uploadUrl, maximumBytes } = await this.request<{
      uploadUrl: string;
      maximumBytes: number;
    }>("POST", `/channels/${encodeURIComponent(channelId)}/uploads`, {});
    if (file.size > maximumBytes)
      throw new Error("File exceeds Kyro's upload limit.");
    const response = await this.transport(uploadUrl, {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Upload failed.");
    const { storageId } = (await response.json()) as { storageId: string };
    await this.request(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/uploads/register`,
      { storageId, name },
    );
    return storageId;
  }
}
/** Verify the exact raw request body before parsing; persist event IDs for durable deduplication. */
export function verifyWebhook(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKey: string,
  now = Date.now(),
): boolean {
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  try {
    return verify(
      null,
      Buffer.from(`${timestamp}.${rawBody}`),
      createPublicKey(publicKey),
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}
