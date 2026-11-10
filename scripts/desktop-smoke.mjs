import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const executablePath = path.resolve(
  process.argv[2] || "desktop/release/win-unpacked/Kyro.exe",
);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "kyro-desktop-smoke-"));
await fs.mkdir("test-results", { recursive: true });
let app;
const launch = () =>
  electron.launch({
    executablePath,
    args: ["--use-fake-device-for-media-stream"],
    env: {
      ...process.env,
      KYRO_DESKTOP_SMOKE_TEST: "1",
      KYRO_DESKTOP_TEST_PROFILE: profile,
    },
    timeout: 60000,
  });
try {
  app = await launch();
  let page = await app.firstWindow();
  await page.waitForURL(/kyro-chat\.cyou\/(auth|dashboard)/, {
    timeout: 60000,
  });
  await expect(
    page.getByRole("button", { name: /sign in/i }).first(),
  ).toBeVisible({ timeout: 60000 });
  const preferences = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const p = w.webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      webSecurity: p.webSecurity,
      preload: p.preload,
    };
  });
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.webSecurity, true);
  assert.ok(!preferences.preload);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Welcome to Kyro", { exact: true }),
  ).toBeVisible();
  assert.deepEqual(
    await page.evaluate(() => [
      typeof window.require,
      typeof window.process,
      typeof window.kyroShare,
    ]),
    ["undefined", "undefined", "undefined"],
  );
  await page.evaluate(() =>
    localStorage.setItem("kyro-desktop-smoke", "persisted"),
  );
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  await page.waitForURL(/kyro-chat\.cyou\/(auth|dashboard)/, {
    timeout: 60000,
  });
  await expect(
    page.getByRole("button", { name: /sign in/i }).first(),
  ).toBeVisible({ timeout: 60000 });
  assert.equal(
    await page.evaluate(() => localStorage.getItem("kyro-desktop-smoke")),
    "persisted",
  );
  console.log(
    "PASS: packaged startup, renderer isolation and persistent profile",
  );

  await app.evaluate(({ dialog, desktopCapturer, nativeImage, shell }) => {
    globalThis.smokeDialogs = [];
    globalThis.smokeExternal = [];
    dialog.showMessageBox = async (...args) => {
      globalThis.smokeDialogs.push(args.at(-1).message);
      return { response: 0, checkboxChecked: false };
    };
    shell.openExternal = async (url) => {
      globalThis.smokeExternal.push(url);
    };
    desktopCapturer.getSources = async () => [
      {
        id: "screen:0:0",
        name: "Test screen <safe text>",
        thumbnail: nativeImage.createEmpty(),
        display_id: "0",
        appIcon: null,
      },
    ];
  });
  const microphone = await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return "unexpected grant";
    } catch (error) {
      return error.name;
    }
  });
  assert.equal(microphone, "NotAllowedError");
  assert.ok(
    (await app.evaluate(() => globalThis.smokeDialogs)).some((message) =>
      message.includes("microphone"),
    ),
  );
  await page.evaluate(() => {
    window.open("https://example.com/kyro-desktop-test");
    window.open("ms-settings:privacy");
  });
  await expect
    .poll(() => app.evaluate(() => globalThis.smokeExternal.length))
    .toBe(1);
  assert.deepEqual(await app.evaluate(() => globalThis.smokeExternal), [
    "https://example.com/kyro-desktop-test",
  ]);
  assert.equal(app.windows().length, 1);
  console.log("PASS: native microphone consent and external link restrictions");

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "smoke-share";
    button.textContent = "Smoke test screen picker";
    button.onclick = () => {
      window.smokeShareResult = "pending";
      navigator.mediaDevices
        .getDisplayMedia({ video: true, audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          window.smokeShareResult = "unexpected grant";
        })
        .catch((error) => {
          window.smokeShareResult = error.name;
        });
    };
    document.body.prepend(button);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const pickerPromise = app.waitForEvent("window", { timeout: 15000 });
    await page.locator("#smoke-share").click();
    const picker = await pickerPromise;
    await expect(
      picker.getByRole("heading", { name: "Choose what to share." }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Test screen <safe text>" }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Share", exact: true }),
    ).toBeDisabled();
    await picker
      .getByRole("button", { name: "Test screen <safe text>" })
      .click();
    await expect(
      picker.getByRole("button", { name: "Share", exact: true }),
    ).toBeEnabled();
    await picker.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.smokeShareResult))
      .not.toBe("pending");
    assert.notEqual(
      await page.evaluate(() => window.smokeShareResult),
      "unexpected grant",
    );
  }
  console.log(
    "PASS: screen picker, explicit selection and repeat cancellation",
  );

  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations())
      await registration.unregister();
    for (const name of await caches.keys()) await caches.delete(name);
  });
  await page.route("https://kyro-chat.cyou/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await app.evaluate(async ({ BrowserWindow, Menu }) => {
    const w = BrowserWindow.getAllWindows()[0];
    await w.loadURL("about:blank");
    // The site's service worker can serve a cached shell while offline. Clear
    // that cache to exercise the desktop fallback for an uncached launch.
    await w.webContents.session.clearStorageData({
      storages: ["serviceworkers", "cachestorage"],
    });
    await w.webContents.session.clearCache();
    Menu.getApplicationMenu().items[0].submenu.items[0].click();
  });
  await expect(
    page.getByRole("heading", { name: "Let's get you connected." }),
  ).toBeVisible({ timeout: 30000 });
  await page.unroute("https://kyro-chat.cyou/**");
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("button", { name: /sign in/i }).first(),
  ).toBeVisible({ timeout: 60000 });
  console.log("PASS: offline page and retry recovery");
} finally {
  if (app) await app.close().catch(() => {});
  // Only remove the dedicated profile created by this invocation.
  if (
    path.dirname(profile) === os.tmpdir() &&
    path.basename(profile).startsWith("kyro-desktop-smoke-")
  ) {
    await fs
      .rm(profile, { recursive: true, force: true, maxRetries: 5 })
      .catch(() => {});
  }
}
