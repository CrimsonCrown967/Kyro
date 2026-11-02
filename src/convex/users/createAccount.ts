import { v } from "convex/values";
import { createAccount as createAuthAccount } from "@convex-dev/auth/server";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  isReservedUsername,
  normalizeUsername,
  USERNAME_PATTERN,
} from "../lib";
import { generateSixDigitCode } from "../verificationCodes";
import { prepareEmailVerificationRef } from "../verificationRefs";

/**
 * Registration for Kyro: email + password, no email verification code.
 *
 * This runs as an action because creating the credentials account must happen
 * through @convex-dev/auth's `createAccount` helper, which needs an action
 * ctx. The handle is reserved server-side before the account exists, and the
 * client signs in with the `password` provider (`flow: "signIn"`) right after.
 */

/** True when another user already owns this handle. */
export const usernameTaken = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    return taken !== null;
  },
});

/** True when a password account already exists for this email. */
export const emailRegistered = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    return account !== null;
  },
});

export const createAccount = action({
  args: {
    email: v.string(),
    password: v.string(),
    username: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { email, password, username, name }) => {
    const verificationRequired =
      process.env.KYRO_EMAIL_VERIFICATION_ENABLED === "true";
    // Generate before creating anything so an unavailable CSPRNG cannot leave
    // behind an account that has no possible verification code.
    const verificationCode = verificationRequired
      ? generateSixDigitCode()
      : null;
    const handle = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(handle)) {
      throw new Error(
        "Usernames are 3–32 characters and use lowercase letters, numbers or underscores.",
      );
    }
    if (isReservedUsername(handle)) {
      throw new Error("That username is reserved.");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (password.length > 200) {
      throw new Error("Password must be at most 200 characters.");
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      throw new Error("Enter a valid email address.");
    }

    const [taken, registered] = await Promise.all([
      ctx.runQuery(internal.users.createAccount.usernameTaken, {
        username: handle,
      }),
      ctx.runQuery(internal.users.createAccount.emailRegistered, {
        email: normalizedEmail,
      }),
    ]);
    if (taken) throw new Error("That username is already taken.");
    if (registered) {
      throw new Error(
        "An account with that email already exists — sign in instead.",
      );
    }

    const displayName = (name?.trim() || handle).slice(0, 64);
    const { user } = await createAuthAccount(ctx, {
      provider: "password",
      account: { id: normalizedEmail, secret: password },
      profile: {
        email: normalizedEmail,
        name: displayName,
        username: handle,
        status: "online",
        lastSeen: Date.now(),
        createdAt: Date.now(),
        dmPolicy: "everyone",
        allowFriendRequests: true,
        showPresence: true,
        requiresEmailVerification: verificationRequired || undefined,
      },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });

    // Every new account lands in Kyro HQ automatically.
    await ctx.runMutation(internal.servers.joinHqInternal, {
      userId: user._id,
    });

    let verificationQueued = false;
    if (verificationRequired && verificationCode) {
      verificationQueued = true;
      try {
        await ctx.runMutation(prepareEmailVerificationRef, {
          userId: user._id,
          email: normalizedEmail,
          code: verificationCode,
        });
      } catch {
        // Account creation remains valid. The verification screen offers a safe
        // resend once email delivery is configured or recovers.
        verificationQueued = false;
      }
    }

    return {
      userId: user._id,
      verificationRequired,
      verificationQueued,
    };
  },
});
