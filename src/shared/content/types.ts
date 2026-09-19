/**
 * Application-owned editorial content model, shared by every CMS-backed
 * module (Home, Documentation). Nothing here knows about Notion — the
 * Notion adapter (src/integrations/notion) maps into these types.
 *
 * Coverage is limited to block types the live content actually uses
 * (headings 1-4, paragraphs, text/link rich text; heading 4 is used by the
 * live Home page for its tagline). `unsupported` carries
 * the source block type name purely for diagnostics: an editor adding a
 * list/quote/image/etc. degrades gracefully (rendered as nothing, logged)
 * instead of crashing a page or silently pretending it was rendered.
 */

export type RichText =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

export type ContentBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: RichText[] }
  | { kind: "paragraph"; text: RichText[] }
  | { kind: "unsupported"; type: string };

export function richTextToPlain(text: RichText[]): string {
  return text.map((item) => item.value).join("");
}
