import { plainText, type NotionDatabase, type NotionPage, type NotionReader } from "../notion/notion-client.js";

export type TaxonomyLevel = "domain" | "field" | "expertise";
export const LEVELS: readonly TaxonomyLevel[] = ["domain", "field", "expertise"];

/**
 * One Notion row, as read — nothing cleaned or validated yet (that's the
 * planner's job, taxonomy-plan.ts). Parents are Notion page ids from the
 * relation property: Field → Domain, Expertise → Field. The Expertise
 * database's own "Domain" relation is ignored: an item's domain is always
 * derived through its field.
 */
export interface SourceRow {
  level: TaxonomyLevel;
  pageId: string;
  createdTime: string;
  name: string;
  rawStableId: string;
  /** The Status option's name ("Active"), or null when empty. */
  status: string | null;
  parentPageIds: string[];
  /** Team option names (expertise only). */
  teams: string[];
}

export interface TaxonomySource {
  domains: SourceRow[];
  fields: SourceRow[];
  expertise: SourceRow[];
}

export interface TaxonomyDatabaseIds {
  domains: string;
  fields: string;
  expertise: string;
}

/** The Notion properties the importer reads, per database, with their expected types. */
export const EXPECTED_PROPERTIES: Record<TaxonomyLevel, Record<string, string>> = {
  domain: { Domain: "title", "Stable ID": "rich_text", Status: "select" },
  field: { Field: "title", "Stable ID": "rich_text", Status: "select", Domain: "relation" },
  expertise: { Expertise: "title", "Stable ID": "rich_text", Status: "select", Field: "relation", Team: "multi_select" },
};

const TITLE: Record<TaxonomyLevel, string> = { domain: "Domain", field: "Field", expertise: "Expertise" };
const PARENT: Record<TaxonomyLevel, string | undefined> = { domain: undefined, field: "Domain", expertise: "Field" };

/** Fails loudly (before anything is planned) if Notion's columns were renamed or retyped. */
export function assertSchema(level: TaxonomyLevel, database: Pick<NotionDatabase, "properties">) {
  const problems = Object.entries(EXPECTED_PROPERTIES[level])
    .filter(([name, type]) => database.properties[name]?.type !== type)
    .map(([name, type]) => `"${name}" should be ${type}, found ${database.properties[name]?.type ?? "nothing"}`);
  if (problems.length > 0) throw new Error(`The Notion ${level} database changed shape: ${problems.join("; ")}.`);
}

export function toSourceRow(level: TaxonomyLevel, page: NotionPage): SourceRow {
  const parent = PARENT[level];
  return {
    level,
    pageId: page.id,
    createdTime: page.created_time,
    name: plainText(page.properties[TITLE[level]]),
    rawStableId: plainText(page.properties["Stable ID"]),
    status: page.properties.Status?.select?.name ?? null,
    parentPageIds: parent ? (page.properties[parent]?.relation ?? []).map((relation) => relation.id) : [],
    teams: level === "expertise" ? (page.properties.Team?.multi_select ?? []).map((option) => option.name) : [],
  };
}

/** Reads the three databases (schema check first). Archived / trashed pages are not returned by Notion's query. */
export async function readTaxonomy(client: NotionReader, ids: TaxonomyDatabaseIds): Promise<TaxonomySource> {
  const read = async (level: TaxonomyLevel, databaseId: string) => {
    assertSchema(level, await client.database(databaseId));
    const pages = await client.allPages(databaseId);
    return pages.filter((page) => !page.archived && !page.in_trash).map((page) => toSourceRow(level, page));
  };
  return {
    domains: await read("domain", ids.domains),
    fields: await read("field", ids.fields),
    expertise: await read("expertise", ids.expertise),
  };
}
