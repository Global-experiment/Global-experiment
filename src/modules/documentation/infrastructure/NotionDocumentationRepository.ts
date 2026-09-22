import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { getNotionClient } from "@/integrations/notion/client";
import { fetchPageContent } from "@/integrations/notion/fetchPageBlocks";
import { resolveDataSourceId } from "@/integrations/notion/resolveDataSourceId";
import { ProviderError } from "@/shared/errors/app-error";
import { getNotionDocumentationEnv } from "@/shared/config/env";
import { mapWithConcurrency } from "@/shared/async/mapWithConcurrency";
import type { DocumentationRepository } from "@/modules/documentation/domain/DocumentationRepository";
import type { DocumentationArticle, DocumentationArticleSummary } from "@/modules/documentation/domain/types";
import {
  isPubliclyVisible,
  mapNotionPageProperties,
  toArticleSummary,
  type MappedNotionPage,
} from "./notionPropertyMapper";

interface MappedPage {
  pageId: string;
  mapped: MappedNotionPage;
}

// Notion's own guidance is an average of ~3 requests/second; this bounds
// how many article bodies are fetched in flight at once when preloading
// every article for instant expansion + full-text search (client feedback
// items 15–16), instead of firing one request per article simultaneously.
const CONTENT_FETCH_CONCURRENCY = 3;

async function fetchAllMappedPages(): Promise<MappedPage[]> {
  const notion = getNotionClient();
  const env = getNotionDocumentationEnv();

  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;

  try {
    const dataSourceId = await resolveDataSourceId(env.NOTION_DOCUMENTATION_DB_ID);
    do {
      const response = await notion.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
      });
      pages.push(...(response.results as PageObjectResponse[]));
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
  } catch (cause) {
    throw new ProviderError("Failed to fetch the Documentation database from Notion.", { cause });
  }

  const mappedPages: MappedPage[] = [];
  for (const page of pages) {
    const mapped = mapNotionPageProperties(page);
    if (mapped) mappedPages.push({ pageId: page.id, mapped });
  }
  return mappedPages;
}

function publishedInOrder(pages: MappedPage[]): MappedPage[] {
  return pages
    .filter((entry) => isPubliclyVisible(entry.mapped))
    .sort((a, b) => a.mapped.displayOrder - b.mapped.displayOrder);
}

export class NotionDocumentationRepository implements DocumentationRepository {
  async listPublished(): Promise<DocumentationArticleSummary[]> {
    const pages = await fetchAllMappedPages();
    return publishedInOrder(pages).map((entry) => toArticleSummary(entry.mapped));
  }

  async getBySlug(slug: string): Promise<DocumentationArticle | null> {
    const pages = await fetchAllMappedPages();
    const match = pages.find((entry) => entry.mapped.slug === slug);

    if (!match || !isPubliclyVisible(match.mapped)) {
      return null;
    }

    const content = await fetchPageContent(match.pageId);

    return { ...toArticleSummary(match.mapped), content };
  }

  async listPublishedWithContent(): Promise<DocumentationArticle[]> {
    const pages = await fetchAllMappedPages();
    const ordered = publishedInOrder(pages);

    return mapWithConcurrency(ordered, CONTENT_FETCH_CONCURRENCY, async (entry) => {
      const content = await fetchPageContent(entry.pageId);
      return { ...toArticleSummary(entry.mapped), content };
    });
  }
}
