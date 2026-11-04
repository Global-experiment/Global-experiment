import type { ContentBlock } from "@/shared/content/types";
import { isVisibleBlock } from "@/shared/content/types";
import { ProviderError } from "@/shared/errors/app-error";
import type { HomeContent, HomeSection } from "@/modules/home/domain/types";

/**
 * Maps the Home page's blocks into the fixed structure the Figma layout
 * expects. Structure comes from block order and heading level, never from
 * formatting:
 *
 *  - tagline: the first heading-4 (or, failing that, the first paragraph)
 *    before any section has started;
 *  - section label: the first heading-1/2 (only while no section has begun);
 *  - sections: each further heading starts a section; paragraphs, lists and
 *    images belong to the most recent section.
 *
 * Empty paragraphs are skipped. A page with no tagline is rejected rather
 * than rendered incomplete.
 */
export function mapHomeBlocks(blocks: ContentBlock[]): HomeContent {
  let tagline: HomeContent["tagline"] | null = null;
  let sectionLabel: HomeContent["sectionLabel"] = null;
  const sections: HomeSection[] = [];
  let current: HomeSection | null = null;

  for (const block of blocks) {
    if (!isVisibleBlock(block)) continue;
    if (block.kind === "heading") {
      if (block.text.every((run) => run.value.trim() === "")) continue;
      if (block.level === 4 && !tagline && sections.length === 0) {
        tagline = block.text;
      } else if ((block.level === 1 || block.level === 2) && !sectionLabel && sections.length === 0) {
        sectionLabel = block.text;
      } else {
        current = { heading: block.text, blocks: [] };
        sections.push(current);
      }
      continue;
    }
    if (current) {
      current.blocks.push(block);
    } else if (!tagline && block.kind === "paragraph") {
      tagline = block.text;
    } else {
      current = { heading: null, blocks: [block] };
      sections.push(current);
    }
  }

  if (!tagline) {
    throw new ProviderError("The Home page content has no tagline; refusing to render an incomplete page.");
  }

  return { tagline, sectionLabel, sections };
}
