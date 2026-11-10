import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { sha256Hex } from "./sha256";
import { isAllowedUploadType, MAX_UPLOAD_BYTES } from "./uploadSecurity";

const gateRef = makeFunctionReference<"mutation">("botApi:gate");
const executeRef = makeFunctionReference<"mutation">("botApi:execute");
const uploadAccessRef = makeFunctionReference<"mutation">(
  "botApi:authorizeUpload",
);
const registerUploadRef = makeFunctionReference<"mutation">(
  "botApi:registerAttachment",
);
const gatewayRef = makeFunctionReference<"action">("botWebhooks:gateway");
const BASE = "/bot-api/v1";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers });
}
function failure(
  code: string,
  message: string,
  status: number,
  retryAfter?: number,
) {
  return new Response(
    JSON.stringify({
      error: { code, message, ...(retryAfter ? { retryAfter } : {}) },
    }),
    {
      status,
      headers: {
        ...headers,
        ...(retryAfter ? { "retry-after": String(retryAfter) } : {}),
      },
    },
  );
}
async function readLimited(
  request: Request,
  maximum: number,
): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maximum)
    throw new ConvexError({
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body is too large.",
    });
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new ConvexError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body is too large.",
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export const botHttp = httpAction(async (ctx, request) => {
  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bot (kyro_bot_[a-f0-9]{64})$/);
    if (!match)
      return failure("UNAUTHORIZED", "Use Authorization: Bot <token>.", 401);
    // Plaintext credentials are never persisted, passed to mutations, or logged.
    const tokenHash = sha256Hex(match[1]);
    const gate = await ctx.runMutation(gateRef, { tokenHash });
    if (!gate.allowed)
      return failure("RATE_LIMITED", "Bot API rate limit exceeded.", 429, 60);
    const url = new URL(request.url);
    const path = url.pathname.slice(BASE.length).replace(/\/$/, "") || "/";
    if (path === "/gateway" && request.method === "GET")
      return response(
        await ctx.runAction(gatewayRef, { applicationId: gate.applicationId }),
      );
    const attachmentMatch = path.match(/^\/channels\/([^/]+)\/attachments$/);
    if (attachmentMatch && request.method === "POST") {
      const channelId = await ctx.runMutation(uploadAccessRef, {
        tokenHash,
        channelId: attachmentMatch[1],
      });
      const mimeType =
        request.headers.get("content-type")?.split(";", 1)[0].toLowerCase() ??
        "";
      if (!isAllowedUploadType(mimeType))
        return failure(
          "INVALID_REQUEST",
          "Unsupported attachment content type.",
          400,
        );
      const bytes = await readLimited(request, MAX_UPLOAD_BYTES);
      if (!bytes.length)
        return failure("INVALID_REQUEST", "Attachment is empty.", 400);
      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array(bytes)], { type: mimeType }),
      );
      try {
        return response(
          await ctx.runMutation(registerUploadRef, {
            tokenHash,
            channelId,
            storageId,
            name: request.headers.get("x-filename") ?? "attachment",
          }),
          201,
        );
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
      }
    }
    const bytes = await readLimited(request, 64 * 1024);
    const text = bytes.length ? new TextDecoder().decode(bytes) : "{}";
    try {
      JSON.parse(text);
    } catch {
      return failure(
        "INVALID_REQUEST",
        "Request body must be valid JSON.",
        400,
      );
    }
    const result = await ctx.runMutation(executeRef, {
      tokenHash,
      path,
      method: request.method,
      query: Object.fromEntries(url.searchParams.entries()),
      bodyJson: text,
    });
    const created =
      request.method === "POST" &&
      /\/messages$|\/polls$|\/roles$|\/channels$/.test(path);
    return response(result, created ? 201 : 200);
  } catch (error) {
    const data = error instanceof ConvexError ? error.data : undefined;
    if (
      data &&
      typeof data === "object" &&
      "code" in data &&
      "message" in data &&
      typeof data.code === "string" &&
      typeof data.message === "string"
    ) {
      const codes: Record<string, number> = {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        INVALID_REQUEST: 400,
        RATE_LIMITED: 429,
        CONFLICT: 409,
        EXPIRED: 410,
        PAYLOAD_TOO_LARGE: 413,
        AUTOMOD_BLOCKED: 422,
      };
      return failure(
        data.code,
        data.message,
        codes[data.code] ?? 400,
        data.code === "RATE_LIMITED" ? 5 : undefined,
      );
    }
    return failure(
      "INTERNAL_ERROR",
      "The request could not be completed.",
      500,
    );
  }
});
