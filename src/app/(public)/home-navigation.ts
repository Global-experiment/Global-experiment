import type { IconName } from "@/shared/ui/icons";

/**
 * Home page CHROME — owned by the Figma design, not by the CMS: the site
 * wordmark and the navigation controls (labels, destinations, Material
 * icons). These are interface elements, not editorial copy; all editorial
 * text on Home (the tagline, the section label, headings and paragraphs)
 * comes from the live Notion Home page via src/modules/home.
 *
 * Button set and order from the updated figma.pdf p1 (2026-09-24 export):
 * a full-width "Join waitlist" row, then a 2×2 grid — Documentation,
 * Treasury / Contribute, Donate. The desktop frame (p33) was not
 * re-exported and still shows the previous 4-button grid; desktop uses
 * this same set so Join waitlist stays reachable there once its sticky
 * CTA is removed (client feedback) — see docs/architecture/design-fidelity.md.
 */

export interface HomeAction {
  label: string;
  href: string;
  icon: IconName;
}

export const homeWordmark = {
  brand: "Global experiment",
  eyebrow: "Early development",
} as const;

/** Full-width first row on Home, and the mobile-only sticky bottom CTA. */
export const homePrimaryAction: HomeAction = {
  label: "Join waitlist",
  href: "/waitlist",
  icon: "approval",
};

/** The 2×2 grid under the primary action, in reading order. */
export const homeActions: HomeAction[] = [
  { label: "Documentation", href: "/documentation", icon: "insert_drive_file" },
  { label: "Treasury", href: "/treasury", icon: "toll" },
  { label: "Contribute", href: "/contribute", icon: "mail" },
  { label: "Donate", href: "/donate", icon: "volunteer_activism" },
];
