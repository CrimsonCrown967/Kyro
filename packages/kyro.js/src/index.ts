import { randomUUID } from "node:crypto";
import type {
  Attachment,
  BotEvent,
  BotEventType,
  BotUser,
  Channel,
  Command,
  CommandDefinition,
  EventStore,
  InteractionData,
  InteractionResponse,
  KyroClientOptions,
  Member,
  MessageData,
  MessageOptions,
  Permission,
  PollOptions,
  Role,
  Server,
} from "./types.js";
export type * from "./types.js";
export { verifyWebhookSignature, createWebhookHandler } from "./webhooks.js";

export class KyroAPIError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;
  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "KyroAPIError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

class MemoryEventStore implements EventStore {
  private readonly ids = new Set<string>();
  has(id: string) {
    return this.ids.has(id);
  }
  mark(id: string) {
    this.ids.add(id);
    if (this.ids.size > 10_000)
      this.ids.delete(this.ids.values().next().value!);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Client stopped"));
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      reject(new Error("Client stopped"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

const segment = (value: string) => encodeURIComponent(value);
const messageOptions = (value: string | MessageOptions): MessageOptions =>
  typeof value === "string" ? { content: value } : value;

export class Message {
  readonly id: string;
  readonly channelId: string;
  readonly serverId: string;
  readonly author: MessageData["author"];
  readonly content: string;
  readonly createdAt: number;
  readonly data: MessageData;
  #client: KyroClient;
  constructor(client: KyroClient, data: MessageData) {
    this.#client = client;
    this.data = data;
    this.id = data.id;
    this.channelId = data.channelId;
    this.serverId = data.serverId;
    this.author = data.author;
    this.content = data.content;
    this.createdAt = data.createdAt;
  }
  reply(value: string | MessageOptions): Promise<Message> {
    return this.#client.sendMessage(this.channelId, {
      ...messageOptions(value),
      replyToId: this.id,
    });
  }
  edit(
    value: string | Pick<MessageOptions, "content" | "embeds">,
  ): Promise<Message> {
    return this.#client.editMessage(
      this.channelId,
      this.id,
      messageOptions(value),
    );
  }
  delete(): Promise<{ deleted: boolean }> {
    return this.#client.deleteMessage(this.channelId, this.id);
  }
  react(emoji: string): Promise<unknown> {
    return this.#client.addReaction(this.channelId, this.id, emoji);
  }
}

export class Interaction {
  readonly id: string;
  readonly commandName: string;
  readonly options: InteractionData["options"];
  readonly user: InteractionData["user"];
  readonly channelId: string;
  readonly serverId: string;
  readonly expiresAt: number;
  readonly data: InteractionData;
  #client: KyroClient;
  constructor(client: KyroClient, data: InteractionData) {
    this.#client = client;
    this.data = data;
    this.id = data.id;
    this.commandName = data.commandName;
    this.options = data.options;
    this.user = data.user;
    this.channelId = data.channelId;
    this.serverId = data.serverId;
    this.expiresAt = data.expiresAt;
  }
  reply(value: string | InteractionResponse): Promise<unknown> {
    return this.#client.respondToInteraction(
      this.id,
      typeof value === "string" ? { content: value } : value,
    );
  }
}

export interface ClientEvents {
  ready: BotUser;
  error: Error;
  event: BotEvent;
  messageCreate: Message;
  messageUpdate: Message;
  messageDelete: { id: string; channelId: string; serverId: string };
  interactionCreate: Interaction;
  memberJoin: Member;
  memberLeave: { serverId: string; userId: string };
  memberUpdate: Member;
  serverCreate: Server;
  serverUpdate: Server;
  channelCreate: Channel;
  channelDelete: { id: string; serverId: string };
  roleCreate: Role;
  roleUpdate: Role;
}

type Handler<T> = (value: T) => void | Promise<void>;

/** An external Node.js client. Kyro never executes your bot code. */
export class KyroClient {
  #token: string;
  #apiBase: string;
  #fetch: typeof globalThis.fetch;
  #pollInterval: number;
  #timeout: number;
  #retries: number;
  #eventStore: EventStore;
  #controller?: AbortController;
  #loop?: Promise<void>;
  #login?: Promise<BotUser>;
  #handlers = new Map<keyof ClientEvents, Set<Handler<unknown>>>();
  user: BotUser | null = null;

