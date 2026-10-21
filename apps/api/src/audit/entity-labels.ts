import { eq } from "drizzle-orm";
import { organizations } from "../organizations/organizations.schema.js";
import { people } from "../people/people.schema.js";
import { treasuryEntries } from "../treasury/treasury.schema.js";
import type { Executor } from "./audit.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "USD 200.00" — the code and the amount with 2 decimals (history chips; the web formats everything else). */
export const moneyLabel = (minor: number, currency: string) =>
  `${minor < 0 ? "−" : ""}${currency.toUpperCase()} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(minor) / 100)}`;

export const personLabel = (row: { personNumber: number; name: string }) => `PER-${row.personNumber} · ${row.name}`;
export const organizationLabel = (row: { orgNumber: number; name: string }) => `ORG-${row.orgNumber} · ${row.name}`;
export const entryLabel = (row: { entryNumber: number; grossAmount: number; currency: string }) => `EXP-${row.entryNumber} · ${moneyLabel(row.grossAmount, row.currency)}`;

/**
 * The label of a record that has a detail page, as the history shows it
 * ("PER-81 · Stanley Qiang"), or undefined when it doesn't exist.
 */
export async function entityLabel(db: Executor, entityType: string, entityId: string): Promise<string | undefined> {
  if (!UUID.test(entityId)) return undefined;
  if (entityType === "person") {
    const [row] = await db.select({ personNumber: people.personNumber, name: people.name }).from(people).where(eq(people.id, entityId)).limit(1);
    return row ? personLabel(row) : undefined;
  }
  if (entityType === "organization") {
    const [row] = await db.select({ orgNumber: organizations.orgNumber, name: organizations.name }).from(organizations).where(eq(organizations.id, entityId)).limit(1);
    return row ? organizationLabel(row) : undefined;
  }
  if (entityType === "treasury_entry") {
    const [row] = await db
      .select({ entryNumber: treasuryEntries.entryNumber, grossAmount: treasuryEntries.grossAmount, currency: treasuryEntries.currency })
      .from(treasuryEntries)
      .where(eq(treasuryEntries.id, entityId))
      .limit(1);
    return row ? entryLabel(row) : undefined;
  }
  return undefined;
}
