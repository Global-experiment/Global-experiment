import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { formatSamplePlan, planSamplePurge, purgeSampleTreasury } from "./sample-treasury.js";

/**
 * `npm run api:purge-sample-treasury -- [--dry-run]` counts the sample
 * Treasury data in DATABASE_URL (default: dry run, nothing changes);
 * `-- --confirm` removes every sample entry and the sample figures in one
 * transaction. Real entries are never touched. See sample-treasury.ts.
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
  const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    if (!confirm) {
      console.log(formatSamplePlan(await planSamplePurge(db), `DRY RUN on database "${database}" — nothing is removed.`));
      console.log("\nTo remove them: --confirm.");
      return;
    }
    console.log(formatSamplePlan(await purgeSampleTreasury(db), `REMOVED on database "${database}" (one transaction).`));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Messages only: never the connection string.
  console.error(error instanceof Error ? error.message : "Sample Treasury command failed.");
  process.exit(1);
});
