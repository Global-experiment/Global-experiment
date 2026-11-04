import type { HomeContent, HomeSectionBlock } from "@/modules/home/domain/types";
import { ImageBlock, ListBlock, type ImageSource } from "@/shared/ui/ContentBlocks";
import { RichText } from "@/shared/ui/RichText";

/**
 * Presents the content inside the Figma-defined structure (figma.pdf p1):
 * a bold 14px label, then per section a bold 14px heading with its blocks
 * 4px below, blocks separated by one 18px line, sections separated by 16px.
 * Only the words (and images) come from the content; sizes, weights, colors
 * and spacing are fixed here.
 */
export function HomeSections({ content, imageSource }: { content: Pick<HomeContent, "sectionLabel" | "sections">; imageSource?: ImageSource }) {
  return (
    <div className="text-body text-text-primary">
      {content.sectionLabel ? (
        <h2 className="font-bold">
          <RichText text={content.sectionLabel} />
        </h2>
      ) : null}

      <div className={`flex flex-col gap-4 ${content.sectionLabel ? "mt-3" : ""}`}>
        {content.sections.map((section, index) => (
          <section key={index}>
            {section.heading ? (
              <h3 className="font-bold">
                <RichText text={section.heading} />
              </h3>
            ) : null}
            {section.blocks.map((block, blockIndex) => (
              <SectionBlock
                key={blockIndex}
                block={block}
                className={blockIndex === 0 ? (section.heading ? "mt-1" : "") : "mt-paragraph"}
                imageSource={imageSource}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function SectionBlock({ block, className, imageSource }: { block: HomeSectionBlock; className: string; imageSource?: ImageSource }) {
  if (block.kind === "list") return <ListBlock block={block} className={className} />;
  if (block.kind === "image") return <ImageBlock block={block} source={imageSource} className={className} />;
  return (
    <p className={className}>
      <RichText text={block.text} />
    </p>
  );
}
