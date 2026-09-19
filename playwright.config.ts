import { defineConfig } from "@playwright/test";

/**
 * Minimal E2E config for browser-level behaviors unit tests can't cover
 * (real navigation, click-driven UI state, real HTTP status codes).
 * Not wired into the GitHub Actions CI pipeline yet — deliberately kept
 * separate from `npm test` (Vitest) given the extra weight of a browser
 * download and dev-server startup; run on demand with `npm run test:e2e`.
 */
// Set E2E_PORT to avoid colliding with another process on the default port.
// The app has no fixture mode: these tests need real Notion credentials
// (NOTION_API_KEY, NOTION_DOCUMENTATION_DB_ID, NOTION_HOME_PAGE_ID).
const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: `http://localhost:${port}`,
  },
});
