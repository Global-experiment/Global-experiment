import type { HomeContent } from "@/modules/home/domain/types";
import { RichText } from "@/shared/ui/RichText";

/**
 * Presents the CMS text inside the Figma-defined structure (figma.pdf p1):
 * a bold 14px label, then per section a bold 14px heading with its
 * paragraphs 4px below, paragraphs separated by one 18px line, sections
 * separated by 16px. Only the words come from the CMS; sizes, weights,
 * colors and spacing are fixed here.
 */
export function HomeSections({ content }: { content: Pick<HomeContent, "sectionLabel" | "sections"> }) {
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
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p
                key={paragraphIndex}
                className={paragraphIndex === 0 ? (section.heading ? "mt-1" : "") : "mt-[1.125rem]"}
              >
                <RichText text={paragraph} />
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
