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
import type * as automod from "../automod.js";
import type * as bugReports from "../bugReports.js";
import type * as channels from "../channels.js";
import type * as cleanup from "../cleanup.js";
import type * as conversations from "../conversations.js";
import type * as emojis from "../emojis.js";
import type * as files from "../files.js";
import type * as forums from "../forums.js";
import type * as gifs from "../gifs.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as passwordReset from "../passwordReset.js";
import type * as polls from "../polls.js";
import type * as reports from "../reports.js";
import type * as roles from "../roles.js";
import type * as schema from "../schema.js";
import type * as servers from "../servers.js";
import type * as sha256 from "../sha256.js";
import type * as social from "../social.js";
import type * as tempResetPassword from "../tempResetPassword.js";
import type * as threads from "../threads.js";
import type * as uploadSecurity from "../uploadSecurity.js";
import type * as users from "../users.js";
import type * as users_changePassword from "../users/changePassword.js";
import type * as users_createAccount from "../users/createAccount.js";
import type * as users_lib from "../users/lib.js";
import type * as voice from "../voice.js";
import type * as warnings from "../warnings.js";

const fullApi: ApiFromModules<{
  "admin": typeof admin,
  "applications": typeof applications,
  "auth": typeof auth,
  "auth.config": typeof auth_config,
  "auth/emailOtp": typeof auth_emailOtp,
  "automod": typeof automod,
  "bugReports": typeof bugReports,
  "channels": typeof channels,
  "cleanup": typeof cleanup,
  "conversations": typeof conversations,
  "emojis": typeof emojis,
  "files": typeof files,
  "forums": typeof forums,
  "gifs": typeof gifs,
  "http": typeof http,
  "lib": typeof lib,
  "messages": typeof messages,
  "notifications": typeof notifications,
  "passwordReset": typeof passwordReset,
  "polls": typeof polls,
  "reports": typeof reports,
  "roles": typeof roles,
  "schema": typeof schema,
  "servers": typeof servers,
  "sha256": typeof sha256,
  "social": typeof social,
  "tempResetPassword": typeof tempResetPassword,
  "threads": typeof threads,
  "uploadSecurity": typeof uploadSecurity,
  "users": typeof users,
  "users/changePassword": typeof users_changePassword,
  "users/createAccount": typeof users_createAccount,
  "users/lib": typeof users_lib,
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
