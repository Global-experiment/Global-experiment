import type { DocumentationArticle, DocumentationArticleSummary } from "./types";

/**
 * v0.1 implementation: NotionDocumentationRepository (infrastructure/).
 * Future v1 implementation: a Postgres-backed repository, same interface —
 * see docs/architecture/decisions/003-notion-temporary-adapter.md.
 *
 * getHistory() is deliberately not part of this interface: neither the
 * Notion export nor the public Notion API exposes real page-revision data,
 * so the Figma "Document History" screen has no real data source yet. Not
 * added speculatively — see docs/architecture/overview.md open decisions.
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
   * (currently 10); see NotionDocumentationRepository for the concurrency
   * strategy this uses against Notion's API.
   */
  listPublishedWithContent(): Promise<DocumentationArticle[]>;
}
