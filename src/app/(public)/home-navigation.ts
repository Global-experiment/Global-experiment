/**
 * Home page CHROME — owned by the Figma design, not by the CMS: the site
 * wordmark and the navigation controls (labels and destinations). These are
 * interface elements, not editorial copy; all editorial text on Home (the
 * tagline, the section label, headings and paragraphs) comes from the live
 * Notion Home page via src/modules/home.
 */

export interface HomeAction {
  label: string;
  href: string;
  icon: "waitlist" | "contribute" | "donate" | "treasury";
}

export const homeWordmark = {
  brand: "Global experiment",
  eyebrow: "Early development",
} as const;

export const homeActions: HomeAction[] = [
  { label: "Join waitlist", href: "/waitlist", icon: "waitlist" },
  { label: "Contribute", href: "/contribute", icon: "contribute" },
  { label: "Donate", href: "/donate", icon: "donate" },
  { label: "Treasury", href: "/treasury", icon: "treasury" },
];

export const homePrimaryAction: HomeAction = {
  label: "Join waitlist",
  href: "/waitlist",
  icon: "waitlist",
};

export const homeDocumentationLink = { label: "Documentation", href: "/documentation" } as const;
