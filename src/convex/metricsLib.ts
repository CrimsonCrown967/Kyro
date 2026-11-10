import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isPlatformAdmin, isPresenceOnline, visiblePresence } from "./lib";

/** Tiny, transactional counters. Per-source entries make backfill/retries idempotent. */
export async function syncMetricEntry(
  ctx: MutationCtx,
  source: string,
  values: Record<string, number>,
) {
  const existing = await ctx.db
    .query("metricEntries")
    .withIndex("by_source", (q) => q.eq("source", source))
    .unique();
  const previous = existing?.values ?? {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(values)]);
  let changed = false;
  for (const key of keys) {
    const delta = (values[key] ?? 0) - (previous[key] ?? 0);
    if (!delta) continue;
    changed = true;
    const counter = await ctx.db
      .query("metrics")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (counter)
      await ctx.db.patch(counter._id, { value: counter.value + delta });
    else await ctx.db.insert("metrics", { key, value: delta });
  }
  if (!changed) return false;
  if (!Object.values(values).some(Boolean)) {
    if (existing) await ctx.db.delete(existing._id);
  } else if (existing) await ctx.db.patch(existing._id, { values });
  else await ctx.db.insert("metricEntries", { source, values });
  return true;
}

export async function syncUserMetrics(
  ctx: MutationCtx,
  user: Doc<"users"> | null,
  id: string,
) {
  const active = user !== null && user.deletedAt === undefined;
  const changed = await syncMetricEntry(
    ctx,
    `users:${id}`,
    active
      ? {
          users: 1,
          online: Number(isPresenceOnline(user)),
          publicOnline: Number(
            !["offline", "invisible"].includes(visiblePresence(user, false)),
          ),
          admins: Number(isPlatformAdmin(user)),
          moderators: Number(user.siteModerator === true),
        }
      : {},
  );
  if (changed) {
    const userId = ctx.db.normalizeId("users", id)!;
    const memberships = await ctx.db
      .query("serverMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const member of memberships)
      await syncMemberMetrics(ctx, member, member._id, user);
  }
}

export async function syncMemberMetrics(
  ctx: MutationCtx,
  member: Doc<"serverMembers"> | null,
  id: string,
  knownUser?: Doc<"users"> | null,
) {
  const user =
    knownUser === undefined && member
      ? await ctx.db.get(member.userId)
      : knownUser;
  await syncMetricEntry(
    ctx,
    `serverMembers:${id}`,
    member
      ? {
          [`members:${member.serverId}`]: 1,
          [`onlineMembers:${member.serverId}`]: Number(
            Boolean(
              user &&
              user.deletedAt === undefined &&
              visiblePresence(user, false) !== "offline",
            ),
          ),
        }
      : {},
  );
}

export async function metricValue(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<number> {
  const row = await ctx.db
    .query("metrics")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value ?? 0;
}
