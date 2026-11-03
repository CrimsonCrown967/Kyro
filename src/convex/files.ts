import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireProfile } from "./lib";
import {
  MAX_UPLOAD_BYTES,
  deleteStorageObjectIfPresent,
  isAllowedUploadType,
  uploadByStorageId,
} from "./uploadSecurity";

/**
 * Files go straight to Convex object storage (S3-compatible under the hood)
 * via a short-lived signed upload URL — no file bytes through the database.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Register the object immediately after the signed upload completes. The
 * server reads size/content type from Convex storage; client metadata is never
 * trusted for quotas or rendering decisions.
 */
export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
  },
  handler: async (ctx, { storageId, name }) => {
    const { id } = await requireProfile(ctx);
    const existing = await uploadByStorageId(ctx, storageId);
    if (existing) {
      if (existing.ownerId !== id) {
        throw new Error("That upload belongs to another account.");
      }
      return {
        storageId,
        name: existing.name,
        size: existing.size,
        mimeType: existing.mimeType,
      };
    }

    const metadata = await ctx.db.system.get("_storage", storageId);
    if (!metadata) throw new Error("That upload no longer exists.");
    const mimeType = metadata.contentType ?? "application/octet-stream";
    if (metadata.size > MAX_UPLOAD_BYTES || !isAllowedUploadType(mimeType)) {
      await deleteStorageObjectIfPresent(ctx, storageId);
      throw new Error(
        metadata.size > MAX_UPLOAD_BYTES
          ? "That file is larger than the 10 MB upload limit."
          : "That file type is not allowed.",
      );
    }
    const cleanName = name.trim().slice(0, 120) || "upload";
    await ctx.db.insert("uploads", {
      storageId,
      ownerId: id,
      name: cleanName,
      size: metadata.size,
      mimeType,
      createdAt: Date.now(),
    });
    return { storageId, name: cleanName, size: metadata.size, mimeType };
  },
});
