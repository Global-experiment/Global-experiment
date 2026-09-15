/**
 * Home page copy, isolated from layout/components so it can be replaced the
 * moment the client confirms final wording. There is a confirmed wording
 * conflict between the Figma design and the Notion export's Home page (see
 * the Notion export audit) — this uses the Figma copy for now, per the
 * client's explicit instruction that Figma is the visual/layout source of
 * truth for Home. Not a CMS: this is a static, typed config module for a
 * static page, replaced wholesale when copy is confirmed.
 */

export interface HomeAction {
  label: string;
  href: string;
  icon: "waitlist" | "contribute" | "donate" | "treasury";
}

export interface HomeSubsection {
  heading: string;
  paragraphs: string[];
}

export interface HomeContent {
  brand: string;
  eyebrow: string;
  subtitle: string;
  actions: HomeAction[];
  sectionLabel: string;
  subsections: HomeSubsection[];
  primaryAction: HomeAction;
  /**
   * Not part of Figma's Home CTA grid (Documentation is reached from other
   * pages' footer links there) — added per explicit instruction so Home
   * always has a real entry point into Documentation.
   */
  documentationLink: { label: string; href: string };
}

export const homeContent: HomeContent = {
  brand: "Global experiment",
  eyebrow: "Early development",
  subtitle: "A global space for democratic participation and collective decision-making.",
  actions: [
    { label: "Join waitlist", href: "/waitlist", icon: "waitlist" },
    { label: "Contribute", href: "/contribute", icon: "contribute" },
    { label: "Donate", href: "/donate", icon: "donate" },
    { label: "Treasury", href: "/treasury", icon: "treasury" },
  ],
  primaryAction: { label: "Join waitlist", href: "/waitlist", icon: "waitlist" },
  documentationLink: { label: "Documentation", href: "/documentation" },
  sectionLabel: "Purpose and principles",
  subsections: [
    {
      heading: "A global democratic infrastructure",
      paragraphs: [
        "The Global experiment aims to provide shared civic infrastructure that can work across borders. It brings democratic decision-making, public administration, transparent institutions and economic participation into one connected framework, with privacy built into its foundations so that people can participate safely and freely.",
      ],
    },
    {
      heading: "Open and transparent",
      paragraphs: [
        "Participants may submit ideas, consider different perspectives, revise proposals and vote on decisions. Authority is distributed across the community and exercised according to clear, published rules rather than concentrated in a single person or institution.",
        "All core software is free and open source, allowing public inspection, reuse and improvement. Governance rules, finances, decisions and development work are documented to support scrutiny and accountability.",
      ],
    },
    {
      heading: "Protection of privacy",
      paragraphs: [
        "Meaningful participation depends on the freedom to express views without surrendering control over personal information. Privacy is therefore treated as a fundamental requirement.",
        "Access to private data is strictly limited. Public discussions, results and statistics are designed to protect identities, while administrative actions are controlled and recorded. Each participant determines what information is made public and retains applicable rights over personal data.",
      ],
    },
    {
      heading: "Why it matters",
      paragraphs: [
        "Decisions with consequences across borders are often made without meaningful participation from many of the people affected. The experiment examines whether democratic decision-making can become more inclusive, continuous and accountable.",
        "The Global Experiment remains a work in progress rather than a finished model. Its institutions, rules and platform are being developed openly and require contributors from different regions, disciplines and lived experiences.",
      ],
    },
    {
      heading: "Early development",
      paragraphs: [
        "The first version of the platform is meant to have the foundations of a decentralized organization, including administration, transparency features such as statistics and history of administration decisions.",
      ],
    },
  ],
};
