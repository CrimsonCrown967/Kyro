import assert from "node:assert/strict";
import test from "node:test";
import tokenHandler from "../../api/livekit/token.ts";
import moderationHandler from "../../api/livekit/moderate.ts";

class MockResponse {
  statusCode = 200;
  headers = new Map<string, string>();
  body: unknown;

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(value: unknown) {
    this.body = value;
    return this;
  }
}

test("LiveKit token endpoint rejects malformed one-time tickets", async () => {
  const response = new MockResponse();
  await tokenHandler(
    {
      method: "POST",
      headers: { "content-length": "20" },
      body: { ticket: "not-a-valid-ticket" },
    },
    response,
  );
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { ok: false, code: "TOKEN_DENIED" });
});

test("LiveKit moderation endpoint rejects malformed one-time tickets", async () => {
  const response = new MockResponse();
  await moderationHandler(
    {
      method: "POST",
      headers: { "content-length": "20" },
      body: { ticket: "not-a-valid-ticket" },
    },
    response,
  );
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { ok: false, code: "MODERATION_DENIED" });
});

test("LiveKit endpoints reject unsupported methods", async () => {
  const tokenResponse = new MockResponse();
  await tokenHandler({ method: "GET", headers: {} }, tokenResponse);
  assert.equal(tokenResponse.statusCode, 405);
  assert.equal(tokenResponse.headers.get("allow"), "POST");

  const moderationResponse = new MockResponse();
  await moderationHandler({ method: "GET", headers: {} }, moderationResponse);
  assert.equal(moderationResponse.statusCode, 405);
  assert.equal(moderationResponse.headers.get("allow"), "POST");
});
