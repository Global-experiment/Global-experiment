import type { AdminIconName } from "./ui/adminIcons";

/**
 * Admin module registry: the destinations of the admin menu, in the order
 * of the Figma component "Desktop menu" (Design system, page "1 Master").
 * The menu shows only modules that are live (client, 2026-11-24; ADR 024):
 * no "Coming soon" rows and each page listed once. A module joins the menu
 * by being listed here with `active: true` once its pages exist; until then
 * it is either not listed or listed with `active: false`, and no route
 * answers for it. Feedbacks and issues goes after Home when it is live.
 * Each module names the permission that shows it: the menu only lists what
 * the signed-in role can read.
 */
export interface AdminModule {
  /** Stable id, one per menu row. */
  key: string;
  label: string;
  icon: AdminIconName;
  href: string;
  /** The permission that shows it (`module.read`); a role without it doesn't see the row. */
  permission?: string;
  /** Live: its pages exist and the menu lists it. */
  active: boolean;
  /** Other paths that belong to this module (e.g. the Notion import page under People). */
  alsoActiveOn?: string[];
}

export const ADMIN_MODULES: AdminModule[] = [
  { key: "home", label: "Home", icon: "home", href: "/admin/home", permission: "cms.read", active: true },
  { key: "documentation", label: "Documentation", icon: "insert_drive_file", href: "/admin/documentation", permission: "cms.read", active: true },
  { key: "treasury", label: "Treasury", icon: "toll", href: "/admin/treasury", permission: "treasury.read", active: true },
  { key: "people", label: "People", icon: "groups_2", href: "/admin/people", permission: "directory.read", active: true, alsoActiveOn: ["/admin/imports"] },
  { key: "organizations", label: "Organizations", icon: "corporate_fare", href: "/admin/organizations", permission: "directory.read", active: true },
  { key: "services", label: "Services", icon: "services", href: "/admin/services", permission: "services.read", active: true },
  { key: "permissions", label: "Permissions", icon: "lock", href: "/admin/permissions", permission: "access.read", active: true },
  { key: "accounts", label: "Accounts", icon: "manage_accounts", href: "/admin/accounts", permission: "accounts.read", active: true },
  { key: "expertise", label: "Expertise", icon: "view_column", href: "/admin/expertise", permission: "taxonomy.read", active: true },
  { key: "fields", label: "Fields", icon: "view_column", href: "/admin/fields", permission: "taxonomy.read", active: true },
  { key: "domains", label: "Domains", icon: "view_column", href: "/admin/domains", permission: "taxonomy.read", active: true },
  { key: "history", label: "History", icon: "history", href: "/admin/history", active: true },
];

/** The menu as this role sees it: live modules only, and only those it can read. */
export function modulesFor(modules: readonly AdminModule[], permissions: ReadonlySet<string>): AdminModule[] {
  // A module without a permission of its own (History) still needs a role: an account with none (OPS-141) has only its profile.
  return modules.filter((entry) => entry.active && (entry.permission ? permissions.has(entry.permission) : permissions.size > 0));
}

/** The menu filtered by the sidebar search (case-insensitive, on the label), in menu order. */
export function filterModules(modules: readonly AdminModule[], query: string): AdminModule[] {
  const needle = query.trim().toLowerCase();
  return modules.filter((entry) => entry.label.toLowerCase().includes(needle));
}

/** The one menu row for this path: its own page, a sub-page, or a page that belongs to it. */
export function activeModuleKey(modules: readonly AdminModule[], pathname: string): string | undefined {
  return modules.find((entry) => [entry.href, ...(entry.alsoActiveOn ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`)))?.key;
}
