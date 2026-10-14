import { plainText, type NotionDatabase, type NotionPage, type NotionProperty, type NotionReader } from "../notion/notion-client.js";

/**
 * Reads the Notion "0.1 native" People and Organizations databases into
 * plain records (docs/architecture/data-model.md §2–3). Nothing is cleaned
 * or validated here beyond reading values — that's directory-plan.ts.
 *
 * Property names are matched ignoring a leading "*": in Notion, "*" marks a
 * property as required for completeness ("*State", "*Email"…). The set of
 * starred properties is read from the schema, so a field the client stars
 * later is checked without a code change.
 */

type PropertyType = "title" | "rich_text" | "select" | "checkbox" | "email" | "phone_number" | "url" | "date" | "unique_id" | "relation";

interface PropertySpec {
  type: PropertyType;
  /** Optional: absent in Notion today (Expertise) or a future module (Expenses, Access grants). */
  optional?: boolean;
}

export const PEOPLE_PROPERTIES = {
  Name: { type: "title" },
  State: { type: "select" },
  Source: { type: "select" },
  "Personal note": { type: "rich_text" },
  "Do not contact": { type: "checkbox" },
  Email: { type: "email" },
  Phone: { type: "phone_number" },
  Website: { type: "url" },
  LinkedIn: { type: "url" },
  X: { type: "url" },
  "Other contact details": { type: "rich_text" },
  "Wise recipient account ID": { type: "rich_text" },
  "Follow-up date": { type: "date" },
  "Person ID": { type: "unique_id" },
  Organizations: { type: "relation" },
  Expertise: { type: "relation", optional: true },
  Expenses: { type: "relation", optional: true },
  "Access grants": { type: "relation", optional: true },
} as const satisfies Record<string, PropertySpec>;

export const ORGANIZATION_PROPERTIES = {
  Name: { type: "title" },
  Description: { type: "rich_text" },
  Website: { type: "url" },
  Email: { type: "email" },
  "Wise recipient account ID": { type: "rich_text" },
  "Organization ID": { type: "unique_id" },
  People: { type: "relation" },
  Expertise: { type: "relation", optional: true },
  Expenses: { type: "relation", optional: true },
} as const satisfies Record<string, PropertySpec>;

type Specs = Record<string, PropertySpec>;
const canonical = (name: string) => name.replace(/^\*\s*/, "").trim().toLowerCase();

/** How our property names map onto the database's actual (possibly starred) names. */
export interface DatabaseLayout {
  /** Our name → Notion's exact name, for the properties present. */
  names: Record<string, string>;
  /** Our names of the starred (required-for-completeness) properties. */
  required: string[];
  /** Notion properties we don't read (reported once per run). */
  unread: string[];
  /** Optional properties Notion doesn't have. */
  absent: string[];
}

