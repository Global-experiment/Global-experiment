import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { formatDocumentsPlan, planDocumentsPurge, purgeTreasuryDocuments, verifiedBackupRefusal } from "./treasury-documents-purge.js";

/**
 * The one-time deletion of Treasury supporting documents (OPS-155, ADR 021).
 *
 * `npm run api:purge-treasury-documents -- [--dry-run]` counts the document
 * rows and stored files in DATABASE_URL / FILE_STORAGE_DIR (default: dry run,
 * nothing changes; counts only).
 * `npm run api:purge-treasury-documents -- --confirm --backup <file> --sha256 <hex>`
 * deletes them — only with a database backup taken in the last 24 hours
 * whose SHA-256 was verified (the same on the server and the off-site copy).
 */
interface Args {
  confirm: boolean;
  backup?: string;
  sha256?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { confirm: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--dry-run") args.confirm = false;
    else if (arg === "--backup") args.backup = argv[++index];
    else if (arg === "--sha256") args.sha256 = argv[++index]?.toLowerCase();
    else throw new Error(`Unknown argument: ${arg}. Use --dry-run (default), or --confirm --backup <file> --sha256 <hex>.`);
  }
  if (argv.includes("--dry-run") && args.confirm) throw new Error("--dry-run and --confirm can't be combined.");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    if (!process.env.DATABASE_URL && existsSync(file)) process.loadEnvFile(file);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (url.startsWith("pglite:")) throw new Error("Run it against PostgreSQL (the local PGlite database has no supporting documents to keep or delete).");
  const database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  // The API's own default (common/config/env.ts).
  const storage = process.env.FILE_STORAGE_DIR ?? (process.env.NODE_ENV === "production" ? "/var/lib/global-experiment/files" : ".data/files");

  if (args.confirm) {
    const refusal = verifiedBackupRefusal(args.backup, args.sha256);
    if (refusal) throw new Error(`Refusing to delete: ${refusal}`);
  }

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    if (!args.confirm) {
      console.log(formatDocumentsPlan(await planDocumentsPurge(db), `DRY RUN on database "${database}" — nothing is changed.`));
      console.log("\nTo delete them (once, ADR 021): --confirm --backup <fresh backup file> --sha256 <its verified SHA-256>.");
      return;
    }
    const done = await purgeTreasuryDocuments(db, storage);
    console.log(formatDocumentsPlan(done, `DELETED on database "${database}" (one transaction; backup: ${args.backup}).`));
    console.log(`stored files deleted: ${done.filesDeleted}; already missing: ${done.filesAlreadyMissing}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Messages only: never the connection string.
  console.error(error instanceof Error ? error.message : "The document deletion failed.");
  process.exit(1);
});
