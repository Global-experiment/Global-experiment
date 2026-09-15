import { getNotionClient } from "./client";
import { ProviderError } from "@/shared/errors/app-error";

const cache = new Map<string, string>();

/**
 * The Notion API (2025-09-03+) separates a database from its data
 * source(s) — querying rows requires a data_source_id, not the database ID
 * visible in a Notion URL. Ordinary databases (including ours) have exactly
 * one data source; this resolves and caches it once per database ID so
 * callers can keep using the database ID everyone actually copies from
 * Notion's UI.
 */
export async function resolveDataSourceId(databaseId: string): Promise<string> {
  const cached = cache.get(databaseId);
  if (cached) return cached;

  const notion = getNotionClient();
  let database;
  try {
    database = await notion.databases.retrieve({ database_id: databaseId });
  } catch (cause) {
    throw new ProviderError("Failed to resolve the Notion database's data source.", { cause });
  }

  const dataSourceId = "data_sources" in database ? database.data_sources[0]?.id : undefined;
  if (!dataSourceId) {
    throw new ProviderError(`Notion database ${databaseId} has no data source.`);
  }

  cache.set(databaseId, dataSourceId);
  return dataSourceId;
}
