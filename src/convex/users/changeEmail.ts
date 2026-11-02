import { getAuthUserId, retrieveAccount } from "@convex-dev/auth/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const EMAIL_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const contextRef = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  {
    email: string | null;
    emailChangedAt: number | null;
    hasPassword: boolean;
  } | null
>("users/changeEmailInternal:context");

const applyRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; newEmail: string },
  number
>("users/changeEmailInternal:apply");

export const changeEmail = action({
  args: { newEmail: v.string(), currentPassword: v.string() },
  handler: async (ctx, { newEmail, currentPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You're not signed in.");
    const normalized = newEmail.trim().toLowerCase();
    if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
      throw new Error("Enter a valid email address.");
    }
    const current = await ctx.runQuery(contextRef, {
      userId,
    });
    if (!current?.email || !current.hasPassword) {
      throw new Error("This account doesn't use password sign-in.");
    }
    if (normalized === current.email.toLowerCase()) {
      throw new Error("That is already your account email.");
    }
    if (
      current.emailChangedAt !== null &&
      Date.now() - current.emailChangedAt < EMAIL_CHANGE_COOLDOWN_MS
    ) {
      throw new Error("Email addresses can only be changed once every 7 days.");
    }
    const verified = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: current.email, secret: currentPassword },
    }).catch(() => null);
    if (!verified || verified.user._id !== userId) {
      throw new Error("Your current password is incorrect.");
    }
    return await ctx.runMutation(applyRef, {
      userId,
      newEmail: normalized,
    });
  },
});
