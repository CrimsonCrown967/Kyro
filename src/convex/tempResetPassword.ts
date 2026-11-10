import { v } from "convex/values";
import {
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { internalAction, internalQuery } from "./functions";
import { internal } from "./_generated/api";

/** One-off helper: look up an account by handle and its password credential. */
export const lookup = internalQuery({
  args: { username: v.string() },
  handler: async (
    ctx,
    { username },
  ): Promise<{
    userId: string;
    name: string | null;
    email: string | null;
    hasPassword: boolean;
    credentialId: string | null;
  } | null> => {
    const handle = username.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", handle))
      .unique();
    if (!user) return null;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", user._id).eq("provider", "password"),
      )
      .unique();
    return {
      userId: user._id as string,
      name: user.name ?? null,
      email: user.email ?? null,
      hasPassword: account !== null,
      credentialId: account?.providerAccountId ?? null,
    };
  },
});

/** One-off helper: find accounts by handle/email prefix or indexed name. */
export const find = internalQuery({
  args: { text: v.string() },
  handler: async (
    ctx,
    { text },
  ): Promise<
    Array<{
      userId: string;
      username: string | null;
      name: string | null;
      email: string | null;
      hasPassword: boolean;
    }>
  > => {
    const needle = text.trim().toLowerCase();
    const rows =
      needle === "*"
        ? await ctx.db.query("users").withIndex("by_creation_time").take(50)
        : [
            ...new Map(
              (
                await Promise.all([
                  ctx.db
                    .query("users")
                    .withIndex("by_username", (q) =>
                      q
                        .gte("username", needle)
                        .lt("username", needle + "\uffff"),
                    )
                    .take(10),
                  ctx.db
                    .query("users")
                    .withIndex("email", (q) =>
                      q.gte("email", needle).lt("email", needle + "\uffff"),
                    )
                    .take(10),
                  ...(needle
                    ? [
                        ctx.db
                          .query("users")
                          .withSearchIndex("search_name", (q) =>
                            q.search("name", needle),
                          )
                          .take(10),
                      ]
                    : []),
                ])
              )
                .flat()
                .map((user) => [user._id, user]),
            ).values(),
          ];
    if (needle === "*") {
      return rows.slice(0, 50).map((u) => ({
        userId: u._id as string,
        username: u.username ?? null,
        name: u.name ?? null,
        email: u.email ?? null,
        hasPassword: false,
      }));
    }
    return rows
      .filter(
        (u) =>
          (u.username ?? "").toLowerCase().includes(needle) ||
          (u.email ?? "").toLowerCase().includes(needle) ||
          (u.name ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 10)
      .map((u) => ({
        userId: u._id as string,
        username: u.username ?? null,
        name: u.name ?? null,
        email: u.email ?? null,
        hasPassword: false,
      }));
  },
});

/** One-off helper: set an account's password by handle, then verify it. */
export const resetPassword = internalAction({
  args: { username: v.string(), newPassword: v.string() },
  handler: async (
    ctx,
    { username, newPassword },
  ): Promise<{
    userId: string;
    name: string | null;
    email: string | null;
    verified: boolean;
  }> => {
    const target: {
      userId: string;
      name: string | null;
      email: string | null;
      hasPassword: boolean;
      credentialId: string | null;
    } | null = await ctx.runQuery(internal.tempResetPassword.lookup, {
      username,
    });
    if (!target) throw new Error(`No account with the handle "${username}".`);
    if (!target.credentialId) {
      throw new Error(`"${username}" has no password credential.`);
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: target.credentialId, secret: newPassword },
    });

    // Verify exactly the way sign-in does.
    const verified = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: target.credentialId, secret: newPassword },
    }).catch(() => null);
    if (!verified || verified.user._id !== target.userId) {
      throw new Error("Password was written but sign-in verification failed.");
    }

    return {
      userId: target.userId,
      name: target.name,
      email: target.email,
      verified: true,
    };
  },
});
