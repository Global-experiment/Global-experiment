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
}
