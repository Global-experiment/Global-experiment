import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { NotionClient } from "../import/notion/notion-client.js";
import { formatTaxonomyReport, runTaxonomyImport } from "../import/taxonomy/taxonomy-import.js";
import { readTaxonomy } from "../import/taxonomy/taxonomy-source.js";

/**
 * `npm run api:import:taxonomy -- [--dry-run] [--apply] [--deprecate-missing]`
 *
 * Copies the Notion "0.1 native" Domains → Fields → Expertise (and Teams)
 * into DATABASE_URL. Dry run by default: prints the full report and writes
 * only an import_runs record. --apply writes everything in one transaction.
 * Rules: docs/architecture/data-model.md §5. Never deletes anything.
 *
 * Needs NOTION_API_KEY, NOTION_DOMAINS_DB_ID, NOTION_FIELDS_DB_ID,
 * NOTION_EXPERTISE_DB_ID (environment or the gitignored .env.local).
 */
export interface ImportArgs {
  apply: boolean;
  deprecateMissing: boolean;
}

export function parseImportArgs(argv: readonly string[]): ImportArgs {
  const args: ImportArgs = { apply: false, deprecateMissing: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") continue;
    else if (arg === "--deprecate-missing") args.deprecateMissing = true;
    else throw new Error(`Unknown argument: ${arg}. Use --dry-run (default), --apply, --deprecate-missing.`);
  }
  if (argv.includes("--dry-run") && args.apply) throw new Error("--dry-run and --apply can't be combined.");
  return args;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
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
  const source = await readTaxonomy(notion, {
    domains: required("NOTION_DOMAINS_DB_ID"),
    fields: required("NOTION_FIELDS_DB_ID"),
    expertise: required("NOTION_EXPERTISE_DB_ID"),
  });
  console.log(`Read from Notion: ${source.domains.length} domains, ${source.fields.length} fields, ${source.expertise.length} expertise. Database: "${database}".\n`);

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    const result = await runTaxonomyImport(db, source, {
      apply: args.apply,
      deprecateMissing: args.deprecateMissing,
      triggeredBy: `cli:${userInfo().username}`,
    });
    console.log(formatTaxonomyReport(result));
    if (!args.apply) console.log("\nTo write these changes: --apply.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Only when run as the command, not when imported by tests.
if (process.argv[1] && /import-taxonomy\.(js|ts)$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    // Messages only: never the connection string or the Notion token.
    console.error(error instanceof Error ? error.message : "Taxonomy import failed.");
    process.exit(1);
  });
}
