import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { Scrypt } from "lucia";
import type { Id } from "../_generated/dataModel";
import { sha256Hex } from "../sha256";
import {
  securityConsumeRecoveryCode,
  securitySignInState,
} from "../securityRefs";
import { normalizeRecoveryCode, verifyTotp } from "../totp";
import { verificationRequirementRef } from "../verificationRefs";

function recoveryHash(userId: string, code: string) {
  return sha256Hex(`${userId}:${normalizeRecoveryCode(code)}`);
}

/** The only password provider: password plus TOTP when the account enables it. */
export function PasswordWithTwoFactor() {
  return ConvexCredentials({
    // Keeping this id as "password" preserves every existing credential row
    // while preventing direct calls to an unguarded legacy provider.
    id: "password",
    authorize: async (params, ctx) => {
      const email = String(params.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(params.password ?? "");
      const flow = String(params.flow ?? "signIn");
      if (!email || !password) throw new Error("Invalid credentials");

      let userId: Id<"users">;
      if (flow === "signUp") {
        if (password.length < 8 || password.length > 200) {
          throw new Error("Password must be 8–200 characters.");
        }
        const created = await createAccount(ctx, {
          provider: "password",
          account: { id: email, secret: password },
          profile: { email },
          shouldLinkViaEmail: false,
          shouldLinkViaPhone: false,
        });
        userId = created.user._id;
      } else if (flow === "signIn") {
        const retrieved = await retrieveAccount(ctx, {
          provider: "password",
          account: { id: email, secret: password },
        }).catch(() => null);
        if (!retrieved) throw new Error("Invalid credentials");
        userId = retrieved.user._id;
      } else {
        throw new Error("Unsupported password flow.");
      }

      if (await ctx.runQuery(verificationRequirementRef, { userId })) {
        throw new Error(
          "EMAIL_VERIFICATION_REQUIRED: Verify your email before signing in.",
        );
      }

      const security = await ctx.runQuery(securitySignInState, { userId });
      if (security?.twoFactorEnabled && security.totpSecret) {
        const code = String(params.code ?? "").trim();
        if (!code) {
          throw new Error(
            "TWO_FACTOR_REQUIRED: Enter your authenticator or recovery code.",
          );
        }
        const validTotp = await verifyTotp(security.totpSecret, code);
        const validRecovery = validTotp
          ? false
          : await ctx.runMutation(securityConsumeRecoveryCode, {
              userId,
              codeHash: recoveryHash(userId, code),
            });
        if (!validTotp && !validRecovery) {
          throw new Error(
            "INVALID_TWO_FACTOR_CODE: That authenticator or recovery code isn't valid.",
          );
        }
      }
      return { userId };
    },
    crypto: {
      async hashSecret(secret: string) {
        return await new Scrypt().hash(secret);
      },
      async verifySecret(secret: string, hash: string) {
        return await new Scrypt().verify(hash, secret);
      },
    },
  });
}
