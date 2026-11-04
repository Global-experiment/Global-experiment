/**
 * Application-owned editorial content model, shared by Home and
 * Documentation. Since Delivery 6 the content is native (ADR 020): the API
 * stores these blocks (apps/api/src/cms/content.ts has the same shapes and
 * checks every save), the admin's editor produces them, and the website
 * renders them with React text nodes — never HTML.
 *
 * Blocks: headings 1–4, paragraphs, bulleted and numbered lists, images.
 * Text is plain runs and links; bold, italic and colors don't exist here, so
 * the Figma typography can't be restyled from the editor.
 */

export type RichText = { kind: "text"; value: string } | { kind: "link"; value: string; href: string };

export type ContentBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: RichText[] }
  | { kind: "paragraph"; text: RichText[] }
  | { kind: "list"; ordered: boolean; items: RichText[][] }
  | { kind: "image"; imageId: string; alt: string };

export function richTextToPlain(text: RichText[]): string {
  return text.map((item) => item.value).join("");
}

/** The words of a block (search, history): a list's items, an image's description. */
export function blockToPlain(block: ContentBlock): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return richTextToPlain(block.text);
    case "list":
      return block.items.map(richTextToPlain).join(" ");
    case "image":
      return block.alt;
  }
}

/** An empty paragraph is spacing, not content. */
export const isVisibleBlock = (block: ContentBlock) => block.kind !== "paragraph" || richTextToPlain(block.text).trim() !== "";
