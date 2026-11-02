// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { PasswordWithTwoFactor } from "./auth/passwordWithTwoFactor";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // One provider owns the existing `password` credential namespace. It keeps
  // normal sign-up/sign-in compatible and adds TOTP only for enrolled users,
  // so a caller cannot bypass 2FA through a second password provider.
  providers: [PasswordWithTwoFactor()],
});
