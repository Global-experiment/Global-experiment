import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { getNotionClient } from "@/integrations/notion/client";
import { fetchPageContent } from "@/integrations/notion/fetchPageBlocks";
import { resolveDataSourceId } from "@/integrations/notion/resolveDataSourceId";
import { ProviderError } from "@/shared/errors/app-error";
import { getNotionEnv } from "@/shared/config/env";
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

async function fetchAllMappedPages(): Promise<MappedPage[]> {
  const notion = getNotionClient();
  const env = getNotionEnv();

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

export class NotionDocumentationRepository implements DocumentationRepository {
  async listPublished(): Promise<DocumentationArticleSummary[]> {
    const pages = await fetchAllMappedPages();
    return pages
      .map((entry) => entry.mapped)
      .filter(isPubliclyVisible)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(toArticleSummary);
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
}
