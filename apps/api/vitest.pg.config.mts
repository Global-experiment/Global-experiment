import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";

/**
 * The same API suites as `npm run api:test`, run against a real PostgreSQL
 * server (production driver, production migrations) instead of PGlite.
 * Locally TEST_DATABASE_URL comes from the gitignored repo-root .env.local;
 * in CI it is the PostgreSQL 17 service. Files run one at a time because
 * they share (and reset) one database.
 */
for (const file of [resolve(import.meta.dirname, ".env.local"), resolve(import.meta.dirname, "../../.env.local")]) {
  if (!process.env.TEST_DATABASE_URL && existsSync(file)) process.loadEnvFile(file);
}
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for the real-PostgreSQL suite (it must name a *_test database).");
}

export default mergeConfig(
  base,
  defineConfig({
    test: { fileParallelism: false },
  }),
);
