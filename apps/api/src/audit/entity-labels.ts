import { eq, inArray } from "drizzle-orm";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
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

/** "PER-81 · Stanley Qiang" → "Stanley Qiang": a stored label without its number. */
export const titleOfLabel = (label: string) => label.replace(/^(PER|ORG|EXP)-\d+ · /, "");

/**
 * The current titles of the records a page of events is about (Monitoring →
 * History: "Candide updated Stanley Qiang", client 2026-10-23), by
 * "type:id". A record that no longer exists has no entry: the event's own
 * label stands in for it.
 */
export async function entityTitles(db: Executor, refs: readonly { type: string; id: string }[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const idsOf = (type: string) => [...new Set(refs.filter((ref) => ref.type === type && UUID.test(ref.id)).map((ref) => ref.id))];
  const tables = [
    ["person", people, people.id, people.name],
    ["organization", organizations, organizations.id, organizations.name],
    ["treasury_entry", treasuryEntries, treasuryEntries.id, treasuryEntries.name],
    ["expertise_domain", expertiseDomains, expertiseDomains.id, expertiseDomains.name],
    ["expertise_field", expertiseFields, expertiseFields.id, expertiseFields.name],
    ["expertise_item", expertiseItems, expertiseItems.id, expertiseItems.name],
  ] as const;
  await Promise.all(
    tables.map(async ([type, table, id, name]) => {
      const ids = idsOf(type);
      if (ids.length === 0) return;
      const rows = await db.select({ id, name }).from(table).where(inArray(id, ids));
      for (const row of rows) titles.set(`${type}:${row.id}`, row.name);
    }),
  );
  return titles;
}
