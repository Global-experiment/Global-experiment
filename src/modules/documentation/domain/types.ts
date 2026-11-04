import type { ContentBlock, RichText } from "@/shared/content/types";

/**
 * Application-owned Documentation types, filled from the native API
 * (ADR 020) by modules/documentation/infrastructure/.
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
  /** When the source page was last edited — shown in the article's page-actions sheet (figma.pdf p18). */
  updatedAt: Date;
}

export interface DocumentationArticle extends DocumentationArticleSummary {
  content: DocumentationContentBlock[];
}