  constructor(options: KyroClientOptions) {
    if (!options.token || !/^kyro_bot_[a-f0-9]{64}$/.test(options.token)) {
      throw new Error("Set KYRO_BOT_TOKEN to a valid Kyro bot token.");
    }
    const configuredBase = options.apiBase ?? process.env.KYRO_BOT_API_URL;
    if (!configuredBase)
      throw new Error(
        "Set apiBase or KYRO_BOT_API_URL to your Kyro Bot API URL.",
      );
    const base = new URL(configuredBase);
    if (
      (base.protocol !== "https:" &&
        !(
          base.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
        )) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      throw new Error(
        "The Bot API URL must use HTTPS (HTTP is allowed for localhost) and contain no credentials, query or fragment.",
      );
    }
    this.#token = options.token;
    this.#apiBase = base.href.replace(/\/$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#pollInterval = Math.max(1000, options.pollIntervalMs ?? 2000);
    this.#timeout = Math.max(1000, options.requestTimeoutMs ?? 15_000);
    this.#retries = Math.min(5, Math.max(0, options.maxRateLimitRetries ?? 2));
    this.#eventStore = options.eventStore ?? new MemoryEventStore();
  }

  on<K extends keyof ClientEvents>(
    event: K,
    handler: Handler<ClientEvents[K]>,
  ): this {
    const handlers = this.#handlers.get(event) ?? new Set<Handler<unknown>>();
    handlers.add(handler as Handler<unknown>);
    this.#handlers.set(event, handlers);
    return this;
  }

  off<K extends keyof ClientEvents>(
    event: K,
    handler: Handler<ClientEvents[K]>,
  ): this {
    this.#handlers.get(event)?.delete(handler as Handler<unknown>);
    return this;
  }

  async #emit(event: keyof ClientEvents, value: unknown): Promise<void> {
    for (const handler of this.#handlers.get(event) ?? []) await handler(value);
  }

  /** Authenticate, establish presence, emit ready, then poll in the background. */
  login(): Promise<BotUser> {
    if (this.#login) return this.#login;
    this.#controller = new AbortController();
    this.#login = (async () => {
      try {
        this.user = await this.#request<BotUser>("GET", "/users/@me");
        await this.#request("POST", "/gateway/heartbeat", {});
        await this.#emit("ready", this.user);
        if (!this.#controller?.signal.aborted)
          this.#loop = this.#poll(this.#controller!.signal);
        return this.user!;
      } catch (error) {
        this.#controller?.abort();
        this.#login = undefined;
        this.user = null;
        throw error;
      }
    })();
    return this.#login;
  }

  /** Stop polling and abort pending requests. Presence expires server-side. */
  async destroy(): Promise<void> {
    this.#controller?.abort();
    await this.#loop;
    this.#loop = undefined;
    this.#login = undefined;
    this.user = null;
  }

