import type { JSONContent } from "@tiptap/core";
import type { ContentBlock, RichText } from "@/shared/content/types";
import { isSafeHref } from "@/shared/content/safeHref";

/**
 * Our content blocks ⇄ the editor's document (Tiptap/ProseMirror JSON) —
 * the only place that knows the editor's format (ADR 019). The API stores
 * and checks the blocks; the editor only ever sees this conversion.
 */

export const adminImageSrc = (imageId: string) => `/api/admin/cms/images/${imageId}`;

function inline(text: RichText[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const run of text) {
    // Line breaks inside a block are hard breaks in the editor.
    run.value.split("\n").forEach((part, index) => {
      if (index > 0) out.push({ type: "hardBreak" });
      if (part === "") return;
      out.push(run.kind === "link" ? { type: "text", text: part, marks: [{ type: "link", attrs: { href: run.href } }] } : { type: "text", text: part });
    });
  }
  return out;
}

export function blocksToDoc(blocks: readonly ContentBlock[]): JSONContent {
  const content: JSONContent[] = blocks.map((block) => {
    switch (block.kind) {
      case "heading":
        return { type: "heading", attrs: { level: block.level }, content: inline(block.text) };
      case "paragraph":
        return { type: "paragraph", content: inline(block.text) };
      case "list":
        return {
          type: block.ordered ? "orderedList" : "bulletList",
          content: block.items.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: inline(item) }] })),
        };
      case "image":
        return { type: "image", attrs: { src: adminImageSrc(block.imageId), alt: block.alt, imageId: block.imageId } };
    }
  });
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

/** Inline nodes → runs: links kept (when safe), neighbouring runs of the same link merged, hard breaks as "\n". */
function runs(nodes: readonly JSONContent[] = []): RichText[] {
  const out: RichText[] = [];
  const push = (run: RichText) => {
    const last = out.at(-1);
    if (last && last.kind === run.kind && (last.kind === "text" || (run.kind === "link" && last.href === run.href))) last.value += run.value;
    else out.push(run);
  };
  for (const node of nodes) {
    if (node.type === "hardBreak") push({ kind: "text", value: "\n" });
    if (node.type !== "text" || !node.text) continue;
    const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href as string | undefined;
    push(href && isSafeHref(href) ? { kind: "link", value: node.text, href } : { kind: "text", value: node.text });
  }
  return out;
}

/** A list item's text: its paragraphs joined by line breaks; nested lists become items of their own, one level up. */
function listItems(list: JSONContent): RichText[][] {
  const items: RichText[][] = [];
  for (const item of list.content ?? []) {
    const own: RichText[] = [];
    const nested: RichText[][] = [];
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") nested.push(...listItems(child));
      else {
        if (own.length > 0) own.push({ kind: "text", value: "\n" });
        own.push(...runs(child.content));
      }
    }
    items.push(own, ...nested);
  }
  return items;
}

export function docToBlocks(doc: JSONContent): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "heading") {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 1))) as 1 | 2 | 3 | 4;
      blocks.push({ kind: "heading", level, text: runs(node.content) });
    } else if (node.type === "paragraph") blocks.push({ kind: "paragraph", text: runs(node.content) });
    else if (node.type === "bulletList" || node.type === "orderedList") {
      const items = listItems(node);
      if (items.length > 0) blocks.push({ kind: "list", ordered: node.type === "orderedList", items });
    } else if (node.type === "image" && typeof node.attrs?.imageId === "string")
      blocks.push({ kind: "image", imageId: node.attrs.imageId, alt: String(node.attrs.alt ?? "") });
  }
  // Trailing empty paragraphs are the editor's cursor room, not content.
  while (blocks.length > 0) {
    const last = blocks.at(-1)!;
    if (last.kind === "paragraph" && last.text.every((run) => run.value.trim() === "")) blocks.pop();
    else break;
  }
  return blocks;
}

/** Same content? (dirty check: the editor's round trip may differ only in empty trailing paragraphs). */
export const sameBlocks = (a: readonly ContentBlock[], b: readonly ContentBlock[]) =>
  JSON.stringify(docToBlocks(blocksToDoc(a))) === JSON.stringify(docToBlocks(blocksToDoc(b)));
