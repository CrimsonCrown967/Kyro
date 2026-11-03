import type { Doc, Id } from "./_generated/dataModel";
import type { Ctx } from "./lib";
import type { MutationCtx } from "./_generated/server";
import { MAX_UPLOAD_BYTES } from "../lib/uploadLimits";

export { MAX_UPLOAD_BYTES };

export type UploadClaim =
  | "message"
  | "user_avatar"
  | "user_banner"
  | "server_icon"
  | "server_banner"
  | "server_emoji";

const SAFE_CONTENT_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

export function isAllowedUploadType(contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(";", 1)[0].trim();
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("video/") ||
    normalized.startsWith("audio/") ||
    SAFE_CONTENT_TYPES.has(normalized)
  );
}

export function isImageUploadType(contentType: string): boolean {
  return contentType.toLowerCase().split(";", 1)[0].trim().startsWith("image/");
}

export async function uploadByStorageId(
  ctx: Ctx,
  storageId: Id<"_storage">,
): Promise<Doc<"uploads"> | null> {
  return await ctx.db
    .query("uploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
}

export async function requireOwnedUpload(
  ctx: Ctx,
  ownerId: Id<"users">,
  storageId: Id<"_storage">,
  options: { imageOnly?: boolean } = {},
): Promise<Doc<"uploads">> {
  const upload = await uploadByStorageId(ctx, storageId);
  if (!upload || upload.ownerId !== ownerId) {
    throw new Error("That upload does not belong to your account.");
  }
  if (options.imageOnly && !isImageUploadType(upload.mimeType)) {
    throw new Error("Choose an image file for that upload.");
  }
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) {
    throw new Error(
      "That upload is no longer available. Please upload the file again.",
    );
  }
  if (metadata.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than the 10 MB upload limit.");
  }
  return upload;
}

/**
 * Delete an object only when it still exists. Convex throws "storage id ...
 * not found" for stale references, and that must never block the record update
 * that is replacing the reference.
 */
export async function deleteStorageObjectIfPresent(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) return;
  await ctx.storage.delete(storageId);
}

/** Claim an unclaimed upload for exactly one application record. */
export async function claimUpload(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  storageId: Id<"_storage">,
  claimType: UploadClaim,
  claimId: string,
  options: { imageOnly?: boolean } = {},
): Promise<Doc<"uploads">> {
  const upload = await requireOwnedUpload(ctx, ownerId, storageId, options);
  if (upload.claimType !== undefined || upload.claimId !== undefined) {
    if (upload.claimType === claimType && upload.claimId === claimId) {
      return upload;
    }
    throw new Error("That upload is already being used somewhere else.");
  }
  await ctx.db.patch(upload._id, { claimType, claimId });
  return upload;
}

/** Delete only when the stored claim proves this record owns the object. */
export async function deleteClaimedUpload(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined,
  claimType: UploadClaim,
  claimId: string,
): Promise<void> {
  if (!storageId) return;
  const upload = await uploadByStorageId(ctx, storageId);
  if (!upload || upload.claimType !== claimType || upload.claimId !== claimId) {
    // Legacy uploads have no ownership row. Clearing the reference is safe;
    // deleting an unproven object is not.
    return;
  }
  await deleteStorageObjectIfPresent(ctx, storageId);
  // Remove the metadata row even when the object itself is already gone, so a
  // stale reference cannot keep failing the same update forever.
  await ctx.db.delete(upload._id);
}

export async function deleteUnclaimedUpload(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  storageId: Id<"_storage">,
): Promise<void> {
  const upload = await requireOwnedUpload(ctx, ownerId, storageId);
  if (upload.claimType !== undefined) return;
  await deleteStorageObjectIfPresent(ctx, storageId);
  await ctx.db.delete(upload._id);
}
