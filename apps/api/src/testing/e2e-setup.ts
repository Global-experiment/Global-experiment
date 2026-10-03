import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { AuthRepository } from "../auth/auth.repository.js";
import { hashPassword } from "../auth/password.js";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { seedDemoData } from "../seed/seed-demo.js";

/**
 * Prepares the database the admin Playwright suite runs against (started
 * by playwright.config.ts before the API): wipe, apply the production
 * migrations, load the demo dataset, and set the E2E owner. Refuses any
 * database whose name doesn't end in `_test` — it can never touch the
 * development or production database.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!url || !email || !password) throw new Error("DATABASE_URL, E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.");
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/_test$/.test(name)) throw new Error(`Refusing to reset "${name}": the E2E database must end in _test.`);

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await client.unsafe("drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;");
    const db = drizzle(client, { schema }) as unknown as Database;
    await migrate(db as never, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
    await seedDemoData(db);
    await new AuthRepository(db).upsertOwner(email, await hashPassword(password));
    console.log(`E2E database "${name}" reset, migrated and seeded.`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "E2E setup failed.");
  process.exit(1);
});
