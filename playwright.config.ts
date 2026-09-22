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
  // The Documentation index now preloads every article body from Notion on
  // every request (client feedback items 15–16, no cache); a cold/slow
  // live fetch can occasionally take longer than Playwright's 30s default.
  timeout: 60_000,
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    // The readiness probe's own request can land on the Documentation
    // route's live, uncached Notion preload (same reason as `timeout`
    // above) — 30s was occasionally too tight for that one request.
    timeout: 90_000,
  },
  use: {
    baseURL: `http://localhost:${port}`,
    // Contribute's copy button correctly shows no confirmation at all when
    // navigator.clipboard.writeText() is denied (never a false success) —
    // Chromium denies it by default in a fresh context, so the permission
    // has to be granted explicitly for that behavior to be exercised.
    permissions: ["clipboard-read", "clipboard-write"],
  },
});
