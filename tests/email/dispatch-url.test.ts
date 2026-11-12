import assert from "node:assert/strict";
import test from "node:test";
import { emailDispatchUrl } from "../../src/convex/emailDispatchUrl.ts";

test("dispatches directly to www even when configured with the old apex URL", () => {
  for (const host of ["kyro-chat.cyou", "www.kyro-chat.cyou"]) {
    assert.equal(
      emailDispatchUrl(`https://${host}/api/email/dispatch`).href,
      "https://www.kyro-chat.cyou/api/email/dispatch",
    );
  }
});

test("refuses unsafe dispatch endpoints before sending credentials", () => {
  for (const url of [
    "http://kyro-chat.cyou/api/email/dispatch",
    "https://kyro-chat.cyou.evil.test/api/email/dispatch",
    "https://user:password@www.kyro-chat.cyou/api/email/dispatch",
    "https://www.kyro-chat.cyou:444/api/email/dispatch",
    "https://www.kyro-chat.cyou/api/email/health",
    "https://www.kyro-chat.cyou/api/email/dispatch?forward=elsewhere",
  ])
    assert.throws(() => emailDispatchUrl(url), url);
});
