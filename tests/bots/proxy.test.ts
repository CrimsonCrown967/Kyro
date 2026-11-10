import { describe, it, expect, vi, afterEach } from "vitest";
import handler from "../../api/bots";
import type { IncomingMessage, ServerResponse } from "node:http";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function response() {
  const headers = new Map<string, string>();
  const value = {
    statusCode: 200,
    body: "",
    setHeader: (key: string, data: string) => headers.set(key, data),
    end: (data: string) => {
      value.body = data;
    },
  };
  return { value, headers, res: value as unknown as ServerResponse };
}
const request = (fields: Record<string, unknown>) =>
  ({
    method: "GET",
    url: "/api/bots/v1/me",
    headers: { authorization: "Bot test" },
    ...fields,
  }) as unknown as IncomingMessage;
describe("Vercel bot API proxy", () => {
  it("resolves rewritten nested paths and preserves pagination parameters", async () => {
    vi.stubEnv("BOT_CONVEX_SITE_URL", "https://test.convex.site");
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true, data: {} }),
    );
    vi.stubGlobal("fetch", fetcher);
    const r = response();
    await handler(
      request({
        url: "/api/bots?botPath=channels%2Fabc123%2Fmessages&limit=10&cursor=page%2B2",
      }),
      r.res,
    );
    expect(r.value.statusCode).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://test.convex.site/api/bots/v1/channels/abc123/messages?limit=10&cursor=page%2B2",
    );
    const invalid = response();
    await handler(
      request({ url: "/api/bots?botPath=..%2Fother" }),
      invalid.res,
    );
    expect(invalid.value.statusCode).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("forwards the method, path, credential and response to the configured Convex HTTP origin", async () => {
    vi.stubEnv("BOT_CONVEX_SITE_URL", "https://test.convex.site");
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true, data: { id: "bot" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const r = response();
    await handler(request({}), r.res);
    expect(r.value.statusCode).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://test.convex.site/api/bots/v1/me",
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bot test" },
      redirect: "error",
    });
    expect(JSON.parse(r.value.body)).toMatchObject({
      ok: true,
      data: { id: "bot" },
    });
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("bounds pre-parsed request bodies and rejects unsupported methods", async () => {
    vi.stubEnv("BOT_CONVEX_SITE_URL", "https://test.convex.site");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const r = response();
    await handler(
      request({ method: "POST", body: { content: "x".repeat(65537) } }),
      r.res,
    );
    expect(r.value.statusCode).toBe(413);
    const second = response();
    await handler(request({ method: "TRACE" }), second.res);
    expect(second.value.statusCode).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves retry headers and sanitizes upstream exceptions", async () => {
    vi.stubEnv("BOT_CONVEX_SITE_URL", "https://test.convex.site");
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Wait" } },
        { status: 429, headers: { "Retry-After": "60" } },
      ),
    );
    const r = response();
    await handler(request({}), r.res);
    expect(r.value.statusCode).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    vi.stubGlobal("fetch", async () => {
      throw new Error("internal credentials or hostname");
    });
    const second = response();
    await handler(request({}), second.res);
    expect(second.value.statusCode).toBe(502);
    expect(second.value.body).not.toContain("credentials");
  });
});
