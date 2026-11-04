import type { ContentBlock, RichText } from "@/shared/content/types";

/**
 * Editorial content of the Home page, as owned by the application. The
 * Figma design controls layout and presentation; the content supplies only
 * these values (ADR 020: native, edited in the admin).
 */

/** What a section holds under its heading: paragraphs, lists and images. */
export type HomeSectionBlock = Exclude<ContentBlock, { kind: "heading" }>;

export interface HomeSection {
  /** null only for stray content that appears before any heading. */
  heading: RichText[] | null;
  blocks: HomeSectionBlock[];
}

export interface HomeContent {
  tagline: RichText[];
  /** Label shown above the sections ("Purpose and principles" in the current content). */
  sectionLabel: RichText[] | null;
  sections: HomeSection[];
}
