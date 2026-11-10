import type { IncomingMessage, ServerResponse } from "node:http";

/** Same-origin API address for external developers; all authority stays in Convex. */
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const fail = (status: number, code: string, message: string) => {
    res.statusCode = status;
    res.end(JSON.stringify({ ok: false, error: { code, message } }));
  };
  if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(req.method ?? ""))
    return fail(405, "METHOD_NOT_ALLOWED", "Unsupported HTTP method.");
  const deployment =
    process.env.BOT_CONVEX_SITE_URL ??
    process.env.VITE_CONVEX_URL?.replace(/\.convex\.cloud\/?$/, ".convex.site");
  if (!deployment)
    return fail(503, "NOT_CONFIGURED", "The bot API is not configured.");
  try {
    const base = new URL(deployment);
    if (
      base.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(base.hostname)
      )
    )
      throw new Error();
    const incoming = new URL(req.url ?? "/", "https://kyro-chat.cyou");
    // Vercel's Vite adapter needs an explicit rewrite for nested API paths.
    // Support both the original URL and the rewritten function URL.
    const rewrittenPath = incoming.searchParams.get("botPath");
    if (incoming.pathname === "/api/bots" && rewrittenPath) {
      if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(rewrittenPath))
        return fail(404, "NOT_FOUND", "Unknown bot API path.");
      incoming.pathname = `/api/bots/v1/${rewrittenPath}`;
    }
    incoming.searchParams.delete("botPath");
    if (!incoming.pathname.startsWith("/api/bots/v1/"))
      return fail(404, "NOT_FOUND", "Unknown API version.");
    let body: string | undefined;
    if (req.method !== "GET") {
      if (req.body !== undefined)
        body =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      else {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of req) {
          const buffer = Buffer.from(chunk);
          length += buffer.length;
          if (length > 65536)
            return fail(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
          chunks.push(buffer);
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      if (Buffer.byteLength(body ?? "", "utf8") > 65536)
        return fail(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
    }
    const response = await fetch(
      new URL(incoming.pathname + incoming.search, base),
      {
        method: req.method,
        headers: {
          Authorization:
            typeof req.headers.authorization === "string"
              ? req.headers.authorization
              : "",
          "Content-Type": "application/json",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(25000),
      },
    );
    res.statusCode = response.status;
    const retry = response.headers.get("retry-after");
    if (retry) res.setHeader("Retry-After", retry);
    res.end(await response.text());
  } catch {
    return fail(
      502,
      "UPSTREAM_UNAVAILABLE",
      "The bot API is temporarily unavailable.",
    );
  }
}
