import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export function botFailure(code: string, message: string): never {
  throw new ConvexError({ code, message });
}
export async function rateLimit(
  ctx: MutationCtx,
  key: string,
  maximum: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const row = await ctx.db
    .query("botRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) {
    await ctx.db.insert("botRateLimits", { key, windowStart: now, count: 1 });
    return true;
  }
  if (now - row.windowStart >= windowMs) {
    await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    return true;
  }
  if (row.count >= maximum) return false;
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}
export async function recordBotUsage(
  ctx: MutationCtx,
  applicationId: Id<"botApplications">,
  kind: "requests" | "commands",
) {
  const day = new Date().toISOString().slice(0, 10);
  const existing = await ctx.db
    .query("botApiUsage")
    .withIndex("by_application_day", (q) =>
      q.eq("applicationId", applicationId).eq("day", day),
    )
    .unique();
  if (existing)
    await ctx.db.patch(existing._id, { [kind]: existing[kind] + 1 });
  else
    await ctx.db.insert("botApiUsage", {
      applicationId,
      day,
      requests: kind === "requests" ? 1 : 0,
      commands: kind === "commands" ? 1 : 0,
    });
}
