import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

// The mock aliases exist only in this test server, never in the shipped app.
const server = await createServer({
  configFile: false,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "ui-fixture",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith("/dashboard"))
            req.url = "/tests/ui/index.html";
          next();
        });
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "@/hooks/use-auth",
        replacement: path.resolve("tests/ui/auth.js"),
      },
      { find: "convex/react", replacement: path.resolve("tests/ui/convex.js") },
      { find: "@", replacement: path.resolve("src") },
    ],
  },
  server: { host: "127.0.0.1", port: 5187, strictPort: true },
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom/client", "react/jsx-runtime", "react-router"],
  },
});
await server.listen();
await fs.mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  reducedMotion: "reduce",
});
await context.route(/^https?:\/\/(?!127\.0\.0\.1:5187)/, (route) =>
  route.abort(),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("http://127.0.0.1:5187/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible({ timeout: 120000 });
  await page.screenshot({ path: "test-results/kyro-friends-desktop.png" });
  await page
    .getByRole("button", { name: "Favorite Leo Parker", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Conversation filters" })
    .getByRole("button", { name: "Favorites", exact: true })
    .click();
  await expect(page.locator('a[href="/dashboard/dm/dm-leo"]')).toBeVisible();
  await expect(page.locator('a[href="/dashboard/dm/dm-maya"]')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unfavorite Leo Parker", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  const jumpInput = page.getByRole("combobox", {
    name: "Jump to a conversation or community",
  });
  await expect(jumpInput).toBeVisible();
  await jumpInput.fill("Leo");
  await page.screenshot({ path: "test-results/kyro-quick-switcher.png" });
  await jumpInput.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/dm\/dm-leo$/);
  await page.getByRole("button", { name: "Kyro home" }).click();
  await page
    .getByRole("button", { name: "Quick appearance", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Theme", exact: true })
    .getByRole("button", { name: "Light", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Ocean", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "cyan");
  await page.getByRole("button", { name: "Kyro violet", exact: true }).click();
  await page
    .getByRole("group", { name: "Theme", exact: true })
    .getByRole("button", { name: "Dark", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Search friends", exact: true })
    .fill("nobody-matches");
  await expect(
    page.getByText("No friends match your search.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(
    page.getByRole("button", { name: "Message Maya Chen", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  await expect(
    page.getByText("No pending friend requests.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Message Kai Wilson", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search direct messages" })
    .fill("not-a-conversation");
  await expect(
    page.getByText("No conversations match your search."),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search direct messages" }).clear();
  await page
    .getByRole("textbox", { name: "Search direct messages" })
    .fill("  maya  ");
  await expect(page.locator('a[href="/dashboard/dm/dm-maya"]')).toBeVisible();
  await expect(page.locator('a[href="/dashboard/dm/dm-leo"]')).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search direct messages" }).clear();
  await page
    .getByRole("group", { name: "Conversation filters" })
    .getByRole("button", { name: /Unread/ })
    .click();
  await expect(page.locator('a[href="/dashboard/dm/dm-maya"]')).toBeVisible();
  await expect(page.locator('a[href="/dashboard/dm/dm-leo"]')).toHaveCount(0);
  await page.getByRole("button", { name: "All messages", exact: true }).click();
  await expect(page.locator('a[href="/dashboard/dm/dm-leo"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Message Maya Chen", exact: true })
    .click();
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.locator('a[href="/dashboard/dm/dm-maya"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.locator("textarea").fill("Keep this draft while I look around");
  await page.screenshot({ path: "test-results/kyro-chat-desktop.png" });
  await page.locator(".message-row").first().hover();
  await page
    .getByRole("button", { name: "Reply", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel reply" }),
  ).toBeVisible();
  await page.locator('a[href="/dashboard/dm/dm-leo"]').click();
  await expect(page.locator("textarea")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Cancel reply" })).toHaveCount(
    0,
  );
  await page.locator("textarea").fill("Leo's separate draft");
  await page.locator('a[href="/dashboard/dm/dm-maya"]').click();
  await expect(page.locator("textarea")).toHaveValue(
    "Keep this draft while I look around",
  );
  await expect(page.getByRole("button", { name: "Cancel reply" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Kyro home" }).click();
  await page
    .getByRole("button", { name: "Message Maya Chen", exact: true })
    .click();
  await expect(page.locator("textarea")).toHaveValue(
    "Keep this draft while I look around",
  );
  await page.evaluate(() => window.setFixtureConnection(false));
  await expect(page.getByRole("status")).toContainText("Reconnecting to Kyro", {
    timeout: 10000,
  });
  await expect(page.locator("textarea")).toHaveValue(
    "Keep this draft while I look around",
  );
  await page.evaluate(() => window.setFixtureConnection(true));
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Kyro home" }).click();
  await page.evaluate(() => window.setFixtureTheme("light"));
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/kyro-friends-light.png" });
  await page.evaluate(() => window.setFixtureTheme("dark"));
  for (const width of [800, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No page overflow at ${width}px`,
    );
    await page.screenshot({ path: `test-results/kyro-friends-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Find people" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Add friend", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Message Maya Chen", exact: true })
    .click();
  await expect(page.locator("textarea")).toBeVisible();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile chat fits viewport",
  );
  await page.screenshot({ path: "test-results/kyro-chat-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page
    .getByRole("group", { name: "Community interests" })
    .getByRole("button", { name: "Gaming", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("article", { name: "After Hours" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "All communities", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Sort communities" })
    .selectOption("newest");
  await expect(page.getByRole("article").first()).toHaveAttribute(
    "aria-label",
    "Build Together",
  );
  await page.screenshot({ path: "test-results/kyro-discover-desktop.png" });
  await page
    .getByRole("article", { name: "Creative Studio" })
    .getByRole("button")
    .click();
  await expect(page.locator("textarea")).toBeVisible();
  await page.screenshot({ path: "test-results/kyro-community-desktop.png" });
  await page.locator('a[href="/dashboard/s/studio/v/room"]').click();
  await expect(
    page.getByRole("button", { name: "Join voice", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Voice preview");
  await expect(
    page.getByText("Previewing the room. Your microphone is off."),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/kyro-voice-preview.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/kyro-voice-mobile.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Voice preview fits phone",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: favorites persistence, keyboard switcher, appearance controls, friend and unread filters, isolated replies and drafts, reconnect banner, responsive layouts, discovery filters, communities and voice preview",
  );
} catch (error) {
  await page.screenshot({ path: "test-results/ui-failure.png" });
  console.error(
    errors,
    (await page.locator("body").innerText()).slice(0, 1500),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
