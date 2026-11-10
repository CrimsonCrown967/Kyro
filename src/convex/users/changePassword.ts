import { v } from "convex/values";
import {
  getAuthUserId,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { action, internalQuery } from "../functions";
import { internal } from "../_generated/api";

/**
 * Change the signed-in account's password.
 *
 * The current password is verified against the stored credential with
 * @convex-dev/auth's `retrieveAccount` — the exact same check sign-in runs —
 * and the new one replaces it through `modifyAccountCredentials`, which
 * hashes it with the password provider's Scrypt crypto. Sign-in keeps
 * working unchanged because the credential row and format never move.
 */

/** The password credential context for an account: its email + whether a password exists. */
export const passwordContext = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const email = user.email ?? null;
    const account = email
      ? await ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) =>
            q.eq("userId", userId).eq("provider", "password"),
          )
          .unique()
      : null;
    return { email, hasPassword: account !== null };
  },
});

export const changePassword = action({
  args: { currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, { currentPassword, newPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You're not signed in.");
    if (newPassword.length < 8) {
      throw new Error("New passwords need at least 8 characters.");
    }
    if (newPassword.length > 200) {
      throw new Error("New passwords can be at most 200 characters.");
    }
    if (newPassword === currentPassword) {
      throw new Error("Your new password must be different from the current one.");
    }

    const context = await ctx.runQuery(
      internal.users.changePassword.passwordContext,
      { userId },
    );
    if (!context) throw new Error("You're not signed in.");
    if (!context.email || !context.hasPassword) {
      throw new Error(
        "This account doesn't sign in with a password, so there's nothing to change.",
      );
    }

    // Verify the current password exactly the way sign-in does. It reports
    // failure either by returning null or by throwing, so treat both the same.
    const verified = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: context.email, secret: currentPassword },
    }).catch(() => null);
    if (!verified || verified.user._id !== userId) {
      throw new Error("Your current password is incorrect.");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: context.email, secret: newPassword },
    });
    return true;
  },
});
