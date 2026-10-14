import { count, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database } from "./database/database.module.js";
import { ValidationFailedError } from "./errors/api-error.js";

type Executor = Pick<Database, "select">;

/**
 * Relationship caps (client, 2026-10-14; Figma record hints "People can
 * have up to 10 expertise." / "… up to 5 organizations."). Checked by every
 * write path — record PATCH/POST, the single link endpoints (either side)
 * and the Notion directory importer, which keeps the first N in Notion
 * order and reports the rest. The web admin mirrors these numbers in
 * src/modules/admin/relationLimits.ts.
 */
export const RELATION_LIMITS = {
  /** Expertise per person, and per organization. */
  expertise: 10,
  /** Organizations per person. */
  organizationsPerPerson: 5,
} as const;

export const LIMIT_MESSAGES = {
  personExpertise: `People can have up to ${RELATION_LIMITS.expertise} expertise.`,
  personOrganizations: `People can have up to ${RELATION_LIMITS.organizationsPerPerson} organizations.`,
  organizationExpertise: `Organizations can have up to ${RELATION_LIMITS.expertise} expertise.`,
} as const;

/**
 * Inside a link transaction: refuses a new link when `owner` already has
 * `limit` links in `table`. Re-linking an existing pair stays a no-op (the
 * caller's insert ignores the conflict), so it's checked first.
 */
export async function assertBelowLimit(
  tx: Executor,
  table: PgTable,
  ownerColumn: PgColumn,
  ownerId: string,
  alreadyLinked: SQL,
  limit: number,
  issue: { path: string; message: string },
): Promise<void> {
  const [existing] = await tx.select({ n: count() }).from(table).where(alreadyLinked);
  if ((existing?.n ?? 0) > 0) return;
  const [current] = await tx.select({ n: count() }).from(table).where(eq(ownerColumn, ownerId));
  if ((current?.n ?? 0) >= limit) throw new ValidationFailedError([issue]);
}
