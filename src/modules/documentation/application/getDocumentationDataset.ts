import { getDocumentationRepository } from "@/modules/documentation/infrastructure/getDocumentationRepository";
import type { DocumentationArticle, DocumentationArticleSummary } from "@/modules/documentation/domain/types";

/**
 * The one place the Documentation UI's data comes from: every published
 * article with its full body, tags and dates — everything the index, search,
 * accordion expansion, the article route and its history need. The API
 * request behind it is cached by the website under the `documentation` tag
 * (src/shared/config/publicApi.ts) and revalidated whenever an article is
 * published, unpublished, archived or restored; within one render both
 * functions below share that one cached response.
 */
export function getDocumentationDataset(): Promise<DocumentationArticle[]> {
  return getDocumentationRepository().listPublishedWithContent();
}

/** Metadata only (title, slug, order, tags, dates) — the rows of the index, rendered before the bodies stream in. */
export function getDocumentationSummaries(): Promise<DocumentationArticleSummary[]> {
  return getDocumentationRepository().listPublished();
}
