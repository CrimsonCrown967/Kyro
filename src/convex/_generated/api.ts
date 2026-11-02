/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev` (or `npm run gen:convex` offline).
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import { anyApi } from "convex/server";
import type * as admin from "../admin.js";
import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as auth_config from "../auth.config.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_passwordWithTwoFactor from "../auth/passwordWithTwoFactor.js";
import type * as automod from "../automod.js";
import type * as bugReports from "../bugReports.js";
import type * as channels from "../channels.js";
import type * as cleanup from "../cleanup.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as emailOutbox from "../emailOutbox.js";
import type * as emailRefs from "../emailRefs.js";
import type * as emailVerification from "../emailVerification.js";
import type * as emailVerificationInternal from "../emailVerificationInternal.js";
import type * as emojis from "../emojis.js";
import type * as files from "../files.js";
import type * as forums from "../forums.js";
import type * as gifs from "../gifs.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as messages from "../messages.js";
import type * as moderation from "../moderation.js";
import type * as notifications from "../notifications.js";
import type * as passwordReset from "../passwordReset.js";
import type * as passwordResetInternal from "../passwordResetInternal.js";
import type * as platformStats from "../platformStats.js";
import type * as polls from "../polls.js";
import type * as reports from "../reports.js";
import type * as roles from "../roles.js";
import type * as schema from "../schema.js";
import type * as security from "../security.js";
import type * as securityInternal from "../securityInternal.js";
import type * as securityRefs from "../securityRefs.js";
import type * as servers from "../servers.js";
import type * as sha256 from "../sha256.js";
import type * as social from "../social.js";
import type * as tempResetPassword from "../tempResetPassword.js";
import type * as threads from "../threads.js";
import type * as totp from "../totp.js";
import type * as uploadSecurity from "../uploadSecurity.js";
import type * as users from "../users.js";
import type * as users_changeEmail from "../users/changeEmail.js";
import type * as users_changeEmailInternal from "../users/changeEmailInternal.js";
import type * as users_changePassword from "../users/changePassword.js";
import type * as users_createAccount from "../users/createAccount.js";
import type * as users_lib from "../users/lib.js";
import type * as verificationCodes from "../verificationCodes.js";
import type * as verificationRefs from "../verificationRefs.js";
import type * as voice from "../voice.js";
import type * as warnings from "../warnings.js";

const fullApi: ApiFromModules<{
  "admin": typeof admin,
  "applications": typeof applications,
  "auth": typeof auth,
  "auth.config": typeof auth_config,
  "auth/emailOtp": typeof auth_emailOtp,
  "auth/passwordWithTwoFactor": typeof auth_passwordWithTwoFactor,
  "automod": typeof automod,
  "bugReports": typeof bugReports,
  "channels": typeof channels,
  "cleanup": typeof cleanup,
  "conversations": typeof conversations,
  "crons": typeof crons,
  "emailDelivery": typeof emailDelivery,
  "emailOutbox": typeof emailOutbox,
  "emailRefs": typeof emailRefs,
  "emailVerification": typeof emailVerification,
  "emailVerificationInternal": typeof emailVerificationInternal,
  "emojis": typeof emojis,
  "files": typeof files,
  "forums": typeof forums,
  "gifs": typeof gifs,
  "http": typeof http,
  "lib": typeof lib,
  "maintenance": typeof maintenance,
  "messages": typeof messages,
  "moderation": typeof moderation,
  "notifications": typeof notifications,
  "passwordReset": typeof passwordReset,
  "passwordResetInternal": typeof passwordResetInternal,
  "platformStats": typeof platformStats,
  "polls": typeof polls,
  "reports": typeof reports,
  "roles": typeof roles,
  "schema": typeof schema,
  "security": typeof security,
  "securityInternal": typeof securityInternal,
  "securityRefs": typeof securityRefs,
  "servers": typeof servers,
  "sha256": typeof sha256,
  "social": typeof social,
  "tempResetPassword": typeof tempResetPassword,
  "threads": typeof threads,
  "totp": typeof totp,
  "uploadSecurity": typeof uploadSecurity,
  "users": typeof users,
  "users/changeEmail": typeof users_changeEmail,
  "users/changeEmailInternal": typeof users_changeEmailInternal,
  "users/changePassword": typeof users_changePassword,
  "users/createAccount": typeof users_createAccount,
  "users/lib": typeof users_lib,
  "verificationCodes": typeof verificationCodes,
  "verificationRefs": typeof verificationRefs,
  "voice": typeof voice,
  "warnings": typeof warnings,
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<typeof fullApi, FunctionReference<any, "public">> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">> = anyApi as any;
