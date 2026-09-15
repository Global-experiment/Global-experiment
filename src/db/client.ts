import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseEnv } from "@/shared/config/env";

type Database = ReturnType<typeof drizzle>;

let cachedDb: Database | undefined;

/**
 * Lazily creates the Postgres connection and Drizzle instance.
 *
 * No schema tables exist yet — see docs/architecture/decisions/
 * 002-postgresql-supabase-infrastructure.md. This is connection plumbing,
 * ready for the first real table (e.g. audit_events) to be added under
 * src/db/schema/ when a concrete action actually needs it.
 */
export function getDb(): Database {
  if (cachedDb) return cachedDb;

  const env = getDatabaseEnv();
  const queryClient = postgres(env.DATABASE_URL, { max: 5 });
  cachedDb = drizzle(queryClient);
  return cachedDb;
}
