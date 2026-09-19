import type { ContentBlock, RichText } from "@/shared/content/types";

/**
 * Application-owned Documentation types. Nothing outside
 * `modules/documentation/infrastructure/` or `integrations/notion/` may
 * import a Notion SDK type or reference a Notion property name — see
 * docs/architecture/decisions/003-notion-temporary-adapter.md.
 *
 * Body content uses the shared editorial content model
 * (src/shared/content/types.ts), which Home also uses.
 */

export type DocumentationRichText = RichText;
export type DocumentationContentBlock = ContentBlock;

export interface DocumentationArticleSummary {
  slug: string;
  title: string;
  displayOrder: number;
  expertise: string[];
  publishedAt: Date;
}

export interface DocumentationArticle extends DocumentationArticleSummary {
  content: DocumentationContentBlock[];
}
