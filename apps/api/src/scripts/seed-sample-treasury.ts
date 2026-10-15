import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { formatSamplePlan, planSampleSeed, seedSampleTreasury } from "./sample-treasury.js";

/**
 * `npm run api:seed-sample-treasury -- [--dry-run]` shows the sample Treasury
 * data it would add to DATABASE_URL (default: dry run, nothing changes);
 * `-- --confirm` adds it: sample expenses (published, marked Test) and sample
 * Balance and Sustainability figures. Refused with a live Stripe key (after
 * go-live) and when samples are already there. See sample-treasury.ts.
 * The public pages show the change within 5 minutes (their cache fallback).
 */
async function main() {
  const argv = process.argv.slice(2);
  for (const arg of argv) if (arg !== "--confirm" && arg !== "--dry-run") throw new Error(`Unknown argument: ${arg}. Use --dry-run (default) or --confirm.`);
  if (argv.includes("--confirm") && argv.includes("--dry-run")) throw new Error("--dry-run and --confirm can't be combined.");
  const confirm = argv.includes("--confirm");
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    if (!process.env.DATABASE_URL && existsSync(file)) process.loadEnvFile(file);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (/_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")) throw new Error("Refusing to add sample data: the Stripe key is live (after go-live).");
  const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    if (!confirm) {
      console.log(formatSamplePlan(planSampleSeed(), `DRY RUN on database "${database}" — nothing is added.`));
      console.log("\nTo add them: --confirm.");
      return;
    }
    console.log(formatSamplePlan(await seedSampleTreasury(db, new Date()), `ADDED on database "${database}" (one transaction).`));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Messages only: never the connection string.
  console.error(error instanceof Error ? error.message : "Sample Treasury command failed.");
  process.exit(1);
});
