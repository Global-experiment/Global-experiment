import type { DocumentationArticle, DocumentationArticleSummary } from "./types";

/**
 * The native API since Delivery 6 (ADR 020): infrastructure/getDocumentationRepository.ts.
 * An article's published versions (the public Document history) come from
 * the API directly (fetchCmsVersions), not through this interface.
 */
export interface DocumentationRepository {
  listPublished(): Promise<DocumentationArticleSummary[]>;
  getBySlug(slug: string): Promise<DocumentationArticle | null>;
  /**
   * Every published article with its full body already loaded, ordered
   * like `listPublished()`. Lets the Documentation index expand any row
   * instantly and search full article text client-side, with no per-row
   * fetch (client feedback items 15–16) — at the cost of always fetching
   * every body up front. Only sensible while the article count is small
   * (currently 10): the API returns them in one cached response.
   */
  listPublishedWithContent(): Promise<DocumentationArticle[]>;
}
