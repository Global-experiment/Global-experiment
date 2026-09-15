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
              className="underline hover:no-underline"
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
  1: "text-lg font-bold text-text-primary",
  2: "text-base font-bold text-text-primary",
  3: "text-sm font-bold text-text-primary",
};

/**
 * Renders the internal Documentation content model. Only heading and
 * paragraph blocks exist in current content; `unsupported` blocks (any
 * Notion block type not yet mapped) render nothing rather than crashing —
 * see modules/documentation/domain/types.ts.
 */
export function DocumentationContent({ blocks }: { blocks: DocumentationContentBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const HeadingTag = (`h${block.level + 1}` as unknown) as "h2" | "h3" | "h4";
          return (
            <HeadingTag key={index} className={headingClassName[block.level]}>
              <RichText text={block.text} />
            </HeadingTag>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={index} className="text-sm text-text-secondary">
              <RichText text={block.text} />
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
