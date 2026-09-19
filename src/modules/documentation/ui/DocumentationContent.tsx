import type { DocumentationContentBlock } from "@/modules/documentation/domain/types";
import { RichText } from "@/shared/ui/RichText";
import { richTextToPlain } from "@/shared/content/types";

const headingClassName: Record<1 | 2 | 3 | 4, string> = {
  1: "text-lg font-bold leading-snug text-text-primary",
  2: "text-base font-bold leading-snug text-text-primary",
  3: "text-sm font-bold leading-snug text-text-primary",
  4: "text-sm font-bold leading-snug text-text-primary",
};

const headingTag = { 1: "h2", 2: "h3", 3: "h4", 4: "h5" } as const;

/**
 * Renders the shared editorial content model for an article. Only heading
 * and paragraph blocks exist in current content; `unsupported` blocks
 * render nothing (and are logged at fetch time) rather than crashing.
 *
 * Spacing is grouped: a heading sits close to the paragraph(s) that follow
 * it, with more room before the next heading. max-w-prose caps line length.
 * Headings start at h2 because NavHeader already renders the page's h1.
 */
export function DocumentationContent({ blocks }: { blocks: DocumentationContentBlock[] }) {
  return (
    <div className="max-w-prose">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const HeadingTag = headingTag[block.level];
          return (
            <HeadingTag
              key={index}
              className={`${headingClassName[block.level]} ${index === 0 ? "" : "mt-8"}`}
            >
              <RichText text={block.text} />
            </HeadingTag>
          );
        }
        if (block.kind === "paragraph") {
          if (richTextToPlain(block.text).trim() === "") return null; // Notion spacer paragraphs
          return (
            <p key={index} className="mt-3 text-sm leading-relaxed text-text-secondary first:mt-0">
              <RichText text={block.text} />
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
