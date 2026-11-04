import type { DocumentationContentBlock } from "@/modules/documentation/domain/types";
import { isVisibleBlock } from "@/shared/content/types";
import { ImageBlock, ListBlock, type ImageSource } from "@/shared/ui/ContentBlocks";
import { RichText } from "@/shared/ui/RichText";

const headingTag = { 1: "h2", 2: "h3", 3: "h4", 4: "h5" } as const;

/**
 * Article body in the Figma rhythm (figma.pdf p15): every heading and
 * paragraph is 14px on an 18px line; headings are bold, sit 16px below the
 * previous block and 4px above their own text; consecutive blocks are
 * separated by one blank line (18px). All heading levels share one size —
 * the hierarchy is kept in the markup (h2–h5) only. Lists and images follow
 * the same rhythm.
 *
 * Headings start at h2 because the page's h1 is the header title. Callers
 * may pass `headingLevelOffset` when the body sits under an h2 (index rows).
 */
export function DocumentationContent({
  blocks,
  headingLevelOffset = 0,
  highlight,
  imageSource,
}: {
  blocks: DocumentationContentBlock[];
  headingLevelOffset?: 0 | 1;
  /** Search query to mark in the body (index search). */
  highlight?: string;
  /** The admin shows drafts and older versions, whose images aren't public yet. */
  imageSource?: ImageSource;
}) {
  const visible = blocks.filter(isVisibleBlock);

  return (
    <div className="text-body text-text-primary">
      {visible.map((block, index) => {
        const previous = visible[index - 1];
        if (block.kind === "heading") {
          const level = Math.min(4, block.level + headingLevelOffset) as 1 | 2 | 3 | 4;
          const HeadingTag = headingTag[level];
          return (
            <HeadingTag key={index} className={`font-bold ${index === 0 ? "" : "mt-4"}`}>
              <RichText text={block.text} highlight={highlight} />
            </HeadingTag>
          );
        }
        const spacing = index === 0 ? "" : previous?.kind === "heading" ? "mt-1" : "mt-paragraph";
        if (block.kind === "list") return <ListBlock key={index} block={block} highlight={highlight} className={spacing} />;
        if (block.kind === "image") return <ImageBlock key={index} block={block} source={imageSource} className={spacing} />;
        return (
          <p key={index} className={spacing}>
            <RichText text={block.text} highlight={highlight} />
          </p>
        );
      })}
    </div>
  );
}
