const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isKyroUrl,
  externalUrl,
  canRequestPermission,
} = require("../dist/security.js");

test("both exact HTTPS Kyro origins support canonical redirects", () => {
  for (const url of [
    "https://kyro-chat.cyou",
    "https://kyro-chat.cyou/dashboard?invite=abc",
    "https://kyro-chat.cyou:443/auth",
    "https://www.kyro-chat.cyou/dashboard",
    "https://www.kyro-chat.cyou:443/auth",
  ]) {
    assert.equal(isKyroUrl(url), true, url);
  }
  for (const url of [
    "http://kyro-chat.cyou",
    "https://kyro-chat.cyou.evil.test",
    "https://evil.test/kyro-chat.cyou",
    "https://kyro-chat.cyou@evil.test",
    "https://user:pass@kyro-chat.cyou",
    "https://kyro-chat.cyou:444",
    "https://www.kyro-chat.cyou.evil.test",
    "https://www.kyro-chat.cyou:444",
    "http://www.kyro-chat.cyou",
    "https://user:pass@www.kyro-chat.cyou",
    "https://preview.kyro-chat.cyou",
    "file:///C:/Windows/system.ini",
    "javascript:alert(1)",
    "about:blank",
    "not a URL",
  ]) {
    assert.equal(isKyroUrl(url), false, url);
  }
});

test("external links cannot launch executable or custom OS protocols", () => {
  for (const url of [
    "https://example.com/path",
    "http://localhost:3000/",
    "mailto:help@example.com",
  ])
    assert.ok(externalUrl(url), url);
  for (const url of [
    "file:///C:/Windows/notepad.exe",
    "ms-settings:privacy",
    "powershell:run",
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://user:password@example.com",
    "\\\\server\\share",
    "invalid",
  ])
    assert.equal(externalUrl(url), null, url);
});

test("sensitive permissions require the Kyro main frame and explicit allowlist", () => {
  for (const permission of [
    "media",
    "display-capture",
    "notifications",
    "fullscreen",
    "clipboard-sanitized-write",
  ]) {
    assert.equal(
      canRequestPermission(
        "https://www.kyro-chat.cyou/dashboard",
        true,
        permission,
      ),
      true,
    );
    assert.equal(
      canRequestPermission("https://www.kyro-chat.cyou", false, permission),
      false,
    );
    assert.equal(
      canRequestPermission(
        "https://kyro-chat.cyou/dashboard",
        true,
        permission,
      ),
      true,
    );
    assert.equal(
      canRequestPermission(
        "https://kyro-chat.cyou/dashboard",
        false,
        permission,
      ),
      false,
    );
    assert.equal(
      canRequestPermission("https://evil.test", true, permission),
      false,
    );
  }
  for (const permission of [
    "geolocation",
    "clipboard-read",
    "fileSystem",
    "openExternal",
    "usb",
    "serial",
    "unknown",
  ])
    assert.equal(
      canRequestPermission("https://kyro-chat.cyou", true, permission),
      false,
      permission,
    );
});
