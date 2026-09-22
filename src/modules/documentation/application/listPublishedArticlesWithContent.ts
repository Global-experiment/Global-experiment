import { getDocumentationRepository } from "@/modules/documentation/infrastructure/getDocumentationRepository";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";

/**
 * Every published article with its full body preloaded — powers the
 * Documentation index's instant accordion expansion and full-text search
 * (client feedback items 15–16). Read fresh from Notion on every request,
 * same as `listPublishedArticles`; nothing is cached between requests.
 */
export function listPublishedArticlesWithContent(): Promise<DocumentationArticle[]> {
  return getDocumentationRepository().listPublishedWithContent();
}
