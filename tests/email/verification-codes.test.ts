import assert from "node:assert/strict";
import test from "node:test";
import {
  generateSixDigitCode,
  secureCodeHash,
} from "../../src/convex/verificationCodes.ts";

test("generates six numeric digits", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateSixDigitCode(), /^\d{6}$/);
  }
});

test("hashes codes by purpose and email", () => {
  const pepper = "a".repeat(64);
  const first = secureCodeHash(
    pepper,
    "password-reset",
    "a@example.com",
    "123456",
  );
  assert.equal(
    first,
    secureCodeHash(pepper, "password-reset", "a@example.com", "123456"),
  );
  assert.notEqual(
    first,
    secureCodeHash(pepper, "email-verification", "a@example.com", "123456"),
  );
  assert.notEqual(
    first,
    secureCodeHash(pepper, "password-reset", "b@example.com", "123456"),
  );
});

test("refuses an unconfigured pepper", () => {
  assert.throws(() =>
    secureCodeHash("too-short", "password-reset", "a@example.com", "123456"),
  );
});
