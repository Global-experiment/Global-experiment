import { eq, inArray, sql } from "drizzle-orm";
import { adminUsers } from "../auth/auth.schema.js";
import { accessGrants, accessLevels, services } from "../services/services.schema.js";
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
  if (entityType === "service") {
    const [row] = await db.select({ name: services.name }).from(services).where(eq(services.id, entityId)).limit(1);
    return row?.name;
  }
  if (entityType === "access_grant") {
    const [row] = await db
      .select({ grantNumber: accessGrants.grantNumber, title: grantTitle })
      .from(accessGrants)
      .innerJoin(services, eq(services.id, accessGrants.serviceId))
      .leftJoin(accessLevels, eq(accessLevels.key, accessGrants.levelKey))
      .where(eq(accessGrants.id, entityId))
      .limit(1);
    return row ? `#${row.grantNumber} · ${row.title}` : undefined;
  }
  if (entityType === "admin_user") {
    const [row] = await db.select({ name: adminName }).from(adminUsers).where(eq(adminUsers.id, entityId)).limit(1);
    return row?.name;
  }
  return undefined;
}

/** A grant's shown name: its own, else "<service> / <level>" (Figma p17). */
const grantTitle = sql<string>`coalesce(${accessGrants.name}, ${services.name} || coalesce(' / ' || ${accessLevels.label}, ''))`;
const adminName = sql<string>`coalesce(${adminUsers.displayName}, split_part(${adminUsers.email}, '@', 1))`;

/** "PER-81 · Stanley Qiang" → "Stanley Qiang": a stored label without its number. */
export const titleOfLabel = (label: string) => label.replace(/^((PER|ORG|EXP)-\d+|#\d+) · /, "");

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
    ["service", services, services.id, services.name],
  ] as const;
  await Promise.all(
    tables.map(async ([type, table, id, name]) => {
      const ids = idsOf(type);
      if (ids.length === 0) return;
      const rows = await db.select({ id, name }).from(table).where(inArray(id, ids));
      for (const row of rows) titles.set(`${type}:${row.id}`, row.name);
    }),
  );
  const grantIds = idsOf("access_grant");
  if (grantIds.length > 0) {
    const rows = await db
      .select({ id: accessGrants.id, title: grantTitle })
      .from(accessGrants)
      .innerJoin(services, eq(services.id, accessGrants.serviceId))
      .leftJoin(accessLevels, eq(accessLevels.key, accessGrants.levelKey))
      .where(inArray(accessGrants.id, grantIds));
    for (const row of rows) titles.set(`access_grant:${row.id}`, row.title);
  }
  const accountIds = idsOf("admin_user");
  if (accountIds.length > 0) {
    const rows = await db.select({ id: adminUsers.id, name: adminName }).from(adminUsers).where(inArray(adminUsers.id, accountIds));
    for (const row of rows) titles.set(`admin_user:${row.id}`, row.name);
  }
  return titles;
}
