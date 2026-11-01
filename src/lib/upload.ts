import { useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;
export const ACCEPTED_UPLOAD =
  "image/*,video/*,audio/*,application/pdf,text/plain,text/markdown,application/json,.zip,.csv";

export interface PendingAttachment {
  storageId: Id<"_storage">;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * The current backend exposes `files:registerUpload`, so ownership tracking is
 * enabled by default. The explicit `false` escape hatch keeps an older backend
 * usable during an emergency rollback without reintroducing the original
 * missing-function error for normal deployments.
 */
const uploadRegistrationEnabled =
  import.meta.env.VITE_CONVEX_UPLOAD_REGISTRATION !== "false";

/**
 * Files go straight to object storage through a short-lived signed URL, so
 * the browser never streams file contents through the database.
 */
export function useUploadFile(options: { requireRegistration?: boolean } = {}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const registerUpload = useMutation(api.files.registerUpload);

  return useCallback(
    async (file: File): Promise<PendingAttachment> => {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `"${file.name}" is larger than the 10 MB upload limit.`,
        );
      }
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status}). Try again.`);
      }
      const { storageId } = (await response.json()) as { storageId: string };
      const attachment: PendingAttachment = {
        storageId: storageId as Id<"_storage">,
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
      };

      // The signed upload has already completed. Legacy Kyro mutations accept
      // this storage id directly, so never call a function that production is
      // known not to expose.
      if (!uploadRegistrationEnabled && !options.requireRegistration) {
        return attachment;
      }

      try {
        return await registerUpload({
          storageId: attachment.storageId,
          name: file.name,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const backendPredatesRegistration =
          message.includes("Could not find public function") &&
          message.toLowerCase().includes("registerupload");
        if (!backendPredatesRegistration) throw error;

        // The object is already in Convex storage. Older deployments predate
        // upload ownership tracking, so they accept the storage id directly —
        // return the local metadata instead of failing the whole upload.
        return attachment;
      }
    },
    [generateUploadUrl, options.requireRegistration, registerUpload],
  );
}
