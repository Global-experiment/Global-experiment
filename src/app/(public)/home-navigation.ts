import type { IconName } from "@/shared/ui/icons";

/**
 * Home page CHROME — owned by the Figma design, not by the CMS: the site
 * wordmark and the navigation controls (labels, destinations, Material
 * icons). These are interface elements, not editorial copy; all editorial
 * text on Home (the tagline, the section label, headings and paragraphs)
 * comes from the live Notion Home page via src/modules/home.
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

export const homeActions: HomeAction[] = [
  { label: "Join waitlist", href: "/waitlist", icon: "approval" },
  { label: "Contribute", href: "/contribute", icon: "mail" },
  { label: "Donate", href: "/donate", icon: "volunteer_activism" },
  { label: "Treasury", href: "/treasury", icon: "toll" },
];

export const homePrimaryAction: HomeAction = {
  label: "Join waitlist",
  href: "/waitlist",
  icon: "approval",
};

/**
 * Not on the Home frame in figma.pdf (Documentation is reached from the
 * Treasury/Donate overflow sheets there); kept as an action row in the
 * design's own row style so the section stays reachable from Home.
 */
export const homeDocumentationLink: HomeAction = {
  label: "Documentation",
  href: "/documentation",
  icon: "insert_drive_file",
};
