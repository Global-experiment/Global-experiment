import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { pgliteDirectory } from "./local-database.js";
import * as schema from "./schema.js";

export type Schema = typeof schema;

/**
 * Driver-agnostic Drizzle handle: production uses postgres-js, tests and the
 * local development database (`pglite:<folder>`) use PGlite (real Postgres
 * in-process). Repositories depend only on this.
 */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export const DATABASE = Symbol("DATABASE");
const SQL_CLIENT = Symbol("SQL_CLIENT");

/** The connection behind DATABASE, closed at shutdown. */
interface SqlClient {
  db: Database;
  close(): Promise<void>;
}

async function connect(config: AppConfig): Promise<SqlClient> {
  const directory = pgliteDirectory(config.databaseUrl);
  if (directory) {
    // Loaded only for the local database: production never imports PGlite.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    mkdirSync(dirname(directory), { recursive: true }); // PGlite creates its folder, not the parents
    const client = new PGlite(directory);
    return { db: drizzlePglite(client, { schema }) as unknown as Database, close: () => client.close() };
  }
  // Small pool: one owner admin and a low-traffic public API.
  const client = postgres(config.databaseUrl, { max: 10, prepare: false, onnotice: () => {} });
  return { db: drizzle(client, { schema }) as unknown as Database, close: () => client.end({ timeout: 5 }) };
}

@Global()
@Module({
  providers: [
    { provide: SQL_CLIENT, inject: [APP_CONFIG], useFactory: connect },
    { provide: DATABASE, inject: [SQL_CLIENT], useFactory: (client: SqlClient): Database => client.db },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly client: SqlClient) {}

  async onApplicationShutdown() {
    await this.client.close();
  }
}
