import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../common/database/database.module.js";
import { accessGrants } from "./services.schema.js";

/**
 * A permission's name (OPS-138): "Service / Account / Permission level",
 * e.g. "ChatGPT / Candide / Owner" — the level with a capital, a missing
 * part left out. Not typed by anyone: rewritten in the same transaction
 * whenever a grant, its service's name or its account's name changes
 * (migration 0014 named the existing ones the same way).
 */
export async function refreshGrantNames(db: Pick<Database, "update">, where: { grantId?: string; serviceId?: string; adminUserId?: string }): Promise<void> {
  const conditions: SQL[] = [];
  if (where.grantId) conditions.push(sql`${accessGrants.id} = ${where.grantId}`);
  if (where.serviceId) conditions.push(sql`${accessGrants.serviceId} = ${where.serviceId}`);
  if (where.adminUserId) conditions.push(sql`${accessGrants.adminUserId} = ${where.adminUserId}`);
  if (conditions.length === 0) return;
  await db
    .update(accessGrants)
    .set({
      name: sql`left(concat_ws(' / ',
        (select s.name from services s where s.id = ${accessGrants.serviceId}),
        (select coalesce(u.display_name, split_part(u.email, '@', 1)) from admin_users u where u.id = ${accessGrants.adminUserId}),
        (select upper(left(l.label, 1)) || substr(l.label, 2) from access_levels l where l.key = ${accessGrants.levelKey})
      ), 200)`,
    })
    .where(sql.join(conditions, sql` or `));
}
