import { plainText, type NotionDatabase, type NotionPage, type NotionProperty, type NotionReader } from "../notion/notion-client.js";

/**
 * Reads the Notion "Treasury" database into plain records
 * (docs/architecture/data-model.md §4.5). Nothing is cleaned or validated
 * here beyond reading values — that's treasury-plan.ts.
 *
 * Property names are matched ignoring a leading "*" (Notion's "required for
 * completeness" marker), as for the directory.
 */

type PropertyType = "title" | "rich_text" | "select" | "multi_select" | "number" | "date" | "unique_id" | "relation";

interface PropertySpec {
  type: PropertyType;
  /** Optional: may be absent from the database without breaking the import. */
  optional?: boolean;
}

export const TREASURY_PROPERTIES = {
  Name: { type: "title" },
  "Entry type": { type: "select" },
  Source: { type: "select" },
  "Transaction date": { type: "date" },
  "Net amount": { type: "number" },
  Currency: { type: "select" },
  Cadence: { type: "select" },
  "Expense type": { type: "multi_select" },
  "Recipient person": { type: "relation" },
  "Recipient organization": { type: "relation" },
  "Review status": { type: "select" },
  "Reviewed on": { type: "date" },
  "Reviewed by": { type: "relation", optional: true },
  "Publication status": { type: "select" },
  "Published on": { type: "date" },
  "Public description": { type: "rich_text" },
  "Internal note": { type: "rich_text" },
  "Source account ID": { type: "rich_text" },
  "External transaction ID": { type: "rich_text" },
  "Wise transaction number": { type: "rich_text", optional: true },
  "Imported at": { type: "date", optional: true },
  "Transaction ID": { type: "unique_id" },
} as const satisfies Record<string, PropertySpec>;

const canonical = (name: string) => name.replace(/^\*\s*/, "").trim().toLowerCase();

export interface TreasuryLayout {
  names: Record<string, string>;
  /** Notion properties we don't read (reported once per run). */
  unread: string[];
  absent: string[];
}

export function treasuryLayout(database: Pick<NotionDatabase, "properties">): TreasuryLayout {
  const byCanonical = new Map(Object.entries(database.properties).map(([name, property]) => [canonical(name), { name, type: property.type }]));
  const names: Record<string, string> = {};
  const problems: string[] = [];
  const absent: string[] = [];
  for (const [ours, spec] of Object.entries(TREASURY_PROPERTIES) as [string, PropertySpec][]) {
    const found = byCanonical.get(canonical(ours));
    if (!found) {
      if (spec.optional) absent.push(ours);
      else problems.push(`"${ours}" is missing`);
      continue;
    }
    if (found.type !== spec.type) {
      problems.push(`"${found.name}" should be ${spec.type}, found ${found.type}`);
      continue;
    }
    names[ours] = found.name;
  }
  if (problems.length > 0) throw new Error(`The Notion Treasury database changed shape: ${problems.join("; ")}.`);
  const read = new Set(Object.values(names));
  return { names, unread: Object.keys(database.properties).filter((name) => !read.has(name)), absent };
}

export interface SourceTreasuryEntry {
  pageId: string;
  createdTime: string;
  /** Transaction ID (EXP-n): n. */
  number: number | null;
  name: string;
  entryType: string | null;
  source: string | null;
  /** The Notion date as written: "2026-09-07" or "2026-09-07T14:07:00.000+02:00". */
  transactionDate: string | null;
  /** Signed, in whole currency units (decided: Notion amounts are units). */
  netAmount: number | null;
  currency: string | null;
  cadence: string | null;
  expenseTypes: string[];
  recipientPersonPageIds: string[];
  recipientOrganizationPageIds: string[];
  reviewStatus: string | null;
  reviewedOn: string | null;
  /** "Reviewed by" relates to People, not to admins: reported only. */
  reviewedByCount: number;
  publicationStatus: string | null;
  publishedOn: string | null;
  publicDescription: string | null;
  internalNote: string | null;
  sourceAccountId: string | null;
  externalTransactionId: string | null;
  wiseTransactionNumber: string | null;
  importedAt: string | null;
}

const text = (property: NotionProperty | undefined): string | null => {
  if (!property) return null;
  let value: string | null | undefined;
  if (property.type === "title" || property.type === "rich_text") value = plainText(property);
  else if (property.type === "select") value = property.select?.name;
  else if (property.type === "date") value = property.date?.start;
  return value?.trim() ? value.trim() : null;
};

export type RelationReader = (pageId: string, property: NotionProperty) => Promise<string[]>;
const inlineRelation: RelationReader = async (_pageId, property) => (property.relation ?? []).map((relation) => relation.id);

export async function toSourceTreasuryEntry(page: NotionPage, layout: TreasuryLayout, relations: RelationReader = inlineRelation): Promise<SourceTreasuryEntry> {
  const get = (ours: string) => (layout.names[ours] ? page.properties[layout.names[ours]] : undefined);
  const relation = async (ours: string) => (get(ours) ? relations(page.id, get(ours)!) : []);
  const amount = get("Net amount")?.number;
  return {
    pageId: page.id,
    createdTime: page.created_time,
    number: get("Transaction ID")?.unique_id?.number ?? null,
    name: text(get("Name")) ?? "",
    entryType: text(get("Entry type")),
    source: text(get("Source")),
    transactionDate: text(get("Transaction date")),
    netAmount: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
    currency: text(get("Currency")),
    cadence: text(get("Cadence")),
    expenseTypes: (get("Expense type")?.multi_select ?? []).map((option) => option.name.trim()).filter(Boolean),
    recipientPersonPageIds: await relation("Recipient person"),
    recipientOrganizationPageIds: await relation("Recipient organization"),
    reviewStatus: text(get("Review status")),
    reviewedOn: text(get("Reviewed on")),
    reviewedByCount: (await relation("Reviewed by")).length,
    publicationStatus: text(get("Publication status")),
    publishedOn: text(get("Published on")),
    publicDescription: text(get("Public description")),
    internalNote: text(get("Internal note")),
    sourceAccountId: text(get("Source account ID")),
    externalTransactionId: text(get("External transaction ID")),
    wiseTransactionNumber: text(get("Wise transaction number")),
    importedAt: text(get("Imported at")),
  };
}

export interface TreasurySource {
  entries: SourceTreasuryEntry[];
  layout: TreasuryLayout;
}

export async function readTreasury(client: NotionReader, databaseId: string): Promise<TreasurySource> {
  const relations: RelationReader = async (pageId, property) =>
    property.has_more && property.id ? client.relationIds(pageId, property.id) : (property.relation ?? []).map((relation) => relation.id);
  const layout = treasuryLayout(await client.database(databaseId));
  const entries: SourceTreasuryEntry[] = [];
  for (const page of await client.allPages(databaseId)) {
    if (page.archived || page.in_trash) continue;
    entries.push(await toSourceTreasuryEntry(page, layout, relations));
  }
  return { entries, layout };
}