  async #poll(signal: AbortSignal): Promise<void> {
    let nextHeartbeat = Date.now() + 45_000;
    let failures = 0;
    while (!signal.aborted) {
      try {
        if (Date.now() >= nextHeartbeat) {
          await this.#request("POST", "/gateway/heartbeat", {});
          nextHeartbeat = Date.now() + 45_000;
        }
        const { events } = await this.#request<{
          events: BotEvent[];
          hasMore: boolean;
        }>("GET", "/events?limit=50");
        const acknowledged: string[] = [];
        for (const event of events) {
          if (signal.aborted) break;
          if (!(await this.#eventStore.has(event.id))) {
            await this.#emit("event", event);
            const data =
              event.type === "messageCreate" || event.type === "messageUpdate"
                ? new Message(this, event.data as MessageData)
                : event.type === "interactionCreate"
                  ? new Interaction(this, event.data as InteractionData)
                  : event.data;
            await this.#emit(event.type as BotEventType, data);
            await this.#eventStore.mark(event.id);
          }
          acknowledged.push(event.id);
        }
        if (acknowledged.length && !signal.aborted)
          await this.#request("POST", "/events/ack", {
            eventIds: acknowledged,
          });
        failures = 0;
        await delay(this.#pollInterval, signal);
      } catch (error) {
        if (signal.aborted) break;
        const safeError =
          error instanceof Error
            ? error
            : new Error("Bot event delivery failed.");
        try {
          await this.#emit("error", safeError);
        } catch {
          /* Error listeners must not break recovery. */
        }
        if (
          error instanceof KyroAPIError &&
          (error.status === 401 || error.status === 403)
        ) {
          signal.throwIfAborted();
          this.#controller?.abort();
          this.#login = undefined;
          this.user = null;
          break;
        }
        failures += 1;
        try {
          await delay(
            Math.min(60_000, this.#pollInterval * 2 ** Math.min(failures, 5)),
            signal,
          );
        } catch {
          break;
        }
      }
    }
  }

  async #request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const timeout = AbortSignal.timeout(this.#timeout);
      const signal = this.#controller
        ? AbortSignal.any([timeout, this.#controller.signal])
        : timeout;
      const requestHeaders = new Headers(headers);
      requestHeaders.set("Authorization", `Bot ${this.#token}`);
      requestHeaders.set("Accept", "application/json");
      const binary = body instanceof Uint8Array;
      if (body !== undefined && !binary)
        requestHeaders.set("Content-Type", "application/json");
      let response: Response;
      try {
        response = await this.#fetch(`${this.#apiBase}${path}`, {
          method,
          headers: requestHeaders,
          redirect: "error",
          signal,
          body:
            body === undefined
              ? undefined
              : binary
                ? (body as Uint8Array<ArrayBuffer>)
                : JSON.stringify(body),
        });
      } catch {
        throw new KyroAPIError(
          0,
          signal.aborted ? "REQUEST_ABORTED" : "NETWORK_ERROR",
          signal.aborted
            ? "The request timed out or the client stopped."
            : "Could not reach the Kyro Bot API.",
        );
      }
      let envelope: {
        data?: T;
        error?: { code?: string; message?: string; retryAfter?: number };
      };
      try {
        envelope = (await response.json()) as typeof envelope;
      } catch {
        throw new KyroAPIError(
          response.status,
          "INVALID_RESPONSE",
          "The Bot API returned an invalid response.",
        );
      }
      if (!response.ok) {
        const retryAfter = Number(
          response.headers.get("Retry-After") ??
            envelope.error?.retryAfter ??
            1,
        );
        if (response.status === 429 && attempt < this.#retries) {
          await delay(
            Math.min(
              60_000,
              Math.max(
                1000,
                Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000,
              ),
            ),
            this.#controller?.signal,
          );
          continue;
        }
        const message = (
          envelope.error?.message ??
          `Kyro API request failed (${response.status}).`
        )
          .split(this.#token)
          .join("[redacted]");
        throw new KyroAPIError(
          response.status,
          envelope.error?.code ?? "API_ERROR",
          message,
          response.status === 429 ? retryAfter : undefined,
        );
      }
      if (!("data" in envelope))
        throw new KyroAPIError(
          response.status,
          "INVALID_RESPONSE",
          "The Bot API response is missing data.",
        );
      return envelope.data as T;
    }
  }

  async sendMessage(
    channelId: string,
    value: string | MessageOptions,
  ): Promise<Message> {
    const options = messageOptions(value);
    return new Message(
      this,
      await this.#request<MessageData>(
        "POST",
        `/channels/${segment(channelId)}/messages`,
        { ...options, clientId: options.clientId ?? randomUUID() },
      ),
    );
  }
  async editMessage(
    channelId: string,
    messageId: string,
    value: string | Pick<MessageOptions, "content" | "embeds">,
  ): Promise<Message> {
    return new Message(
      this,
      await this.#request<MessageData>(
        "PATCH",
        `/channels/${segment(channelId)}/messages/${segment(messageId)}`,
        messageOptions(value),
      ),
    );
  }
  deleteMessage(
    channelId: string,
    messageId: string,
  ): Promise<{ deleted: boolean }> {
    return this.#request(
      "DELETE",
      `/channels/${segment(channelId)}/messages/${segment(messageId)}`,
    );
  }
  async getMessages(
    channelId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.before) params.set("before", options.before);
    const result = await this.#request<{
      messages: MessageData[];
      hasMore: boolean;
    }>("GET", `/channels/${segment(channelId)}/messages?${params}`);
    return {
      ...result,
      messages: result.messages.map((entry) => new Message(this, entry)),
    };
  }
  getServer(serverId: string): Promise<Server> {
    return this.#request("GET", `/servers/${segment(serverId)}`);
  }
  getChannel(channelId: string): Promise<Channel> {
    return this.#request("GET", `/channels/${segment(channelId)}`);
  }
  async getMessage(channelId: string, messageId: string): Promise<Message> {
    return new Message(
      this,
      await this.#request<MessageData>(
        "GET",
        `/channels/${segment(channelId)}/messages/${segment(messageId)}`,
      ),
    );
  }
  createChannel(
    serverId: string,
    channel: { name: string; topic?: string },
  ): Promise<Channel> {
    return this.#request(
      "POST",
      `/servers/${segment(serverId)}/channels`,
      channel,
    );
  }
  deleteChannel(channelId: string): Promise<{ deleted: boolean }> {
    return this.#request("DELETE", `/channels/${segment(channelId)}`);
  }
  async getChannels(serverId: string): Promise<Channel[]> {
    return (
      await this.#request<{ channels: Channel[] }>(
        "GET",
        `/servers/${segment(serverId)}/channels`,
      )
    ).channels;
  }
  getMember(serverId: string, userId: string): Promise<Member> {
    return this.#request(
      "GET",
      `/servers/${segment(serverId)}/members/${segment(userId)}`,
    );
  }
  createRole(
    serverId: string,
    role: { name: string; permissions: Permission[]; color?: string },
  ): Promise<Role> {
    return this.#request("POST", `/servers/${segment(serverId)}/roles`, role);
  }
  updateRole(
    serverId: string,
    roleId: string,
    role: { name?: string; permissions?: Permission[]; color?: string },
  ): Promise<Role> {
    return this.#request(
      "PATCH",
      `/servers/${segment(serverId)}/roles/${segment(roleId)}`,
      role,
    );
  }
  setMemberRoles(
    serverId: string,
    userId: string,
    roleIds: string[],
  ): Promise<unknown> {
    return this.#request(
      "PUT",
      `/servers/${segment(serverId)}/members/${segment(userId)}/roles`,
      { roleIds },
    );
  }
  kickMember(serverId: string, userId: string): Promise<unknown> {
    return this.#request(
      "DELETE",
      `/servers/${segment(serverId)}/members/${segment(userId)}`,
    );
  }
  banMember(
    serverId: string,
    userId: string,
    reason?: string,
  ): Promise<unknown> {
    return this.#request(
      "PUT",
      `/servers/${segment(serverId)}/bans/${segment(userId)}`,
      { reason },
    );
  }
  addReaction(
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<unknown> {
    return this.#request(
      "POST",
      `/channels/${segment(channelId)}/messages/${segment(messageId)}/reactions`,
      { emoji },
    );
  }
  createPoll(
    channelId: string,
    options: PollOptions,
  ): Promise<{ id: string; message: MessageData }> {
    return this.#request(
      "POST",
      `/channels/${segment(channelId)}/polls`,
      options,
    );
  }
  uploadAttachment(
    channelId: string,
    file: { data: Uint8Array; name: string; mimeType: string },
  ): Promise<Attachment> {
    if (!file.name || /[\r\n]/.test(file.name))
      throw new Error("Provide a valid attachment filename.");
    return this.#request(
      "POST",
      `/channels/${segment(channelId)}/attachments`,
      file.data,
      {
        "Content-Type": file.mimeType,
        "X-Filename": encodeURIComponent(file.name),
      },
    );
  }
  async registerCommands(
    commands: CommandDefinition[],
    serverId?: string,
  ): Promise<Command[]> {
    return (
      await this.#request<{ commands: Command[] }>(
        "PUT",
        "/applications/@me/commands",
        { serverId, commands },
      )
    ).commands;
  }
  async getCommands(serverId?: string): Promise<Command[]> {
    const query = serverId ? `?serverId=${segment(serverId)}` : "";
    return (
      await this.#request<{ commands: Command[] }>(
        "GET",
        `/applications/@me/commands${query}`,
      )
    ).commands;
  }
  respondToInteraction(
    interactionId: string,
    response: InteractionResponse,
  ): Promise<unknown> {
    return this.#request(
      "POST",
      `/interactions/${segment(interactionId)}/responses`,
      response,
    );
  }
  getGateway(): Promise<{
    signingPublicKey: string | null;
    events: BotEventType[];
  }> {
    return this.#request("GET", "/gateway");
  }
}
