import type { DocumentationContentBlock } from "@/modules/documentation/domain/types";
import { RichText } from "@/shared/ui/RichText";
import { richTextToPlain } from "@/shared/content/types";

const headingTag = { 1: "h2", 2: "h3", 3: "h4", 4: "h5" } as const;

/**
 * Article body in the Figma rhythm (figma.pdf p15): every heading and
 * paragraph is 14px on an 18px line; headings are bold, sit 16px below the
 * previous paragraph and 4px above their own text; consecutive paragraphs
 * are separated by one blank line (18px). All heading levels share one
 * size — the source hierarchy is preserved in the markup (h2–h5) only.
 *
 * Only heading and paragraph blocks exist in current content; `unsupported`
 * blocks render nothing (they are logged at fetch time) rather than crashing.
 * Headings start at h2 because the page's h1 is the header title. Callers
 * may pass `headingLevelOffset` when the body sits under an h2 (index rows).
 */
export function DocumentationContent({
  blocks,
  headingLevelOffset = 0,
}: {
  blocks: DocumentationContentBlock[];
  headingLevelOffset?: 0 | 1;
}) {
  const visible = blocks.filter(
    (block) =>
      block.kind === "heading" || (block.kind === "paragraph" && richTextToPlain(block.text).trim() !== ""),
  );

  return (
    <div className="text-body text-text-primary">
      {visible.map((block, index) => {
        const previous = visible[index - 1];
        if (block.kind === "heading") {
          const level = Math.min(4, block.level + headingLevelOffset) as 1 | 2 | 3 | 4;
          const HeadingTag = headingTag[level];
          return (
            <HeadingTag key={index} className={`font-bold ${index === 0 ? "" : "mt-4"}`}>
              <RichText text={block.text} />
            </HeadingTag>
          );
        }
        if (block.kind === "paragraph") {
          const spacing = index === 0 ? "" : previous?.kind === "heading" ? "mt-1" : "mt-[1.125rem]";
          return (
            <p key={index} className={spacing}>
              <RichText text={block.text} />
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
