import { readFileSync } from "node:fs";
import type { AppConfig } from "../common/config/env.js";
import { readDirectory, type DirectorySource } from "./directory/directory-source.js";
import { NotionClient, type NotionDatabase, type NotionPage, type NotionReader } from "./notion/notion-client.js";
import { readTaxonomy, type TaxonomySource } from "./taxonomy/taxonomy-source.js";

export type ImportKind = "taxonomy" | "directory";
export const IMPORT_KINDS: readonly ImportKind[] = ["taxonomy", "directory"];

/** Where the admin import page reads from. Injected, so API tests never call Notion. */
export const IMPORT_SOURCE = Symbol("IMPORT_SOURCE");

export interface ImportSource {
  /** Why this kind of import can't run here (not configured), or undefined. */
  unavailable(kind: ImportKind): string | undefined;
  taxonomy(): Promise<TaxonomySource>;
  directory(): Promise<DirectorySource>;
}

const NEEDS: Record<ImportKind, (keyof AppConfig["notion"]["databases"])[]> = {
  taxonomy: ["domains", "fields", "expertise"],
  directory: ["people", "organizations"],
};
const VARIABLE: Record<keyof AppConfig["notion"]["databases"], string> = {
  domains: "NOTION_DOMAINS_DB_ID",
  fields: "NOTION_FIELDS_DB_ID",
  expertise: "NOTION_EXPERTISE_DB_ID",
  people: "NOTION_PEOPLE_DB_ID",
  organizations: "NOTION_ORGANIZATIONS_DB_ID",
};

/** The live source: the Notion API with the server's token (never sent to the browser). */
export function notionImportSource(config: AppConfig): ImportSource {
  const { token, databases } = config.notion;
  const unavailable = (kind: ImportKind) => {
    const missing = [...(token ? [] : ["NOTION_API_KEY"]), ...NEEDS[kind].filter((name) => !databases[name]).map((name) => VARIABLE[name])];
    return missing.length > 0 ? `Notion import isn't configured on the server (missing ${missing.join(", ")}).` : undefined;
  };
  const client = () => new NotionClient({ token: token! });
  return {
    unavailable,
    taxonomy: () => readTaxonomy(client(), { domains: databases.domains!, fields: databases.fields!, expertise: databases.expertise! }),
    directory: () => readDirectory(client(), { people: databases.people!, organizations: databases.organizations! }),
  };
}

/**
 * Tests only (NODE_ENV=test, enforced by the config): a JSON file shaped
 * like the Notion API — `{ "<database>": { "properties": {…}, "pages": […] } }`
 * for domains, fields, expertise, people, organizations — read through the
 * very same mapping code as Notion.
 */
export function fixtureImportSource(file: string): ImportSource {
  const load = () => JSON.parse(readFileSync(file, "utf8")) as Record<string, { properties: NotionDatabase["properties"]; pages: NotionPage[] }>;
  const reader = (): NotionReader => {
    const data = load();
    const database = (name: string) => {
      const entry = data[name];
      if (!entry) throw new Error(`The import fixture has no "${name}" database.`);
      return entry;
    };
    return {
      database: async (name) => ({ id: name, title: [], properties: database(name).properties }),
      allPages: async (name) => database(name).pages,
      relationIds: async (pageId, propertyId) => {
        for (const entry of Object.values(data)) {
          const page = entry.pages.find((candidate) => candidate.id === pageId);
          const property = page && Object.values(page.properties).find((candidate) => candidate.id === propertyId);
          if (property) return (property.relation ?? []).map((relation) => relation.id);
        }
        return [];
      },
    };
  };
  return {
    unavailable: () => undefined,
    taxonomy: () => readTaxonomy(reader(), { domains: "domains", fields: "fields", expertise: "expertise" }),
    directory: () => readDirectory(reader(), { people: "people", organizations: "organizations" }),
  };
}

export function createImportSource(config: AppConfig): ImportSource {
  return config.notion.fixtureFile ? fixtureImportSource(config.notion.fixtureFile) : notionImportSource(config);
}
