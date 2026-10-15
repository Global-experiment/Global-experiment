import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import { E2E_ADMIN } from "./e2e/admin-credentials";
import { E2E_DONATIONS_PREVIEW } from "./e2e/donations-preview";

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

/**
 * Admin suite (e2e/admin.spec.ts): the real stack — Next.js → NestJS →
 * PostgreSQL 17 — on its own API port, against the *_test database
 * (TEST_DATABASE_URL from the gitignored .env.local), which the API's
 * e2e-setup wipes, migrates and loads with test-only fixtures first. Never the
 * development database. Skipped when TEST_DATABASE_URL isn't configured.
 *
 * The Next.js server must proxy /api/admin to this API: a Next server
 * already running on the E2E port is reused only if it was started with
 * ADMIN_API_ORIGIN pointing at it (the admin suite fails fast otherwise).
 */
if (!process.env.TEST_DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const apiPort = Number(process.env.E2E_API_PORT ?? 4100);
if (testDatabaseUrl) process.env.E2E_ADMIN_ENABLED = "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The Documentation index now preloads every article body from Notion on
  // every request (client feedback items 15–16, no cache); a cold/slow
  // live fetch can occasionally take longer than Playwright's 30s default.
  timeout: 60_000,
  // `next dev` compiles a route on its first visit, which on a loaded machine
  // can exceed the 5s default of a navigation assertion (toHaveURL after a
  // click), so a cold route made a different test fail on each run.
  expect: { timeout: 10_000 },
  webServer: [
    ...(testDatabaseUrl
      ? [
          {
            // e2e-setup runs from source (tsx): src/testing is never part of the API build.
            command: "npm run api:build && npx tsx --tsconfig apps/api/tsconfig.json apps/api/src/testing/e2e-setup.ts && node apps/api/dist/main.js",
            url: `http://127.0.0.1:${apiPort}/api/health`,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
              NODE_ENV: "test",
              DATABASE_URL: testDatabaseUrl,
              API_PORT: String(apiPort),
              ADMIN_ALLOWED_ORIGINS: `http://localhost:${port}`,
              COOKIE_SECURE: "false",
              E2E_ADMIN_EMAIL: E2E_ADMIN.email,
              E2E_ADMIN_PASSWORD: E2E_ADMIN.password,
              // The admin import page reads this Notion-shaped fixture instead of
              // Notion (accepted by the API only under NODE_ENV=test).
              IMPORT_FIXTURE_FILE: resolve("e2e/fixtures/notion-import.json"),
              // Donate: scripted Checkout sessions instead of Stripe (also NODE_ENV=test only),
              // and this Next server as the public site (Checkout return links, origin check).
              STRIPE_FIXTURE: "1",
              // Open for the suites; donate-figma.spec closes them with the setting and uses the preview link.
              DONATIONS_ENABLED: "true",
              DONATIONS_PREVIEW_TOKEN: E2E_DONATIONS_PREVIEW,
              PUBLIC_SITE_URL: `http://localhost:${port}`,
            },
          },
        ]
      : []),
    {
      command: `npx next dev -p ${port}`,
      // A page with no live-Notion dependency: server readiness mustn't hinge
      // on a third-party API (Home is a 500 while Notion is unreachable).
      url: `http://localhost:${port}/waitlist`,
      reuseExistingServer: true,
      // The readiness probe's own request can land on the Documentation
      // route's live, uncached Notion preload (same reason as `timeout`
      // above) — 30s was occasionally too tight for that one request.
      timeout: 90_000,
      env: { ADMIN_API_ORIGIN: `http://127.0.0.1:${apiPort}` },
    },
  ],
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /((admin|donate|treasury)-figma|admin-treasury).spec.ts/,
      use: {
        browserName: "chromium",
        // Contribute's copy button correctly shows no confirmation at all when
        // navigator.clipboard.writeText() is denied (never a false success) —
        // Chromium denies it by default in a fresh context, so the permission
        // has to be granted explicitly for that behavior to be exercised.
        // (Chromium-only permission names: WebKit rejects them.)
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
    // The Figma conformance suites run after the others: the admin one
    // duplicates a record (other specs assert fixture counts), the donate one
    // switches donation settings in the test database.
    {
      name: "chromium-figma",
      dependencies: ["chromium"],
      testMatch: /(admin|donate|treasury)-figma.spec.ts/,
      use: { browserName: "chromium" },
    },
    // Last: the admin Treasury suite publishes, unpublishes and reviews entries
    // the public suites read (each change is undone before it ends).
    {
      name: "chromium-admin-treasury",
      dependencies: ["chromium-figma"],
      testMatch: /admin-treasury.spec.ts/,
      use: { browserName: "chromium" },
    },
    // Page centering with classic scrollbars must hold in Safari's engine
    // too (it handles scrollbar-gutter differently): only that spec runs
    // here. Needs `npx playwright install webkit` once.
    { name: "webkit", use: { browserName: "webkit" }, testMatch: /scrollbar\.spec\.ts/ },
  ],
});
