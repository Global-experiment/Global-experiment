import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Database } from "../common/database/database.module.js";
import { pgliteDirectory } from "../common/database/local-database.js";
import * as schema from "../common/database/schema.js";
import { applyImport, formatPlan, planImport } from "../cms/notion-import.js";
import { NotionHttpSource } from "../cms/notion-source.js";
import { LocalDiskStorage } from "../files/file-storage.js";
import { backupRefusal } from "./demo-data-purge.js";

/**
 * The one-time copy of Home and Documentation from Notion (Delivery 6,
 * ADR 020). Reads Notion only.
 *
 *   npm run cms:import-notion                                 dry run: the report, nothing written
 *   npm run cms:import-notion -- --apply --backup <file>      writes, in one transaction
 *
 * --apply needs a database backup taken in the last 24 hours, and refuses
 * to run when any native page already exists (it runs once). Settings:
 * DATABASE_URL, FILE_STORAGE_DIR (images), NOTION_API_KEY,
 * NOTION_HOME_PAGE_ID, NOTION_DOCUMENTATION_DB_ID. Nothing secret is
 * printed. On production it runs only as an explicit, backed-up operator
 * step, after the maintainer's dry run and the client's OK.
 */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const backup = args.includes("--backup") ? args[args.indexOf("--backup") + 1] : undefined;
  // Variables already set win (loadEnvFile never overwrites them); the file fills in the rest.
  const needed = ["DATABASE_URL", "NOTION_API_KEY", "NOTION_HOME_PAGE_ID", "NOTION_DOCUMENTATION_DB_ID"];
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    if (needed.some((key) => !process.env[key]) && existsSync(file)) process.loadEnvFile(file);
  }
  const { DATABASE_URL: url, NOTION_API_KEY: token, NOTION_HOME_PAGE_ID: home, NOTION_DOCUMENTATION_DB_ID: documentation } = process.env;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!token || !home || !documentation) throw new Error("NOTION_API_KEY, NOTION_HOME_PAGE_ID and NOTION_DOCUMENTATION_DB_ID are needed.");
  if (apply) {
    const refusal = backupRefusal(backup);
    if (refusal) throw new Error(`Refusing to import: ${refusal}`);
  }

  const { db, name, close } = await open(url);
  try {
    const source = new NotionHttpSource(token, home, documentation);
    const plan = await planImport(db, source);
    console.log(formatPlan(plan, `${apply ? "IMPORT" : "DRY RUN — nothing is written"} into database "${name}"`));
    if (!apply) {
      console.log("\nTo import: --apply --backup <fresh backup file>.");
      return;
    }
    const production = process.env.NODE_ENV === "production";
    const storage = new LocalDiskStorage(process.env.FILE_STORAGE_DIR ?? (production ? "/var/lib/global-experiment/files" : ".data/files"));
    const result = await applyImport(db, storage, source, plan);
    console.log(`\nImported ${result.documents} document(s) and ${result.images} image(s) (backup: ${backup}).`);
    console.log(await revalidateWebsite());
  } finally {
    await close();
  }
}

/** Asks the website to drop its cached Home and Documentation (as the API does after a publication). */
async function revalidateWebsite(): Promise<string> {
  const secret = process.env.REVALIDATE_SECRET;
  const web = process.env.WEB_INTERNAL_URL ?? "http://127.0.0.1:3000";
  if (!secret) return "REVALIDATE_SECRET isn't set: the website shows the imported pages within 5 minutes.";
  try {
    const response = await fetch(`${web}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tags: ["home", "documentation"] }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok
      ? "The website was told to show the imported pages now."
      : `The website refused the revalidation (${response.status}): it shows the pages within 5 minutes.`;
  } catch {
    return "The website couldn't be reached: it shows the imported pages within 5 minutes.";
  }
}

async function open(url: string): Promise<{ db: Database; name: string; close: () => Promise<void> }> {
  const directory = pgliteDirectory(url);
  if (directory) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    mkdirSync(dirname(directory), { recursive: true });
    const client = new PGlite(directory);
    return { db: drizzle(client, { schema }) as unknown as Database, name: "local PGlite", close: () => client.close() };
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  return {
    db: drizzle(client, { schema }) as unknown as Database,
    name: decodeURIComponent(new URL(url).pathname.replace(/^\//, "")),
    close: () => client.end({ timeout: 5 }),
  };
}

main().catch((error: unknown) => {
  // Messages only: never a token or the connection string.
  console.error(error instanceof Error ? error.message : "The Notion import failed.");
  process.exit(1);
});
