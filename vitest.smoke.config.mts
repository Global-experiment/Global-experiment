import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Live Notion connectivity smoke test only (`npm run test:smoke`). Kept out
 * of `npm test` (see vitest.config.ts) because it depends on the network:
 * a slow or unreachable Notion API must not fail the deterministic unit
 * suite. The test self-skips without credentials.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.smoke.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30_000,
  },
});
