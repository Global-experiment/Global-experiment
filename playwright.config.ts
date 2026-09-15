import { defineConfig } from "@playwright/test";

/**
 * Minimal E2E config for browser-level behaviors unit tests can't cover
 * (real navigation, click-driven UI state, real HTTP status codes).
 * Not wired into the GitHub Actions CI pipeline yet — deliberately kept
 * separate from `npm test` (Vitest) given the extra weight of a browser
 * download and dev-server startup; run on demand with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
});
