/**
 * The permission model (docs/architecture/overview.md §3.1): `module.action`
 * keys, granted to roles. This file is the source of the seed in migration
 * 0012 (admin_permissions, admin_role_permissions); the API reads the grants
 * from the database, so a team's rights can change without a release. A
 * test checks that the seeded rows match this file.
 */

export const MODULES = {
  directory: "People and Organizations",
  taxonomy: "Expertise, Fields and Domains",
  treasury: "Treasury",
  cms: "Home and Documentation",
  feedback: "Feedbacks and issues",
  waitlist: "Waitlist",
  messages: "Messages and Emails",
  services: "Services",
  access: "Permissions",
  accounts: "Accounts and roles",
  history: "History",
  imports: "Imports",
  settings: "Settings",
} as const;
export type Module = keyof typeof MODULES;

/** Every key that exists, with what it allows. */
export const PERMISSIONS = {
  "directory.read": "See people and organizations",
  "directory.create": "Create people and organizations",
  "directory.update": "Edit, link, archive and restore people and organizations",
  "directory.delete": "Delete people and organizations permanently",
  "directory.import": "Import people and organizations",
  "taxonomy.read": "See expertise, fields and domains",
  "taxonomy.create": "Create expertise, fields and domains",
  "taxonomy.update": "Edit expertise, fields and domains",
  "taxonomy.delete": "Delete expertise, fields and domains",
  "taxonomy.import": "Import the taxonomy",
  "treasury.read": "See the Treasury",
  "treasury.create": "Create Treasury entries",
  "treasury.update": "Edit Treasury entries, their documents and archive them",
  "treasury.review": "Set the review status of expenses",
  "treasury.publish": "Publish and unpublish Treasury entries",
  "treasury.delete": "Delete Treasury entries permanently",
  "treasury.import": "Import the Treasury",
  "cms.read": "See Home and Documentation content",
  "cms.create": "Create documentation",
  "cms.update": "Edit Home and Documentation",
  "cms.publish": "Publish Home and Documentation",
  "cms.delete": "Delete documentation",
  "cms.import": "Import Home and Documentation",
  "feedback.read": "See feedbacks and issues",
  "feedback.update": "Handle feedbacks and issues",
  "feedback.publish": "Publish feedbacks and issues",
  "waitlist.read": "See the waitlist",
  "waitlist.update": "Handle the waitlist",
  "messages.read": "See messages and emails",
  "messages.update": "Answer messages and emails",
  "services.read": "See services",
  "services.create": "Create services",
  "services.update": "Edit, archive and restore services",
  "services.delete": "Delete services permanently",
  "access.read": "See permissions (access grants)",
  "access.create": "Grant access",
  "access.update": "Change, revoke, archive and restore access",
  "access.delete": "Delete access grants permanently",
  "accounts.read": "See admin accounts",
  "accounts.manage": "Invite, change and deactivate admin accounts; reset passwords",
  "history.read": "See the whole history (otherwise: the modules the role can see)",
  "imports.read": "See the Imports page and its runs",
  "settings.manage": "Change platform settings",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/**
 * The roles (overview §3.1): the owner is "Rootadmin" in the Figma (p15),
 * the team roles follow the experiment's teams. "Superadmin" is a v1.0
 * team-membership level, not a v0.1 role.
 */
export const ROLES = {
  owner: { label: "Rootadmin", sortOrder: 1 },
  admin: { label: "Admin", sortOrder: 2 },
  treasury: { label: "Treasury admin", sortOrder: 3 },
  communication: { label: "Communication admin", sortOrder: 4 },
  moderation: { label: "Moderator", sortOrder: 5 },
  operations: { label: "Operation admin", sortOrder: 6 },
  tech: { label: "Tech admin", sortOrder: 7 },
  compliance: { label: "Compliance", sortOrder: 8 },
} as const;
export type Role = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as Role[];

const read = (...modules: Module[]) => modules.map((name) => `${name}.read` as Permission);

/** The matrix of overview §3.1. The owner has every permission. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: [
    "directory.read", "directory.create", "directory.update", "directory.import",
    "taxonomy.read", "taxonomy.import",
    "treasury.read", "treasury.create", "treasury.update", "treasury.review",
    "cms.read", "cms.create", "cms.update", "cms.publish", "cms.delete", "cms.import",
    "feedback.read", "feedback.update",
    "waitlist.read", "waitlist.update",
    "messages.read", "messages.update",
    "services.read", "services.create", "services.update",
    "access.read", "access.create", "access.update",
    "accounts.read", "history.read", "imports.read",
  ],
  treasury: [
    ...read("directory", "taxonomy", "services", "access", "imports"),
    "treasury.read", "treasury.create", "treasury.update", "treasury.review", "treasury.publish", "treasury.import",
  ],
  communication: [
    ...read("directory", "taxonomy", "treasury", "feedback"),
    "cms.read", "cms.create", "cms.update", "cms.publish",
    "waitlist.read", "waitlist.update", "messages.read", "messages.update",
  ],
  moderation: [...read("directory", "taxonomy", "cms"), "feedback.read", "feedback.update", "feedback.publish", "messages.read", "messages.update"],
  operations: [
    ...read("taxonomy", "treasury", "waitlist", "messages"),
    "directory.read", "directory.create", "directory.update",
    "services.read", "services.create", "services.update",
    "access.read", "access.create", "access.update",
  ],
  tech: [
    ...read("directory", "treasury", "cms", "feedback", "messages", "history"),
    "taxonomy.read", "taxonomy.import",
    "services.read", "services.create", "services.update",
    "access.read", "access.create", "access.update",
    "imports.read",
  ],
  compliance: [
    ...read("directory", "taxonomy", "treasury", "cms", "feedback", "waitlist", "messages", "services", "access", "accounts", "history", "imports"),
    "treasury.review",
  ],
};

/** The module a history entity belongs to (who may read its history without history.read). */
export const ENTITY_MODULE: Record<string, Module> = {
  person: "directory",
  organization: "directory",
  treasury_entry: "treasury",
  expertise_domain: "taxonomy",
  expertise_field: "taxonomy",
  expertise_item: "taxonomy",
  service: "services",
  access_grant: "access",
  admin_user: "accounts",
  setting: "settings",
  import_run: "imports",
};

/** Whether a set of permissions may read an entity type's history (history.read reads all). */
export function canReadEntity(permissions: ReadonlySet<string>, entityType: string): boolean {
  if (permissions.has("history.read")) return true;
  const area = ENTITY_MODULE[entityType];
  if (!area) return false;
  return area === "settings" ? permissions.has("settings.manage") : permissions.has(`${area}.read`);
}

/** An import kind's module: running it needs `<module>.import`. */
export const IMPORT_MODULES: Readonly<Record<string, Module>> = { directory: "directory" };
