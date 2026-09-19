import type { HomeContent } from "@/modules/home/domain/types";
import { RichText } from "@/shared/ui/RichText";

/**
 * Presents the CMS text inside the Figma-defined structure: a section
 * label, then heading + paragraphs per section. Only the words come from
 * the CMS; sizes, weights, colors and spacing are fixed here.
 */
export function HomeSections({ content }: { content: Pick<HomeContent, "sectionLabel" | "sections"> }) {
  return (
    <>
      {content.sectionLabel ? (
        <h2 className="text-sm font-bold text-text-primary">
          <RichText text={content.sectionLabel} />
        </h2>
      ) : null}

      <div className="mt-6 flex flex-col gap-6">
        {content.sections.map((section, index) => (
          <section key={index}>
            {section.heading ? (
              <h3 className="text-sm font-bold text-text-primary">
                <RichText text={section.heading} />
              </h3>
            ) : null}
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className="mt-2 text-sm text-text-secondary">
                <RichText text={paragraph} />
              </p>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
