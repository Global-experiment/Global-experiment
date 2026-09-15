import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Reuses Next.js's own .env.local loading so drizzle-kit (run outside the
// Next.js process) sees the same DATABASE_URL as the application.
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  // No schema files exist yet — this glob will simply match nothing until
  // the first real table is added under src/db/schema/.
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
