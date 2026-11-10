// Password authentication; the callback maintains counters for Auth-owned user writes.

import { convexAuth } from "@convex-dev/auth/server";
import { PasswordWithTwoFactor } from "./auth/passwordWithTwoFactor";
import { syncUserMetrics } from "./metricsLib";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // One provider owns the existing `password` credential namespace. It keeps
  // normal sign-up/sign-in compatible and adds TOTP only for enrolled users,
  // so a caller cannot bypass 2FA through a second password provider.
  providers: [PasswordWithTwoFactor()],
  callbacks: {
    // Auth writes bypass application triggers; keep registration counts accurate.
    afterUserCreatedOrUpdated: async (ctx, { userId }) => {
      const typedCtx = ctx as MutationCtx;
      const user = await typedCtx.db.get(userId);
      if (user && user.presenceOnline === undefined)
        await typedCtx.db.patch(userId, { presenceOnline: false });
      await syncUserMetrics(typedCtx, await typedCtx.db.get(userId), userId);
    },
  },
});
