import { asc, eq, inArray, sql, type Column } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Database } from "../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "./expertise.schema.js";

export interface ExpertiseRefRow {
  id: string;
  name: string;
  field: { id: string; name: string };
  domain: { id: string; name: string };
}

/**
 * Expertise tags (with their Field and Domain) for many owners at once —
 * one query per page of people/organizations, never one per row.
 */
export async function expertiseRefsByOwner(
  db: Database,
  join: { table: PgTable; ownerId: Column; expertiseId: Column },
  ownerIds: readonly string[],
): Promise<Map<string, ExpertiseRefRow[]>> {
  const result = new Map<string, ExpertiseRefRow[]>();
  if (ownerIds.length === 0) return result;

  const rows = await db
    .select({
      ownerId: sql<string>`${join.ownerId}`,
      id: expertiseItems.id,
      name: expertiseItems.name,
      fieldId: expertiseFields.id,
      fieldName: expertiseFields.name,
      domainId: expertiseDomains.id,
      domainName: expertiseDomains.name,
    })
    .from(join.table)
    .innerJoin(expertiseItems, eq(expertiseItems.id, join.expertiseId))
    .innerJoin(expertiseFields, eq(expertiseFields.id, expertiseItems.fieldId))
    .innerJoin(expertiseDomains, eq(expertiseDomains.id, expertiseFields.domainId))
    .where(inArray(join.ownerId, [...ownerIds]))
    .orderBy(asc(sql`lower(${expertiseDomains.name})`), asc(sql`lower(${expertiseFields.name})`), asc(sql`lower(${expertiseItems.name})`));

  for (const row of rows) {
    const list = result.get(row.ownerId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      field: { id: row.fieldId, name: row.fieldName },
      domain: { id: row.domainId, name: row.domainName },
    });
    result.set(row.ownerId, list);
  }
  return result;
}

/** How many of `ids` exist as expertise items (for request validation). */
export async function countExistingExpertise(db: Database, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expertiseItems)
    .where(inArray(expertiseItems.id, [...ids]));
  return row?.count ?? 0;
}
