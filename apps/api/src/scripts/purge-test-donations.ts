import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { backupRefusal, parsePurgeArgs } from "./demo-data-purge.js";
import { formatTestDonationsPlan, planTestDonationsPurge, purgeTestDonations } from "./test-donations-purge.js";

/**
 * `npm run api:purge-test-donations -- [--dry-run]` counts the Stripe
 * test-mode rows (livemode = false) in DATABASE_URL — entries, subscriptions,
 * events (default: dry run, nothing changes).
 * `npm run api:purge-test-donations -- --confirm --backup <file>` deletes them
 * in one transaction — only with a database backup taken in the last 24
 * hours. Live rows are never touched.
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
      console.log(formatTestDonationsPlan(await planTestDonationsPurge(db), `DRY RUN on database "${database}" — nothing is changed.`));
      console.log("\nTo delete these rows: --confirm --backup <fresh backup file>.");
      return;
    }
    const purged = await purgeTestDonations(db);
    console.log(formatTestDonationsPlan(purged, `PURGED on database "${database}" (one transaction; backup: ${args.backup}).`));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Messages only: never the connection string.
  console.error(error instanceof Error ? error.message : "Test donations purge failed.");
  process.exit(1);
});
