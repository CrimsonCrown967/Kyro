import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { botChannel, botServer, messageDto } from "./botLib";
import type { Ctx } from "./lib";

export async function queueBotEvent(
  ctx: MutationCtx,
  serverId: Id<"servers">,
  type: string,
  data: unknown,
  channelId?: Id<"channels">,
  onlyApplication?: Id<"botApplications">,
) {
  const installs = await ctx.db
    .query("botInstallations")
    .withIndex("by_server", (q) => q.eq("serverId", serverId))
    .collect();
  for (const install of installs) {
    if (onlyApplication && install.applicationId !== onlyApplication) continue;
    const app = await ctx.db.get(install.applicationId);
    if (
      !app ||
      !app.enabled ||
      app.suspended ||
      app.deletedAt ||
      !app.events.includes(type)
    )
      continue;
    try {
      if (channelId)
        await botChannel(
          ctx,
          app,
          channelId,
          type.startsWith("message") ? "read_message_history" : undefined,
        );
      else await botServer(ctx, app, serverId, "view_channel");
    } catch {
      continue;
    }
    const now = Date.now();
    await ctx.db.insert("botEvents", {
      applicationId: app._id,
      deliveryMode: app.deliveryMode,
      serverId,
      channelId,
      type,
      payload: JSON.stringify(data),
      createdAt: now,
      expiresAt: now + 7 * 86400000,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    });
  }
}
/** Recheck visibility at delivery time; queued data must not survive access revocation. */
export async function eventVisible(
  ctx: Ctx,
  app: Doc<"botApplications">,
  event: Doc<"botEvents">,
) {
  if (
    !app.enabled ||
    app.suspended ||
    app.deletedAt ||
    !app.tokenHash ||
    !app.events.includes(event.type)
  )
    return false;
  try {
    if (event.channelId)
      await botChannel(
        ctx,
        app,
        event.channelId,
        event.type.startsWith("message") ? "read_message_history" : undefined,
      );
    else await botServer(ctx, app, event.serverId, "view_channel");
    return true;
  } catch {
    return false;
  }
}
export function eventDto(event: Doc<"botEvents">) {
  return {
    id: event._id,
    type: event.type,
    serverId: event.serverId,
    channelId: event.channelId ?? null,
    timestamp: event.createdAt,
    data: JSON.parse(event.payload) as unknown,
  };
}

// All application mutations use this wrapper, including existing messaging,
// membership and moderation paths. Events commit atomically with their source.
export const botTriggers = new Triggers<DataModel>();
botTriggers.register("messages", async (ctx, change) => {
  const message = change.newDoc ?? change.oldDoc;
  if (message.containerType !== "channel") return;
  if (
    change.operation === "update" &&
    change.oldDoc.content === change.newDoc.content &&
    JSON.stringify(change.oldDoc.embeds) ===
      JSON.stringify(change.newDoc.embeds)
  )
    return;
  const channelId = ctx.db.normalizeId("channels", message.containerId);
  if (!channelId) return;
  const channel = await ctx.db.get(channelId);
  if (!channel) return;
  const type =
    change.operation === "insert"
      ? "messageCreate"
      : change.operation === "update"
        ? "messageUpdate"
        : "messageDelete";
  await queueBotEvent(
    ctx,
    channel.serverId,
    type,
    change.operation === "delete"
      ? { id: message._id, channelId }
      : await messageDto(ctx, message),
    channelId,
  );
});
botTriggers.register("serverMembers", async (ctx, change) => {
  const member = change.newDoc ?? change.oldDoc;
  const user = await ctx.db.get(member.userId);
  await queueBotEvent(
    ctx,
    member.serverId,
    change.operation === "insert"
      ? "memberJoin"
      : change.operation === "delete"
        ? "memberLeave"
        : "memberUpdate",
    {
      id: member.userId,
      username: user?.username ?? null,
      name: user?.name ?? "Deleted user",
      bot: Boolean(user?.botApplicationId),
      roleIds: member.roleIds,
      nickname: member.nickname ?? null,
      joinedAt: member.joinedAt,
    },
  );
  if (change.operation === "delete" && user?.botApplicationId) {
    const install = await ctx.db
      .query("botInstallations")
      .withIndex("by_app_server", (q) =>
        q
          .eq("applicationId", user.botApplicationId!)
          .eq("serverId", member.serverId),
      )
      .unique();
    if (install) {
      await ctx.db.delete(install._id);
      if (await ctx.db.get(install.roleId)) await ctx.db.delete(install.roleId);
    }
  }
});
botTriggers.register("servers", async (ctx, change) => {
  if (change.operation === "delete") return;
  const server = change.newDoc;
  await queueBotEvent(
    ctx,
    server._id,
    change.operation === "insert" ? "serverCreate" : "serverUpdate",
    {
      id: server._id,
      name: server.name,
      description: server.description ?? "",
      ownerId: server.ownerId,
    },
  );
});
botTriggers.register("channels", async (ctx, change) => {
  if (change.operation === "update") return;
  const channel = change.newDoc ?? change.oldDoc;
  if (change.operation === "insert")
    await queueBotEvent(
      ctx,
      channel.serverId,
      "channelCreate",
      {
        id: channel._id,
        name: channel.name,
        kind: channel.kind ?? "text",
        serverId: channel.serverId,
      },
      channel._id,
    );
  else {
    // Channel deletion carries only an ID. This avoids disclosing a formerly hidden name.
    await queueBotEvent(ctx, channel.serverId, "channelDelete", {
      id: channel._id,
      serverId: channel.serverId,
    });
  }
});
botTriggers.register("serverRoles", async (ctx, change) => {
  if (change.operation === "delete") return;
  const role = change.newDoc;
  await queueBotEvent(
    ctx,
    role.serverId,
    change.operation === "insert" ? "roleCreate" : "roleUpdate",
    {
      id: role._id,
      name: role.name,
      permissions: role.permissions,
      color: role.color ?? null,
      position: role.position,
    },
  );
});