export function layoutOf(kind: "people" | "organizations", database: Pick<NotionDatabase, "properties">): DatabaseLayout {
  const specs: Specs = kind === "people" ? PEOPLE_PROPERTIES : ORGANIZATION_PROPERTIES;
  const byCanonical = new Map(Object.entries(database.properties).map(([name, property]) => [canonical(name), { name, type: property.type }]));
  const names: Record<string, string> = {};
  const problems: string[] = [];
  const absent: string[] = [];
  for (const [ours, spec] of Object.entries(specs)) {
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
  if (problems.length > 0) throw new Error(`The Notion ${kind} database changed shape: ${problems.join("; ")}.`);
  const read = new Set(Object.values(names));
  return {
    names,
    required: Object.entries(names)
      .filter(([, notionName]) => notionName.trim().startsWith("*"))
      .map(([ours]) => ours),
    unread: Object.keys(database.properties).filter((name) => !read.has(name)),
    absent,
  };
}

const value = (property: NotionProperty | undefined): string | null => {
  if (!property) return null;
  let text: string | null | undefined;
  switch (property.type) {
    case "title":
    case "rich_text":
      text = plainText(property);
      break;
    case "select":
      text = property.select?.name;
      break;
    case "email":
      text = property.email;
      break;
    case "url":
      text = property.url;
      break;
    case "phone_number":
      text = property.phone_number;
      break;
    case "date":
      // A date or a date-time: the calendar day as written in Notion.
      text = property.date?.start?.slice(0, 10);
      break;
  }
  return text?.trim() ? text.trim() : null;
};

export interface SourceRecordBase {
  pageId: string;
  createdTime: string;
  name: string;
  number: number | null;
  wiseRecipientId: string | null;
  email: string | null;
  website: string | null;
  /** null when the database has no Expertise property: expertise links are then left alone. */
  expertisePageIds: string[] | null;
  expensesCount: number;
  /** Our names of the starred properties that are empty on this record. */
  missingRequired: string[];
}

export interface SourceOrganization extends SourceRecordBase {
  kind: "organization";
  description: string | null;
  peoplePageIds: string[];
}

export interface SourcePerson extends SourceRecordBase {
  kind: "person";
  state: string | null;
  source: string | null;
  personalNote: string | null;
  doNotContact: boolean;
  phone: string | null;
  linkedin: string | null;
  x: string | null;
  otherContact: string | null;
  nextFollowupOn: string | null;
  organizationPageIds: string[];
  accessGrantsCount: number;
}

export interface DirectorySource {
  organizations: SourceOrganization[];
  people: SourcePerson[];
  layouts: { people: DatabaseLayout; organizations: DatabaseLayout };
}

/** Relation ids, fetched in full when Notion truncated the list. */
export type RelationReader = (pageId: string, property: NotionProperty) => Promise<string[]>;
const inlineRelation: RelationReader = async (_pageId, property) => (property.relation ?? []).map((relation) => relation.id);

function reader(page: NotionPage, layout: DatabaseLayout) {
  const get = (ours: string) => (layout.names[ours] ? page.properties[layout.names[ours]] : undefined);
  const text = (ours: string) => value(get(ours));
  const missingRequired = layout.required.filter((ours) => {
    const property = get(ours);
    if (!property) return true;
    if (property.type === "relation") return (property.relation ?? []).length === 0;
    if (property.type === "checkbox") return false;
    return value(property) === null;
  });
  return { get, text, missingRequired };
}

export async function toSourceOrganization(page: NotionPage, layout: DatabaseLayout, relations: RelationReader = inlineRelation): Promise<SourceOrganization> {
  const { get, text, missingRequired } = reader(page, layout);
  const relation = async (ours: string) => (get(ours) ? relations(page.id, get(ours)!) : null);
  return {
    kind: "organization",
    pageId: page.id,
    createdTime: page.created_time,
    name: text("Name") ?? "",
    number: get("Organization ID")?.unique_id?.number ?? null,
    description: text("Description"),
    website: text("Website"),
    email: text("Email"),
    wiseRecipientId: text("Wise recipient account ID"),
    peoplePageIds: (await relation("People")) ?? [],
    expertisePageIds: await relation("Expertise"),
    expensesCount: ((await relation("Expenses")) ?? []).length,
    missingRequired,
  };
}

export async function toSourcePerson(page: NotionPage, layout: DatabaseLayout, relations: RelationReader = inlineRelation): Promise<SourcePerson> {
  const { get, text, missingRequired } = reader(page, layout);
  const relation = async (ours: string) => (get(ours) ? relations(page.id, get(ours)!) : null);
  return {
    kind: "person",
    pageId: page.id,
    createdTime: page.created_time,
    name: text("Name") ?? "",
    number: get("Person ID")?.unique_id?.number ?? null,
    state: text("State"),
    source: text("Source"),
    personalNote: text("Personal note"),
    doNotContact: get("Do not contact")?.checkbox ?? false,
    email: text("Email"),
    phone: text("Phone"),
    website: text("Website"),
    linkedin: text("LinkedIn"),
    x: text("X"),
    otherContact: text("Other contact details"),
    wiseRecipientId: text("Wise recipient account ID"),
    nextFollowupOn: text("Follow-up date"),
    organizationPageIds: (await relation("Organizations")) ?? [],
    expertisePageIds: await relation("Expertise"),
    expensesCount: ((await relation("Expenses")) ?? []).length,
    accessGrantsCount: ((await relation("Access grants")) ?? []).length,
    missingRequired,
  };
}

export interface DirectoryDatabaseIds {
  people: string;
  organizations: string;
}

export async function readDirectory(client: NotionReader, ids: DirectoryDatabaseIds): Promise<DirectorySource> {
  const relations: RelationReader = async (pageId, property) =>
    property.has_more && property.id ? client.relationIds(pageId, property.id) : (property.relation ?? []).map((relation) => relation.id);
  const layouts = {
    organizations: layoutOf("organizations", await client.database(ids.organizations)),
    people: layoutOf("people", await client.database(ids.people)),
  };
  const live = (pages: NotionPage[]) => pages.filter((page) => !page.archived && !page.in_trash);
  const organizations: SourceOrganization[] = [];
  for (const page of live(await client.allPages(ids.organizations))) organizations.push(await toSourceOrganization(page, layouts.organizations, relations));
  const people: SourcePerson[] = [];
  for (const page of live(await client.allPages(ids.people))) people.push(await toSourcePerson(page, layouts.people, relations));
  return { organizations, people, layouts };
}
