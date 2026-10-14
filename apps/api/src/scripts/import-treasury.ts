import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { NotionClient } from "../import/notion/notion-client.js";
import { formatTreasuryReport, runTreasuryImport } from "../import/treasury/treasury-import.js";
import { treasuryOnlyDemoRefusal } from "../import/treasury/treasury-plan.js";
import { readTreasury } from "../import/treasury/treasury-source.js";
import { settings } from "../settings/settings.schema.js";

/**
 * `npm run api:import:treasury -- [--dry-run] [--apply]`
 *
 * Copies the Notion "Treasury" expenses into DATABASE_URL as Notion-managed
 * entries (donations are native, from Stripe, and are skipped). Dry run by
 * default: prints the full report and writes only an import_runs record.
 * --apply writes everything in one transaction, and refuses a run made only
 * of demo rows. Import People and Organizations first (api:import:directory):
 * recipients resolve to imported records. Never deletes entries and never
 * touches native ones.
 *
 * Needs NOTION_API_KEY and NOTION_TREASURY_DB_ID (environment or the
 * gitignored .env.local).
 */
export interface TreasuryImportArgs {
  apply: boolean;
}

export function parseTreasuryImportArgs(argv: readonly string[]): TreasuryImportArgs {
  const args: TreasuryImportArgs = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg !== "--dry-run") throw new Error(`Unknown argument: ${arg}. Use --dry-run (default) or --apply.`);
  }
  if (argv.includes("--dry-run") && args.apply) throw new Error("--dry-run and --apply can't be combined.");
  return args;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/** treasury.publish_unqualified: the settings row, else the environment default (false). */
async function publishUnqualified(db: Database): Promise<boolean> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "treasury.publish_unqualified"));
  if (typeof row?.value === "boolean") return row.value;
  return /^(true|1)$/.test(process.env.TREASURY_PUBLISH_UNQUALIFIED?.trim() ?? "");
}

async function main() {
  const args = parseTreasuryImportArgs(process.argv.slice(2));
  // .env.local fills in what the environment doesn't set (an environment value always wins).
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
      if (!process.env[key]?.trim()) process.env[key] = value;
    }
  }
  const url = required("DATABASE_URL");
  const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  const notion = new NotionClient({ token: required("NOTION_API_KEY") });
  const source = await readTreasury(notion, required("NOTION_TREASURY_DB_ID"));
  console.log(`Read from Notion: ${source.entries.length} Treasury rows. Database: "${database}".\n`);

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    const result = await runTreasuryImport(db, source, {
      apply: args.apply,
      triggeredBy: `cli:${userInfo().username}`,
      publishUnqualified: await publishUnqualified(db),
    });
    console.log(formatTreasuryReport(result));
    if (!args.apply && result.counts.changes > 0 && !treasuryOnlyDemoRefusal(result.plan)) console.log("\nTo write these changes: --apply.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Only when run as the command, not when imported by tests.
if (process.argv[1] && /import-treasury\.(js|ts)$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    // Messages only: never the connection string or the Notion token.
    console.error(error instanceof Error ? error.message : "Treasury import failed.");
    process.exit(1);
  });
}
