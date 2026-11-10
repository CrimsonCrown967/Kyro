import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../functions";

export type Ctx = QueryCtx | MutationCtx;

export const PRESENCE_TIMEOUT_MS = 60_000;

export async function getAuthUserIdOrThrow(ctx: Ctx): Promise<Id<"users">> {
  const id = await getAuthUserId(ctx);
  if (id === null) throw new Error("You need to sign in to do that.");
  return id;
}

export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const id = await getAuthUserId(ctx);
  if (id === null) return null;
  return await ctx.db.get(id);
}

export async function requireProfile(
  ctx: Ctx,
): Promise<{ id: Id<"users">; username: string; name: string }> {
  const id = await getAuthUserIdOrThrow(ctx);
  const user = await ctx.db.get(id);
  if (!user) throw new Error("User not found.");
  return { id, username: String(user.username), name: String(user.name) };
}
