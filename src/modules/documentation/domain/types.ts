/**
 * Application-owned Documentation types. Nothing outside
 * `modules/documentation/infrastructure/` or `integrations/notion/` may
 * import a Notion SDK type or reference a Notion property name — see
 * docs/architecture/decisions/003-notion-temporary-adapter.md.
 *
 * Content block coverage is intentionally limited to what the actual
 * Documentation content uses today (heading/paragraph/rich text with
 * links) — see the Notion export audit. `unsupported` is a safe fallback
 * for any Notion block type not yet handled, so an editor adding a new
 * block type (list, quote, code, image, ...) degrades gracefully instead
 * of crashing the page; support for those types is added when real
 * content actually needs them, not speculatively now.
 */

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

export type DocumentationRichText =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

export type DocumentationContentBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: DocumentationRichText[] }
  | { kind: "paragraph"; text: DocumentationRichText[] }
  | { kind: "unsupported" };
