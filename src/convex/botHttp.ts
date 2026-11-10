import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { httpAction } from "./functions";
import { sha256Hex } from "./sha256";

const authorize = makeFunctionReference<
  "mutation",
  { tokenHash: string },
  { allowed: boolean }
>("botApi:authorize");
const execute = makeFunctionReference<
  "mutation",
  {
    tokenHash: string;
    method: string;
    path: string;
    body: unknown;
    query: Record<string, string>;
  },
  unknown
>("botApi:execute");
function reply(
  status: number,
  payload: unknown,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}
export const botHttp = httpAction(async (ctx, request) => {
  if (
    request.method === "GET" &&
    new URL(request.url).pathname === "/api/bots/v1/webhook-key"
  ) {
    try {
      const data = await ctx.runAction(
        makeFunctionReference<
          "action",
          Record<string, never>,
          { configured: boolean; key: string | null }
        >("botWebhooks:publicKey"),
        {},
      );
      return reply(data.configured ? 200 : 503, { ok: data.configured, data });
    } catch {
      return reply(503, {
        ok: false,
        error: {
          code: "WEBHOOK_UNAVAILABLE",
          message: "Webhook signing is not configured.",
        },
      });
    }
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bot kyro_bot_[a-f0-9]{64}$/.test(authorization))
    return reply(401, {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Use Authorization: Bot <token>.",
      },
    });
  const tokenHash = sha256Hex(authorization.slice(4));
  try {
    if (!(await ctx.runMutation(authorize, { tokenHash })).allowed)
      return reply(
        429,
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "120 requests per minute are allowed.",
          },
        },
        { "Retry-After": "60" },
      );
    let body: unknown = {};
    if (request.body) {
      let text = "";
      let bytes = 0;
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) {
          await reader.cancel();
          return reply(413, {
            ok: false,
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: "Request bodies must be at most 64 KiB.",
            },
          });
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return reply(400, {
            ok: false,
            error: { code: "INVALID_JSON", message: "Provide valid JSON." },
          });
        }
      }
    }
    const url = new URL(request.url);
    const path = url.pathname.slice("/api/bots/v1/".length);
    const query = Object.fromEntries(url.searchParams);
    const data = await ctx.runMutation(execute, {
      tokenHash,
      method: request.method,
      path,
      body,
      query,
    });
    return reply(
      request.method === "POST" &&
        /^(commands|channels\/[^/]+\/messages)$/.test(path)
        ? 201
        : 200,
      { ok: true, data },
    );
  } catch (error) {
    const data = error instanceof ConvexError ? error.data : null;
    if (
      data &&
      typeof data === "object" &&
      "status" in data &&
      typeof data.status === "number" &&
      "code" in data &&
      "message" in data
    )
      return reply(
        data.status,
        { ok: false, error: { code: data.code, message: data.message } },
        data.status === 429 ? { "Retry-After": "5" } : {},
      );
    return reply(403, {
      ok: false,
      error: {
        code: "REQUEST_REJECTED",
        message:
          "The request could not be completed. Check the bot's membership and permissions.",
      },
    });
  }
});
