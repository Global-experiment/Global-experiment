import type { DocumentationContentBlock, DocumentationRichText } from "@/modules/documentation/domain/types";

function RichText({ text }: { text: DocumentationRichText[] }) {
  return (
    <>
      {text.map((item, index) => {
        if (item.kind === "link") {
          const isInternal = item.href.startsWith("/") || item.href.includes("globalexperiment.org");
          return (
            <a
              key={index}
              href={item.href}
              className="underline decoration-border-subtle underline-offset-2 hover:decoration-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              {...(isInternal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
            >
              {item.value}
            </a>
          );
        }
        return <span key={index}>{item.value}</span>;
      })}
    </>
  );
}

const headingClassName: Record<1 | 2 | 3, string> = {
  1: "text-lg font-bold leading-snug text-text-primary",
  2: "text-base font-bold leading-snug text-text-primary",
  3: "text-sm font-bold leading-snug text-text-primary",
};

/**
 * Renders the internal Documentation content model. Only heading and
 * paragraph blocks exist in current content; `unsupported` blocks (any
 * Notion block type not yet mapped) render nothing rather than crashing —
 * see modules/documentation/domain/types.ts.
 *
 * Spacing is grouped rather than uniform: a heading sits close to the
 * paragraph(s) that follow it, with more room before the next heading —
 * matching how the source content actually reads (short "subsection"
 * groups), not a flat list of evenly-spaced blocks. max-w-prose caps line
 * length at a readable measure independent of the page's wider container.
 */
export function DocumentationContent({ blocks }: { blocks: DocumentationContentBlock[] }) {
  return (
    <div className="max-w-prose">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const HeadingTag = (`h${block.level + 1}` as unknown) as "h2" | "h3" | "h4";
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
