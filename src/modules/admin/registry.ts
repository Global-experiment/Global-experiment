import type { AdminIconName } from "./ui/adminIcons";

/**
 * Admin module registry: every module the admin knows about, in the
 * sidebar's sections and order (admin-desktop.pdf p2, 19 Oct; decision 16
 * of 2026-10-19). A module is `live` once its pages exist; until then the
 * sidebar lists it disabled with "Coming soon" and no route answers for
 * it. Turning a module on is one line here plus its pages.
 */
export type AdminModuleStatus = "live" | "coming_soon";

export interface AdminModule {
  /** Stable id (one per sidebar row: a page listed twice gets two ids). */
  key: string;
  label: string;
  icon: AdminIconName;
  status: AdminModuleStatus;
  /** The module's page (live modules). */
  href?: string;
  /** Other paths that belong to this module (e.g. the Notion import page under People). */
  alsoActiveOn?: string[];
}

export interface AdminSection {
  section: string;
  modules: AdminModule[];
}

export const ADMIN_MODULES: AdminSection[] = [
  {
    section: "Communication",
    modules: [
      { key: "home", label: "Home", icon: "home", status: "live", href: "/admin/home" },
      { key: "documentation", label: "Documentation", icon: "insert_drive_file", status: "live", href: "/admin/documentation" },
      { key: "treasury", label: "Treasury", icon: "toll", status: "live", href: "/admin/treasury" },
    ],
  },
  {
    section: "Admin",
    modules: [
      { key: "feedback", label: "Feedbacks and issues", icon: "lightbulb", status: "coming_soon" },
      { key: "people", label: "People", icon: "group", status: "live", href: "/admin/people", alsoActiveOn: ["/admin/imports"] },
      { key: "organizations", label: "Organizations", icon: "corporate_fare", status: "live", href: "/admin/organizations" },
      // Owner's addendum of 2026-10-19 (Step 8); not drawn in the Figma: the document glyph until a Figma icon exists.
      { key: "contracting", label: "Contracting", icon: "insert_drive_file", status: "coming_soon" },
      { key: "messages", label: "Messages", icon: "forum", status: "coming_soon" },
      { key: "cloud", label: "Cloud", icon: "cloud", status: "coming_soon" },
    ],
  },
  {
    section: "Monitoring",
    modules: [
      { key: "services", label: "Services", icon: "services", status: "coming_soon" },
      { key: "permissions", label: "Permissions", icon: "lock", status: "coming_soon" },
      { key: "accounts", label: "Accounts", icon: "manage_accounts", status: "coming_soon" },
      // Figma draws History with the lightbulb glyph.
      { key: "history", label: "History", icon: "lightbulb", status: "live", href: "/admin/history" },
      { key: "analytics", label: "Analytics", icon: "analytics", status: "coming_soon" },
      { key: "technical_dashboard", label: "Technical dashboard", icon: "technical_dashboard", status: "coming_soon" },
      { key: "emails", label: "Emails", icon: "alternate_email", status: "coming_soon" },
    ],
  },
  {
    section: "Other",
    modules: [
      { key: "expertise", label: "Expertise", icon: "view_column", status: "live", href: "/admin/expertise" },
      { key: "fields", label: "Fields", icon: "view_column", status: "live", href: "/admin/fields" },
      { key: "domains", label: "Domains", icon: "view_column", status: "live", href: "/admin/domains" },
      // The same page as Admin › Organizations (decision 16): highlighted there, not twice.
      { key: "organizations_other", label: "Organizations", icon: "corporate_fare", status: "live", href: "/admin/organizations" },
      { key: "waitlist", label: "Waitlist", icon: "approval", status: "coming_soon" },
    ],
  },
];

/** The menu filtered by the sidebar search (case-insensitive, on the label); empty sections drop out. */
export function filterModules(sections: readonly AdminSection[], query: string): AdminSection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...sections];
  return sections
    .map((group) => ({ ...group, modules: group.modules.filter((entry) => entry.label.toLowerCase().includes(needle)) }))
    .filter((group) => group.modules.length > 0);
}

const matches = (entry: AdminModule, pathname: string) =>
  entry.status === "live" &&
  [entry.href, ...(entry.alsoActiveOn ?? [])].some((path) => path !== undefined && (pathname === path || pathname.startsWith(`${path}/`)));

/** The one sidebar row for this path: the first match, so a page listed twice is highlighted once. */
export function activeModuleKey(sections: readonly AdminSection[], pathname: string): string | undefined {
  for (const group of sections) for (const entry of group.modules) if (matches(entry, pathname)) return entry.key;
  return undefined;
}
