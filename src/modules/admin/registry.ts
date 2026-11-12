export type SidebarIconName =
  | "home"
  | "insert-drive-file"
  | "toll"
  | "groups-2"
  | "business"
  | "touch-app"
  | "lock-open"
  | "manage-accounts"
  | "view-week"
  | "history"
  | "search"
  | "collapse"
  | "expand"
  | "sign-out";

/** Destinations in the Design System's Desktop menu, in display order. */
export interface AdminModule {
  key: string;
  label: string;
  icon: SidebarIconName;
  href: string;
  permission?: string;
  /** Other paths that highlight this destination. */
  alsoActiveOn?: string[];
  /** The first three rows are spaced more closely in both menu states. */
  publicPage?: boolean;
}

export const ADMIN_MODULES: AdminModule[] = [
  { key: "home", label: "Home", icon: "home", href: "/admin/home", permission: "cms.read", publicPage: true },
  { key: "documentation", label: "Documentation", icon: "insert-drive-file", href: "/admin/documentation", permission: "cms.read", publicPage: true },
  { key: "treasury", label: "Treasury", icon: "toll", href: "/admin/treasury", permission: "treasury.read", publicPage: true },
  { key: "people", label: "People", icon: "groups-2", href: "/admin/people", permission: "directory.read", alsoActiveOn: ["/admin/imports"] },
  { key: "organizations", label: "Organizations", icon: "business", href: "/admin/organizations", permission: "directory.read" },
  { key: "services", label: "Services", icon: "touch-app", href: "/admin/services", permission: "services.read" },
  { key: "permissions", label: "Permissions", icon: "lock-open", href: "/admin/permissions", permission: "access.read" },
  { key: "accounts", label: "Accounts", icon: "manage-accounts", href: "/admin/accounts", permission: "accounts.read" },
  { key: "expertise", label: "Expertise", icon: "view-week", href: "/admin/expertise", permission: "taxonomy.read" },
  { key: "fields", label: "Fields", icon: "view-week", href: "/admin/fields", permission: "taxonomy.read" },
  { key: "domains", label: "Domains", icon: "view-week", href: "/admin/domains", permission: "taxonomy.read" },
  { key: "history", label: "History", icon: "history", href: "/admin/history" },
];

export function modulesFor(modules: readonly AdminModule[], permissions: ReadonlySet<string>): AdminModule[] {
  // History has no permission of its own but still requires a role.
  return modules.filter((entry) => (entry.permission ? permissions.has(entry.permission) : permissions.size > 0));
}

export function filterModules(modules: readonly AdminModule[], query: string): AdminModule[] {
  const needle = query.trim().toLowerCase();
  return modules.filter((entry) => entry.label.toLowerCase().includes(needle));
}

export function activeModuleKey(modules: readonly AdminModule[], pathname: string): string | undefined {
  return modules.find((entry) => [entry.href, ...(entry.alsoActiveOn ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`)))?.key;
}
