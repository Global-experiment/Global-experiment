import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { formatDirectoryReport, runDirectoryImport } from "../import/directory/directory-import.js";
import { onlyDemoRefusal } from "../import/directory/directory-plan.js";
import { readDirectory } from "../import/directory/directory-source.js";
import { NotionClient } from "../import/notion/notion-client.js";

/**
 * `npm run api:import:directory -- [--dry-run] [--apply]`
 *
 * Copies the Notion "0.1 native" Organizations and People (and their
 * person ↔ organization and Expertise links) into DATABASE_URL. Dry run by
 * default: prints the full report and writes only an import_runs record.
 * --apply writes everything in one transaction, and refuses a run made only
 * of demo records. Import the taxonomy first (api:import:taxonomy): expertise
 * links resolve to imported Expertise items. Never deletes records.
 *
 * Needs NOTION_API_KEY, NOTION_PEOPLE_DB_ID, NOTION_ORGANIZATIONS_DB_ID
 * (environment or the gitignored .env.local).
 */
export interface DirectoryImportArgs {
  apply: boolean;
}

export function parseDirectoryImportArgs(argv: readonly string[]): DirectoryImportArgs {
  const args: DirectoryImportArgs = { apply: false };
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

async function main() {
  const args = parseDirectoryImportArgs(process.argv.slice(2));
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
  const source = await readDirectory(notion, {
    people: required("NOTION_PEOPLE_DB_ID"),
    organizations: required("NOTION_ORGANIZATIONS_DB_ID"),
  });
  console.log(`Read from Notion: ${source.people.length} people, ${source.organizations.length} organizations. Database: "${database}".\n`);

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    const result = await runDirectoryImport(db, source, { apply: args.apply, triggeredBy: `cli:${userInfo().username}` });
    console.log(formatDirectoryReport(result));
    if (!args.apply && result.counts.changes > 0 && !onlyDemoRefusal(result.plan)) console.log("\nTo write these changes: --apply.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Only when run as the command, not when imported by tests.
if (process.argv[1] && /import-directory\.(js|ts)$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    // Messages only: never the connection string or the Notion token.
    console.error(error instanceof Error ? error.message : "Directory import failed.");
    process.exit(1);
  });
}
