import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AuthRepository } from "../auth/auth.repository.js";
import { adminUsers } from "../auth/auth.schema.js";
import { hashPassword } from "../auth/password.js";
import type { Database } from "../common/database/database.module.js";
import { pgliteDirectory } from "../common/database/local-database.js";
import { checkLocalDatabase } from "./local-database-check.js";
import * as schema from "../common/database/schema.js";
import { people } from "../people/people.schema.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import { loadCmsFixtures } from "./fixtures/load-cms-fixtures.js";
import { loadDirectoryFixtures } from "./fixtures/load-directory-fixtures.js";
import { loadTreasuryFixtures } from "./fixtures/load-treasury-fixtures.js";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * The contributor's local database (`npm run setup`, scripts/setup.mjs):
 * apply the migrations, fill an EMPTY database with the test fixtures
 * (testing/fixtures — made-up people, organizations and Treasury entries;
 * Home and Documentation whenever there are none), and set the local
 * Rootadmin. LOCAL ONLY: it refuses production, any
 * database that isn't PGlite (`pglite:<folder>`) or a PostgreSQL server on
 * this machine whose name ends in `_dev` or `_test`, and it never seeds a
 * database that already holds records.
 *
 * `--reset` deletes the PGlite folder first (PGlite only).
 */
async function open(url: string): Promise<{ db: Database; migrate: () => Promise<void>; close: () => Promise<void> }> {
  const directory = pgliteDirectory(url);
  if (directory) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    mkdirSync(dirname(directory), { recursive: true }); // PGlite creates its folder, not the parents
    const client = new PGlite(directory);
    const db = drizzle(client, { schema });
    return { db: db as unknown as Database, migrate: () => migrate(db, { migrationsFolder: MIGRATIONS }), close: () => client.close() };
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db: db as unknown as Database, migrate: () => migrate(db, { migrationsFolder: MIGRATIONS }), close: () => client.end({ timeout: 5 }) };
}

async function main() {
  const url = checkLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);
  const email = process.env.LOCAL_ADMIN_EMAIL;
  const password = process.env.LOCAL_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD are missing: run npm run setup from the repo root.");

  const directory = pgliteDirectory(url);
  if (process.argv.includes("--reset")) {
    if (!directory) throw new Error("--reset only deletes a local PGlite database; drop a PostgreSQL database yourself.");
    rmSync(directory, { recursive: true, force: true });
    console.log("Local database deleted.");
  }

  const { db, migrate, close } = await open(url);
  try {
    await migrate();
    console.log("Migrations applied.");
    const empty = (await db.$count(people)) === 0 && (await db.$count(treasuryEntries)) === 0 && (await db.$count(adminUsers)) === 0;
    if (empty) {
      await loadDirectoryFixtures(db);
      await loadTreasuryFixtures(db);
      console.log("Sample data loaded (made-up people, organizations, expertise and Treasury entries).");
    } else {
      console.log("The database already has data: left as it is (npm run setup -- --reset starts again).");
    }
    // Home and Documentation (native since Delivery 6): sample pages when there are none yet, even in an older local database.
    const pages = await loadCmsFixtures(db);
    if (pages > 0) console.log(`Sample Home and Documentation loaded (${pages} pages).`);
    const result = await new AuthRepository(db).upsertOwner(email, await hashPassword(password));
    console.log(`Local Rootadmin ${result}.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local setup failed.");
  process.exit(1);
});
