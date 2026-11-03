/**
 * Hard cap for every user-uploaded file. This lives outside the React upload
 * helper so the Convex backend can enforce the same limit.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
