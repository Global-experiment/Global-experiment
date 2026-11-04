import type { ContentBlock } from "@/shared/content/types";
import { blockToPlain, isVisibleBlock } from "@/shared/content/types";

export type ComparedBlock = { block: ContentBlock; change: "same" | "added" | "removed" };

const key = (block: ContentBlock) =>
  `${block.kind}:${block.kind === "heading" ? block.level : block.kind === "list" ? block.ordered : ""}:${block.kind === "image" ? block.imageId : ""}:${blockToPlain(block)}`;

/**
 * One version compared with another, block by block (longest common
 * subsequence): the whole page in order, each block marked as unchanged,
 * added in `next`, or removed from `base` (Versions page, OPS-28).
 */
export function compareBlocks(base: readonly ContentBlock[], next: readonly ContentBlock[]): ComparedBlock[] {
  const a = base.filter(isVisibleBlock);
  const b = next.filter(isVisibleBlock);
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i]![j] = key(a[i]!) === key(b[j]!) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const out: ComparedBlock[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]!) === key(b[j]!)) {
      out.push({ block: b[j]!, change: "same" });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) out.push({ block: a[i++]!, change: "removed" });
    else out.push({ block: b[j++]!, change: "added" });
  }
  for (; i < a.length; i++) out.push({ block: a[i]!, change: "removed" });
  for (; j < b.length; j++) out.push({ block: b[j]!, change: "added" });
  return out;
}
