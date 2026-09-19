import type { RichText } from "@/shared/content/types";

/**
 * Editorial content of the Home page, as owned by the application. The
 * Figma design controls layout and presentation; the CMS supplies only
 * these text values. Nothing here knows about Notion.
 */

export interface HomeSection {
  /** null only for stray paragraphs that appear before any heading. */
  heading: RichText[] | null;
  paragraphs: RichText[][];
}

export interface HomeContent {
  tagline: RichText[];
  /** Label shown above the sections ("Purpose and principles" in the current content). */
  sectionLabel: RichText[] | null;
  sections: HomeSection[];
}
