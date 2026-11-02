import assert from "node:assert/strict";
import test from "node:test";
import handler from "../../api/email/dispatch.ts";
import { safeErrorCode } from "../../server/email/validation.ts";

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

test("dispatcher rejects unauthorized requests", async () => {
  process.env.EMAIL_DISPATCH_SECRET = "test-secret-that-is-long-enough";
  const response = new MockResponse();
  await handler(
    {
      method: "POST",
      headers: {},
      body: {},
    } as never,
    response as never,
  );
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { ok: false, code: "UNAUTHORIZED" });
});

test("dispatcher reports missing SMTP configuration without leaking details", async () => {
  process.env.EMAIL_DISPATCH_SECRET = "test-secret-that-is-long-enough";
  delete process.env.SMTP_PASS;
  const response = new MockResponse();
  await handler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-secret-that-is-long-enough",
        "content-length": "200",
      },
      body: {
        eventId: "test:missing-config",
        to: "member@example.com",
        template: "password_reset",
        payload: {
          code: "123456",
          email: "member@example.com",
        },
      },
    } as never,
    response as never,
  );
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.body, { ok: false, code: "SMTP_FAILURE" });
  assert.equal(JSON.stringify(response.body).includes("SMTP_PASS"), false);
});

test("normalizes SMTP auth and connection errors", () => {
  assert.equal(
    safeErrorCode({ code: "EAUTH", responseCode: 535 }),
    "EAUTH_535",
  );
  assert.equal(safeErrorCode({ code: "ETIMEDOUT" }), "ETIMEDOUT");
});
