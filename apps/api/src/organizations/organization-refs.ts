import { inArray, sql } from "drizzle-orm";
import type { Database } from "../common/database/database.module.js";
import { organizations } from "./organizations.schema.js";

/** How many of `ids` exist as organizations (for request validation). */
export async function countExistingOrganizations(db: Database, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizations)
    .where(inArray(organizations.id, [...ids]));
  return row?.count ?? 0;
}
