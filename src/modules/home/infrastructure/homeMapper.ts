import type { ContentBlock } from "@/shared/content/types";
import { richTextToPlain } from "@/shared/content/types";
import { ProviderError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logging/logger";
import type { HomeContent, HomeSection } from "@/modules/home/domain/types";

/**
 * Maps the Home page's editorial blocks into the fixed structure the
 * Figma layout expects. Structure comes from block order and heading
 * level, never from arbitrary formatting:
 *
 *  - tagline: the first heading-4 (or, failing that, the first paragraph)
 *    before any section has started;
 *  - section label: the first heading-1/2 (only while no section has begun);
 *  - sections: each further heading starts a section; paragraphs belong to
 *    the most recent section.
 *
 * Empty blocks and unsupported block types are skipped (unsupported types
 * were already reported when fetched). A page with no tagline is rejected
 * rather than rendered incomplete.
 */
export function mapHomeBlocks(blocks: ContentBlock[]): HomeContent {
  let tagline: HomeContent["tagline"] | null = null;
  let sectionLabel: HomeContent["sectionLabel"] = null;
  const sections: HomeSection[] = [];
  let current: HomeSection | null = null;
  let skipped = 0;

  for (const block of blocks) {
    if (block.kind === "unsupported") {
      skipped += 1;
      continue;
    }
    if (richTextToPlain(block.text).trim() === "") continue;

    if (block.kind === "heading") {
      if (block.level === 4 && !tagline && sections.length === 0) {
        tagline = block.text;
      } else if ((block.level === 1 || block.level === 2) && !sectionLabel && sections.length === 0) {
        sectionLabel = block.text;
      } else {
        current = { heading: block.text, paragraphs: [] };
        sections.push(current);
      }
      continue;
    }

    // paragraph
    if (current) {
      current.paragraphs.push(block.text);
    } else if (!tagline) {
      tagline = block.text;
    } else {
      current = { heading: null, paragraphs: [block.text] };
      sections.push(current);
    }
  }

  if (skipped > 0) {
    logger.warn("Home page contains unsupported blocks that were skipped", { count: skipped });
  }
  if (!tagline) {
    throw new ProviderError("The Home page content has no tagline; refusing to render an incomplete page.");
  }

  return { tagline, sectionLabel, sections };
}
