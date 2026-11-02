import assert from "node:assert/strict";
import test from "node:test";
import { renderEmailTemplate } from "../../server/email/templates.ts";
import {
  isAuthorized,
  validateDispatchRequest,
} from "../../server/email/validation.ts";

const identity = {
  displayName: "Test Member",
  username: "testmember",
  actionAt: Date.UTC(2026, 10, 2, 10, 0),
};

test("renders every required transactional template", () => {
  const templates = [
    [
      "password_reset",
      { ...identity, email: "test@example.com", code: "123456" },
    ],
    [
      "email_verification",
      { ...identity, email: "test@example.com", code: "654321" },
    ],
    [
      "temporary_ban",
      {
        ...identity,
        reason: "Rule violation",
        duration: "3 days",
        expiresAt: Date.UTC(2026, 10, 5, 10, 0),
      },
    ],
    [
      "permanent_ban",
      { ...identity, reason: "Severe rule violation", duration: "Permanent" },
    ],
    [
      "warning",
      {
        ...identity,
        reason: "Spam",
        explanation: "Repeated spam",
        rules: "No spam",
      },
    ],
    ["restoration", { ...identity, reason: "Appeal approved" }],
  ] as const;
  for (const [name, payload] of templates) {
    const rendered = renderEmailTemplate(name, payload);
    assert.ok(rendered.subject.length > 5);
    assert.match(rendered.html, /Kyro — Chat without limits\./);
    assert.match(rendered.text, /Kyro — Chat without limits\./);
    assert.doesNotMatch(rendered.html, /<script/i);
  }
});

test("escapes user-controlled moderation content", () => {
  const rendered = renderEmailTemplate("warning", {
    ...identity,
    reason: '<script>alert("x")</script>',
    explanation: "<b>not trusted</b>",
    rules: "Be kind",
  });
  assert.doesNotMatch(rendered.html, /<script>/i);
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.match(rendered.html, /&lt;b&gt;not trusted&lt;\/b&gt;/);
});

test("validates dispatcher payload and rejects header injection", () => {
  assert.throws(() =>
    validateDispatchRequest({
      eventId: "valid:event",
      to: "victim@example.com\r\nBcc:attacker@example.com",
      template: "warning",
      payload: {},
    }),
  );
  assert.throws(() =>
    validateDispatchRequest({
      eventId: "invalid event id",
      to: "victim@example.com",
      template: "warning",
      payload: {},
    }),
  );
});

test("compares dispatcher bearer secrets safely", () => {
  assert.equal(isAuthorized("Bearer same-secret", "same-secret"), true);
  assert.equal(isAuthorized("Bearer wrong-secret", "same-secret"), false);
  assert.equal(isAuthorized(undefined, "same-secret"), false);
});
