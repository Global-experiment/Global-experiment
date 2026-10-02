import "reflect-metadata";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import { migrate as migratePostgresJs } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { AppModule } from "../app.module.js";
import { configureApp, createHttpAdapter, finalizeApp } from "../bootstrap.js";
import { parseConfig, type AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import * as schema from "../common/database/schema.js";

export const TEST_ORIGIN = "http://localhost:3000";
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * The database every API test runs against, with the production migrations
 * applied:
 *
 * - default (`npm run api:test`): PGlite — real PostgreSQL in-process, fast,
 *   no server needed;
 * - `TEST_DATABASE_URL` set (`npm run api:test:pg`, CI): a real PostgreSQL
 *   server through the production driver (postgres-js), reset on every call.
 */
export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const realServerUrl = process.env.TEST_DATABASE_URL;
  if (realServerUrl) return createRealServerDatabase(realServerUrl);

  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Database, close: () => client.close() };
}

/**
 * Wipes and re-migrates a real PostgreSQL database. Refuses any database
 * whose name doesn't end in `_test`, so a mis-set variable can never wipe a
 * development or production database.
 */
async function createRealServerDatabase(url: string) {
  const databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/_test$/.test(databaseName)) {
    throw new Error(`Refusing to reset "${databaseName}": TEST_DATABASE_URL must point at a *_test database.`);
  }
  const client = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
  await client.unsafe("drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;");
  const db = drizzlePostgresJs(client, { schema });
  await migratePostgresJs(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Database, close: () => client.end({ timeout: 5 }) };
}

export function testConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return parseConfig({
    NODE_ENV: "test",
    // Never dialled: the DATABASE provider is replaced by PGlite.
    DATABASE_URL: "postgres://unused@127.0.0.1:1/unused",
    ADMIN_ALLOWED_ORIGINS: TEST_ORIGIN,
    ...overrides,
  });
}

export interface TestApp {
  app: INestApplication;
  db: Database;
  config: AppConfig;
  close: () => Promise<void>;
}

/** Boots the full application (guards, filters, middleware) against a fresh database. */
export async function createTestApp(env: NodeJS.ProcessEnv = {}): Promise<TestApp> {
  const config = testConfig(env);
  const database = await createTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(DATABASE)
    .useValue(database.db)
    .compile();
  const app = moduleRef.createNestApplication(createHttpAdapter(), { bodyParser: false, logger: false });
  configureApp(app, config);
  await app.init();
  finalizeApp(app);
  return {
    app,
    db: database.db,
    config,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}
