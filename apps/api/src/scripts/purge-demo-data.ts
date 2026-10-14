import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { backupRefusal, formatPlan, parsePurgeArgs, planDemoPurge, purgeDemoData } from "./demo-data-purge.js";

/**
 * `npm run api:purge-demo-data -- [--dry-run]` lists the demo/sample
 * directory records in DATABASE_URL (default: dry run, nothing changes).
 * `npm run api:purge-demo-data -- --confirm --backup <file>` deletes them in
 * one transaction — only with a database backup taken in the last 24 hours.
 * See demo-data-purge.ts for what counts as demo data.
 *
 * Run it against production only as an explicit, backed-up operator step.
 */
async function main() {
  const args = parsePurgeArgs(process.argv.slice(2));
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    if (!process.env.DATABASE_URL && existsSync(file)) process.loadEnvFile(file);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));

  if (args.confirm) {
    const refusal = backupRefusal(args.backup);
    if (refusal) throw new Error(`Refusing to purge: ${refusal}`);
  }

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    if (!args.confirm) {
      console.log(formatPlan(await planDemoPurge(db), `DRY RUN on database "${database}" — nothing is changed.`));
      console.log("\nTo delete these rows: --confirm --backup <fresh backup file>.");
      return;
    }
    const applied = await purgeDemoData(db);
    console.log(formatPlan(applied, `PURGED on database "${database}" (one transaction; backup: ${args.backup}).`));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Messages only: never the connection string.
  console.error(error instanceof Error ? error.message : "Demo data purge failed.");
  process.exit(1);
});
