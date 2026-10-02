import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Loads the repo-root .env.local (same file the Next.js app and the API use
// in development) so drizzle-kit sees DATABASE_URL.
loadEnvConfig(process.cwd());

/**
 * The single migration configuration. The native API (apps/api) owns the
 * database: each module declares its tables in `*.schema.ts`, and versioned
 * SQL migrations live in apps/api/drizzle. The Next.js app never connects
 * to Postgres directly — it talks to the API (see
 * docs/native-backend-implementation-plan.md).
 *
 *   npm run db:generate   # write a new migration from schema changes
 *   npm run db:migrate    # apply pending migrations to DATABASE_URL
 *
 * Never run db:migrate against production from a development machine;
 * production migrations are an explicit, backed-up operator step.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./apps/api/src/**/*.schema.ts",
  out: "./apps/api/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
