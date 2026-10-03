import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";
import { demoSeedRefusal, removeDemoData, seedDemoData } from "./seed-demo.js";

/**
 * `npm run api:seed:demo` — loads DEMO DEVELOPMENT DATA into the local
 * database (DATABASE_URL from the gitignored .env.local).
 * `npm run api:seed:demo -- --reset` removes the demo rows only.
 * Refuses production and any database not named *_dev / *_test.
 */
async function main() {
  for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const refusal = demoSeedRefusal(process.env, url);
  if (refusal) throw new Error(`Refusing to seed demo data: ${refusal}`);

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    if (process.argv.includes("--reset")) {
      await removeDemoData(db);
      console.log("Demo data removed.");
    } else {
      const counts = await seedDemoData(db);
      console.log(
        `Demo data loaded: ${counts.people} people, ${counts.organizations} organizations, ${counts.expertise} expertise tags.`,
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Messages only: never the connection string.
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exit(1);
});
