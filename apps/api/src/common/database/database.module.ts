import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import * as schema from "./schema.js";

export type Schema = typeof schema;

/**
 * Driver-agnostic Drizzle handle: production uses postgres-js, tests use
 * PGlite (real Postgres in-process). Repositories depend only on this.
 */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export const DATABASE = Symbol("DATABASE");
const SQL_CLIENT = Symbol("SQL_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: SQL_CLIENT,
      inject: [APP_CONFIG],
      // Small pool: one owner admin and a low-traffic public API.
      useFactory: (config: AppConfig) => postgres(config.databaseUrl, { max: 10, prepare: false, onnotice: () => {} }),
    },
    {
      provide: DATABASE,
      inject: [SQL_CLIENT],
      useFactory: (client: postgres.Sql): Database => drizzle(client, { schema }) as unknown as Database,
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown() {
    await this.client.end({ timeout: 5 });
  }
}
