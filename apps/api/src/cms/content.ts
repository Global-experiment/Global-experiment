import { z } from "zod";

/**
 * The content of a Home or Documentation revision (ADR 019): a list of
 * blocks, stored as JSON — never HTML. The editor in the admin produces it,
 * this schema checks every save, and the website renders it with React
 * text nodes, so no markup from an editor ever reaches a page. Links are
 * limited to http(s), mailto, the site's own paths and anchors: no
 * `javascript:`, `data:` or other scheme can be stored.
 *
 * The web app has the same shapes (src/shared/content/types.ts).
 */

export const CONTENT_LIMITS = {
  blocks: 600,
  /** Characters in one text run, and in a whole revision. */
  run: 20_000,
  total: 300_000,
  listItems: 500,
  href: 2_000,
  alt: 300,
} as const;

/** Control characters other than tab and newline are dropped (PostgreSQL's jsonb refuses \u0000). */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const cleanText = (value: string) => value.replace(CONTROL, "");

/**
 * Whether a link may be stored and rendered: `https://…`, `http://…`,
 * `mailto:…`, a path of this site (`/documentation/x`, not `//host`) or an
 * anchor (`#x`). Nothing with spaces, control characters or backslashes.
 */
export function isSafeHref(href: string): boolean {
  if (href.length === 0 || href.length > CONTENT_LIMITS.href) return false;

  if (/[\s\u0000-\u001f\u007f\\]/.test(href)) return false;
  if (href.startsWith("#")) return href.length > 1;
  if (href.startsWith("/")) return !href.startsWith("//");
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol === "mailto:") return url.pathname.includes("@");
  return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
}

const TextRun = z.strictObject({ kind: z.literal("text"), value: z.string().max(CONTENT_LIMITS.run).transform(cleanText) });
const LinkRun = z.strictObject({
  kind: z.literal("link"),
  value: z.string().min(1).max(CONTENT_LIMITS.run).transform(cleanText),
  href: z.string().trim().refine(isSafeHref, "Links can only go to https://, http://, mailto: or a page of this site."),
});
export const RichText = z.array(z.discriminatedUnion("kind", [TextRun, LinkRun])).max(2_000);
export type RichText = z.output<typeof RichText>;

export const ContentBlock = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), text: RichText }),
  z.strictObject({ kind: z.literal("paragraph"), text: RichText }),
  z.strictObject({ kind: z.literal("list"), ordered: z.boolean(), items: z.array(RichText).min(1).max(CONTENT_LIMITS.listItems) }),
  z.strictObject({ kind: z.literal("image"), imageId: z.uuid(), alt: z.string().max(CONTENT_LIMITS.alt).transform(cleanText).default("") }),
]);
export type ContentBlock = z.output<typeof ContentBlock>;

export const Content = z
  .array(ContentBlock)
  .max(CONTENT_LIMITS.blocks, `A page can have at most ${CONTENT_LIMITS.blocks} blocks.`)
  .superRefine((blocks, context) => {
    if (plainText(blocks).length > CONTENT_LIMITS.total) context.addIssue({ code: "custom", message: "This page is too long." });
  });

const runs = (text: RichText) => text.map((run) => run.value).join("");

/** The words of a block, as one line (search, history, diffs). Images count by their description. */
export function blockText(block: ContentBlock): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return runs(block.text);
    case "list":
      return block.items.map(runs).join("\n");
    case "image":
      return block.alt;
  }
}

export function plainText(blocks: readonly ContentBlock[]): string {
  return blocks.map(blockText).join("\n");
}

export function imageIds(blocks: readonly ContentBlock[]): string[] {
  return [...new Set(blocks.flatMap((block) => (block.kind === "image" ? [block.imageId] : [])))];
}

/** One line of a content change in the history: what kind of block, and its text. */
export interface ContentLine {
  id: string;
  label: string;
}

/** A block as a history line: `id` says how to show it (h1–h4, p, ul, ol, img), `label` is its text. */
function lineOf(block: ContentBlock, index: number): ContentLine {
  const style = block.kind === "heading" ? `h${block.level}` : block.kind === "paragraph" ? "p" : block.kind === "list" ? (block.ordered ? "ol" : "ul") : "img";
  return { id: `${style}:${index}`, label: block.kind === "image" ? block.alt || "Image" : blockText(block) };
}

const keyOf = (line: ContentLine) => `${line.id.split(":")[0]}\u0001${line.label}`;

/**
 * What changed between two versions, block by block (longest common
 * subsequence): the blocks removed and the blocks added, for the history's
 * "Content" change (old struck through → new). Empty blocks are ignored.
 */
export function diffContent(before: readonly ContentBlock[], after: readonly ContentBlock[]): { removed: ContentLine[]; added: ContentLine[] } {
  const a = before.map(lineOf).filter((line) => line.label.trim() !== "" || line.id.startsWith("img"));
  const b = after.map(lineOf).filter((line) => line.label.trim() !== "" || line.id.startsWith("img"));
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i]![j] = keyOf(a[i]!) === keyOf(b[j]!) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const removed: ContentLine[] = [];
  const added: ContentLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (keyOf(a[i]!) === keyOf(b[j]!)) {
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) removed.push(a[i++]!);
    else added.push(b[j++]!);
  }
  removed.push(...a.slice(i));
  added.push(...b.slice(j));
  return { removed, added };
}
