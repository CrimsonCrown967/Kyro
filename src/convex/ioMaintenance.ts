import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./functions";
import {
  metricValue,
  syncMetricEntry,
  syncUserMetrics,
  syncMemberMetrics,
} from "./metricsLib";
import { PRESENCE_TIMEOUT_MS } from "./lib";

const table = v.union(
  v.literal("users"),
  v.literal("servers"),
  v.literal("messages"),
  v.literal("serverMembers"),
);
const backfillRef = makeFunctionReference<"mutation">("ioMaintenance:backfill");

/** One-time, resumable migration, not a cron. Each page is at most 100 documents. */
export const backfill = internalMutation({
  args: { table, cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(args.table)
      .withIndex("by_creation_time")
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    for (const row of result.page) {
      if (args.table === "users") {
        const id = ctx.db.normalizeId("users", row._id)!;
        let user = (await ctx.db.get(id))!;
        if (user.presenceOnline === undefined) {
          const online =
            user.lastSeen !== undefined &&
            user.lastSeen + PRESENCE_TIMEOUT_MS > Date.now() &&
            user.status !== "offline";
          await ctx.db.patch(id, { presenceOnline: online });
          if (online) {
            const lease = await ctx.db
              .query("userPresence")
              .withIndex("by_user", (q) => q.eq("userId", id))
              .unique();
            if (!lease)
              await ctx.db.insert("userPresence", {
                userId: id,
                lastHeartbeatAt: user.lastSeen!,
                expiresAt: user.lastSeen! + PRESENCE_TIMEOUT_MS,
              });
          }
          user = (await ctx.db.get(id))!;
        }
        await syncUserMetrics(ctx, user, id);
      } else if (args.table === "serverMembers") {
        const member = (await ctx.db.get(
          ctx.db.normalizeId("serverMembers", row._id)!,
        ))!;
        await syncMemberMetrics(ctx, member, member._id);
      } else {
        if (args.table === "servers") {
          const server = (await ctx.db.get(
            ctx.db.normalizeId("servers", row._id)!,
          ))!;
          if (server.tag && server.tag !== server.tag.toUpperCase())
            await ctx.db.patch(server._id, { tag: server.tag.toUpperCase() });
        }
        await syncMetricEntry(ctx, `${args.table}:${row._id}`, {
          [args.table]: 1,
        });
      }
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, backfillRef, {
        table: args.table,
        cursor: result.continueCursor,
      });
    else
      await syncMetricEntry(ctx, `backfill:${args.table}`, {
        [`backfill:${args.table}`]: 1,
      });
    return {
      table: args.table,
      processed: result.page.length,
      done: result.isDone,
      cursor: result.continueCursor,
    };
  },
});

export const status = internalQuery({
  args: {},
  handler: async (ctx) =>
    Object.fromEntries(
      await Promise.all(
        [
          "users",
          "servers",
          "messages",
          "publicOnline",
          "backfill:users",
          "backfill:servers",
          "backfill:messages",
          "backfill:serverMembers",
        ].map(async (key) => [key, await metricValue(ctx, key)]),
      ),
    ),
});
