import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: [
      "tests/bots/**/*.test.ts",
      "tests/io/**/*.test.ts",
      "tests/email/**/*.spec.ts",
    ],
    environment: "node",
    testTimeout: 20000,
    pool: "forks",
  },
});
