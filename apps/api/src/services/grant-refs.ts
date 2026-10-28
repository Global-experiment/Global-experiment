import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../common/database/database.module.js";
import type { GrantRef } from "./services.contracts.js";
import { accessGrants, accessLevels, accessStatuses, services } from "./services.schema.js";

/**
 * The access grants (not archived) of people, admin accounts or services,
 * by owner id — the Permissions chips of a person (“GitHub · admin”), the
 * Accounts list and a service. Shared, so any repository can show them.
 */
export async function grantRefsByOwner(db: Pick<Database, "select">, owner: "person" | "account" | "service", ids: readonly string[]): Promise<Map<string, GrantRef[]>> {
  const result = new Map<string, GrantRef[]>();
  if (ids.length === 0) return result;
  const column = { person: accessGrants.personId, account: accessGrants.adminUserId, service: accessGrants.serviceId }[owner];
  const rows = await db
    .select({
      ownerId: sql<string>`${column}`,
      id: accessGrants.id,
      service: services.name,
      level: accessLevels.label,
      statusKey: accessGrants.statusKey,
      statusLabel: accessStatuses.label,
    })
    .from(accessGrants)
    .innerJoin(services, eq(services.id, accessGrants.serviceId))
    .leftJoin(accessLevels, eq(accessLevels.key, accessGrants.levelKey))
    .leftJoin(accessStatuses, eq(accessStatuses.key, accessGrants.statusKey))
    .where(and(inArray(column, [...ids]), isNull(accessGrants.archivedAt)))
    .orderBy(asc(sql`lower(${services.name})`), asc(accessLevels.sortOrder), asc(accessGrants.grantNumber));
  for (const row of rows) {
    const ref: GrantRef = { id: row.id, service: row.service, level: row.level, status: row.statusKey ? { key: row.statusKey, label: row.statusLabel ?? row.statusKey } : null };
    result.set(row.ownerId, [...(result.get(row.ownerId) ?? []), ref]);
  }
  return result;
}
