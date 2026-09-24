import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ contains Playwright specs (run via `npm run test:e2e`), not
    // Vitest tests — Vitest's default include pattern would otherwise
    // also match *.spec.ts there and try to run them with the wrong API.
    // The live Notion smoke test is excluded from the deterministic suite
    // (`npm test`) and run on its own via `npm run test:smoke`: it depends
    // on the network and Notion's API latency, and must not be able to
    // fail the normal unit-test run.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/*.smoke.test.ts"],
  },
});
