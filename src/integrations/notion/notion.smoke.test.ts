import { describe, expect, it } from "vitest";
import { isNotionConfigured } from "@/shared/config/env";
import { getNotionClient } from "./client";
import { resolveDataSourceId } from "./resolveDataSourceId";
import { getNotionEnv } from "@/shared/config/env";

/**
 * Live Notion connectivity check — skipped entirely unless NOTION_API_KEY
 * and NOTION_DOCUMENTATION_DB_ID are set (e.g. in .env.local), so it never
 * runs in CI or for contributors without credentials, and never fails the
 * normal test suite. Run explicitly once credentials are configured:
 *
 *   npm test -- notion.smoke
 *
 * Never logs the token or any other secret value — only counts/booleans.
 * This is a test, not an API route: nothing here is reachable from a
 * browser or exposed in any production build.
 */
describe.skipIf(!isNotionConfigured())("Notion live connectivity (requires credentials)", () => {
  it("authenticates and resolves the Documentation database's data source", async () => {
    const notion = getNotionClient();
    const env = getNotionEnv();

    const database = await notion.databases.retrieve({ database_id: env.NOTION_DOCUMENTATION_DB_ID });
    expect(database.object).toBe("database");

    const dataSourceId = await resolveDataSourceId(env.NOTION_DOCUMENTATION_DB_ID);
    expect(typeof dataSourceId).toBe("string");
    expect(dataSourceId.length).toBeGreaterThan(0);
  });

  it("can query the Documentation database and finds at least one article", async () => {
    const notion = getNotionClient();
    const env = getNotionEnv();
    const dataSourceId = await resolveDataSourceId(env.NOTION_DOCUMENTATION_DB_ID);

    const response = await notion.dataSources.query({ data_source_id: dataSourceId });
    console.log(`Notion Documentation database: ${response.results.length} row(s) on first page.`);
    expect(response.results.length).toBeGreaterThan(0);
  });

  it("listPublishedArticles() returns real Notion data, not fixtures", async () => {
    const { listPublishedArticles } = await import(
      "@/modules/documentation/application/listPublishedArticles"
    );
    const articles = await listPublishedArticles();
    expect(articles.length).toBeGreaterThan(0);
    console.log(
      `listPublishedArticles(): ${articles.length} published article(s): ${articles.map((a) => a.slug).join(", ")}`,
    );
  });
});
