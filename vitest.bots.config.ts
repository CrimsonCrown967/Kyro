import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/bots/**/*.integration.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
    testTimeout: 20_000,
  },
});
