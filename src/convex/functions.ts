/** Stable wrappers: official Convex code generation can replace _generated safely. */
export * from "./_generated/server";
import {
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
} from "./_generated/server";
import {
  customMutation,
  customCtx,
} from "convex-helpers/server/customFunctions";
import { botTriggers } from "./botEvents";
export const mutation: typeof rawMutation = customMutation(
  rawMutation,
  customCtx(botTriggers.wrapDB),
);
export const internalMutation: typeof rawInternalMutation = customMutation(
  rawInternalMutation,
  customCtx(botTriggers.wrapDB),
);
