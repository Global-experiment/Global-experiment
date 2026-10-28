/**
 * The admin API's JSON contracts as the frontend sees them (mirrors
 * apps/api/src/{people,organizations,expertise}/*.contracts.ts). Components
 * only ever handle these shapes — never database rows.
 */

export interface EntityRef {
  id: string;
  name: string;
}

export interface ExpertiseRef extends EntityRef {
  stableId: string | null;
  /** Only Active expertise can be newly linked; others show greyed out. */
  status: VocabularyEntry | null;
  field: EntityRef;
  domain: EntityRef;
}

/** GET /expertise/search result. */
export interface ExpertiseSearchItem extends ExpertiseRef {
  /** "Domain > Field > Expertise". */
  path: string;
  teams: VocabularyEntry[];
  selectable: boolean;
}

export type PersonCompletenessField = "State" | "Source" | "Description" | "Expertise";
export type OrganizationCompletenessField = "Description" | "Website" | "Email" | "Wise recipient ID" | "Expertise";

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface Person {
  id: string;
  /** Person ID, shown as `PER-n` (see formatPersonNumber). */
  personNumber: number;
  /** Set when the person was imported from Notion (read-only). */
  notionPageId: string | null;
  name: string;
  state: VocabularyEntry | null;
  source: VocabularyEntry | null;
  description: string | null;
  doNotContact: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin: string | null;
  x: string | null;
  otherContact: string | null;
  wiseRecipientId: string | null;
  otherSocials: string | null;
  /** Next planned follow-up: an instant (ISO), shown in the viewer's time zone. */
  nextFollowupAt: string | null;
  /** Calendar dates (YYYY-MM-DD), never converted. */
  firstContactOn: string | null;
  lastContactOn: string | null;
  /** Whole scores 0–10. */
  aiRelevanceScore: number | null;
  relevanceScore: number | null;
  contactChannels: VocabularyEntry[];
  expenses: ExpenseRef[];
  /** Their access grants (Permissions, Figma p14). */
  permissions: GrantRef[];
  /** The former "last follow-up" value, kept as-is (read-only). */
  lastFollowupAtLegacy: string | null;
  /** The next follow-up has passed, and neither Rejected nor Do not contact. */
  followUpOverdue: boolean;
  archivedAt: string | null;
  missing: PersonCompletenessField[];
  createdAt: string;
  updatedAt: string;
  organizations: EntityRef[];
  expertise: ExpertiseRef[];
}

export interface ExpenseRef {
  id: string;
  entryNumber: number;
  currency: string;
  /** Minor units (negative for an expense). */
  grossAmount: number;
}

export interface PersonInput {
  name?: string;
  stateKey?: string | null;
  sourceKey?: string | null;
  description?: string | null;
  doNotContact?: boolean;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  x?: string | null;
  otherContact?: string | null;
  wiseRecipientId?: string | null;
  otherSocials?: string | null;
  nextFollowupAt?: string | null;
  firstContactOn?: string | null;
  lastContactOn?: string | null;
  aiRelevanceScore?: number | null;
  relevanceScore?: number | null;
  contactChannelKeys?: string[];
  expenseIds?: string[];
  organizationIds?: string[];
  expertiseIds?: string[];
}

export interface Organization {
  id: string;
  /** Organization ID, shown as `ORG-n` (see formatOrgNumber). */
  orgNumber: number;
  /** Set when the organization was imported from Notion (read-only). */
  notionPageId: string | null;
  name: string;
  description: string | null;
  website: string | null;
  email: string | null;
  wiseRecipientId: string | null;
  missing: OrganizationCompletenessField[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  people: EntityRef[];
  expertise: ExpertiseRef[];
}

export interface OrganizationInput {
  name?: string;
  description?: string | null;
  website?: string | null;
  email?: string | null;
  wiseRecipientId?: string | null;
  expertiseIds?: string[];
  personIds?: string[];
}

export const formatPersonNumber = (n: number) => `PER-${n}`;
export const formatOrgNumber = (n: number) => `ORG-${n}`;

export interface PeopleOptions {
  contactChannels: VocabularyEntry[];
  /** ai.enabled: the AI relevance score is filled automatically (read-only). */
  aiScoreReadOnly: boolean;
  states: VocabularyEntry[];
  sources: VocabularyEntry[];
}

export interface Page<Item> {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
}

/** Notion-side taxonomy attributes, set by the import (read-only in the admin). */
export interface TaxonomyNotionAttributes {
  stableId: string | null;
  status: VocabularyEntry | null;
}

export interface ExpertiseItemNode extends TaxonomyNotionAttributes {
  id: string;
  name: string;
  teams: VocabularyEntry[];
  peopleCount: number;
  organizationCount: number;
}

export interface ExpertiseFieldNode extends TaxonomyNotionAttributes {
  id: string;
  name: string;
  items: ExpertiseItemNode[];
}

export interface ExpertiseDomainNode extends TaxonomyNotionAttributes {
  id: string;
  name: string;
  fields: ExpertiseFieldNode[];
}

export interface ExpertiseTree {
  domains: ExpertiseDomainNode[];
}

export type ImportKind = "taxonomy" | "directory" | "treasury";

/** An import_runs row (GET /imports/runs). */
export interface ImportRun {
  id: string;
  kind: string;
  mode: "dry_run" | "apply" | "failed";
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string;
  counts: { changes?: number } & Record<string, unknown>;
  issues: { kind?: string; code?: string; detail?: string; name?: string }[];
}

/** A background import job (POST /imports/:kind/dry-run|apply, GET /imports/jobs/:id). */
export interface ImportJob {
  id: string;
  kind: ImportKind;
  mode: "dry_run" | "apply";
  status: "running" | "succeeded" | "failed" | "refused";
  phase: "queued" | "reading_notion" | "planning" | "applying" | "done";
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string;
  runId: string | null;
  dryRunId: string | null;
  changes: number | null;
  /** A finished dry run with something to write, not refused: it can be applied. */
  applicable: boolean;
  report: string | null;
  error: string | null;
}

export interface ImportStatus {
  taxonomy: { available: boolean; reason: string | null };
  directory: { available: boolean; reason: string | null };
  treasury: { available: boolean; reason: string | null };
  activeJob: ImportJob | null;
}

/** The signed-in admin (GET /api/admin/auth/session), with what their role allows. */
export interface AdminPrincipal {
  id: string;
  email: string;
  role: string;
  /** "Rootadmin", "Treasury admin"… */
  roleLabel: string;
  /** Null until set on /admin/profile. */
  displayName: string | null;
  /** "GE-000001". */
  accountId: string;
  /** Null = the browser's. */
  timeZone: string | null;
  appearance: "system" | "light" | "dark";
  hasPicture: boolean;
  /** `module.action` keys (apps/api/src/access-control/permissions.ts). */
  permissions: string[];
}

// ---- Accounts, profile (mirrors apps/api/src/accounts/accounts.contracts.ts) ----

export interface GrantRef {
  id: string;
  service: string;
  level: string | null;
  status: VocabularyEntry | null;
}

/** "GitHub / admin" in lists (Figma p16–p17), "GitHub · admin" on records and in the history. */
export const grantListLabel = (grant: Pick<GrantRef, "service" | "level">) => `${grant.service}${grant.level ? ` / ${grant.level}` : ""}`;
export const grantChipLabel = (grant: Pick<GrantRef, "service" | "level">) => `${grant.service}${grant.level ? ` · ${grant.level}` : ""}`;

export type AccountStatus = "active" | "invited" | "deactivated";

export interface Account {
  id: string;
  accountId: string;
  name: string;
  displayName: string | null;
  email: string;
  role: VocabularyEntry;
  status: AccountStatus;
  note: string | null;
  person: { id: string; name: string } | null;
  expertise: { id: string; name: string }[];
  permissions: GrantRef[];
  hasPicture: boolean;
  lastLoginAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pendingLink: { purpose: "invite" | "reset"; expiresAt: string } | null;
}

export interface Profile extends Account {
  timeZone: string | null;
  appearance: "system" | "light" | "dark";
  permissionKeys: string[];
}

export interface OneTimeLink {
  link: string;
  purpose: "invite" | "reset";
  expiresAt: string;
}

/** The roles (overview §3.1), in the order the admin lists them. */
export const ROLE_OPTIONS: readonly VocabularyEntry[] = [
  { key: "owner", label: "Rootadmin" },
  { key: "admin", label: "Admin" },
  { key: "treasury", label: "Treasury admin" },
  { key: "communication", label: "Communication admin" },
  { key: "moderation", label: "Moderator" },
  { key: "operations", label: "Operation admin" },
  { key: "tech", label: "Tech admin" },
  { key: "compliance", label: "Compliance" },
];

// ---- Services and access grants (mirrors apps/api/src/services/services.contracts.ts) ----

export interface Ref {
  id: string;
  name: string;
}

export interface Service {
  id: string;
  serviceNumber: number;
  name: string;
  status: VocabularyEntry | null;
  category: VocabularyEntry | null;
  hostingModel: VocabularyEntry | null;
  url: string | null;
  description: string | null;
  responsible: Ref | null;
  permissions: GrantRef[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Grant {
  id: string;
  grantNumber: number;
  name: string | null;
  title: string;
  person: Ref | null;
  account: Ref | null;
  service: Ref;
  level: VocabularyEntry | null;
  status: VocabularyEntry | null;
  resourceScope: string | null;
  grantedOn: string | null;
  revokedOn: string | null;
  expiresOn: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServicesOptions {
  statuses: VocabularyEntry[];
  categories: VocabularyEntry[];
  hostingModels: VocabularyEntry[];
  levels: VocabularyEntry[];
  accessStatuses: VocabularyEntry[];
  accounts: Ref[];
}

/** The user card's name: the display name, else the part of the email before "@". */
export const adminDisplayName = (admin: Pick<AdminPrincipal, "email" | "displayName">) =>
  admin.displayName?.trim() || admin.email.split("@")[0] || admin.email;

// ---- Treasury (mirrors apps/api/src/treasury/treasury-admin.contracts.ts) ----

export type TreasuryEntryType = "donation" | "expense" | "refund" | "dispute";

export interface TreasuryEntryRow {
  id: string;
  /** Shown as `EXP-n` (see formatEntryNumber). */
  number: number;
  type: TreasuryEntryType;
  name: string;
  occurredOn: string;
  occurredAt: string | null;
  currency: string;
  /** Minor units, signed (expenses and refunds are negative). */
  grossAmount: number;
  feeAmount: number | null;
  netAmount: number | null;
  settlement: { currency: string; grossAmount: number; feeAmount: number; netAmount: number; exchangeRate: string } | null;
  cadence: string;
  recipient: { kind: "person" | "organization"; id: string; name: string } | null;
  expenseTypes: VocabularyEntry[];
  review: VocabularyEntry;
  publication: "published" | "unpublished";
  publishedAt: string | null;
  /** Visible on the public Treasury now (published, a public Stripe mode, reviewed unless unqualified ones may be public). */
  publicNow: boolean;
  source: "stripe" | "wise" | "manual";
  livemode: boolean;
  /** Sample data before go-live (marked Test publicly; purge-sample-treasury removes it). */
  sample: boolean;
  managedBy: "notion" | "native";
  documents: number;
  createdAt: string;
  updatedAt: string;
  /** Archived (decision 12): only in the "Archived" view. */
  archivedAt: string | null;
}

export interface TreasuryDocument {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface TreasuryRule {
  allowed: boolean;
  reason: string | null;
}

export interface TreasuryEntry extends TreasuryEntryRow {
  notionPageId: string | null;
  notionUrl: string | null;
  externalTransactionId: string | null;
  sourceAccountId: string | null;
  reviewedAt: string | null;
  publicDescription: string | null;
  internalNote: string | null;
  importedAt: string | null;
  adjusts: { id: string; number: number } | null;
  adjustments: { id: string; number: number; type: string; grossAmount: number }[];
  documentsList: TreasuryDocument[];
  permissions: {
    editInternalNote: boolean;
    publish: TreasuryRule;
    unpublish: TreasuryRule;
    review: TreasuryRule & { options: VocabularyEntry[] };
    documents: boolean;
  };
}

export interface TreasuryOptions {
  expenseTypes: VocabularyEntry[];
  reviewStatuses: VocabularyEntry[];
  currencies: string[];
  settings: { publishUnqualified: boolean; publicRecipientNames: boolean; wiseConnected: boolean };
}

export const formatEntryNumber = (number: number) => `EXP-${number}`;

/** The record types that have a detail page with a history. */
export type HistoryEntityType = "person" | "organization" | "treasury_entry" | "service" | "access_grant" | "admin_user";

export type HistoryFieldKind = "text" | "email" | "url" | "number" | "date" | "datetime" | "boolean" | "select" | "relation";
export type HistoryValue = string | number | boolean | null | { key: string; label: string } | { id: string; label: string }[];

/** One changed field of a history event (old struck through → new). */
export interface HistoryChange {
  field: string;
  label: string;
  kind: HistoryFieldKind;
  privacy?: "contact" | "private_note";
  before: HistoryValue;
  after: HistoryValue;
  /** Contact details the viewer's role may not read: shown masked (s•••@example.org). */
  masked?: true;
  /** A private note: never shown, only that it changed. */
  redacted?: true;
}

export type HistoryAction =
  | "created"
  | "imported"
  | "duplicated"
  | "updated"
  | "archived"
  | "restored"
  | "deleted"
  | "comment_added"
  | "comment_edited"
  | "comment_deleted"
  | "viewed"
  // Access (on the person, the account and the service) and accounts (Delivery 2).
  | "access_granted"
  | "access_changed"
  | "access_revoked"
  | "invited"
  | "activated"
  | "link_created"
  | "password_changed"
  | "email_changed"
  | "deactivated"
  | "reactivated"
  | "permission_denied";

export interface HistoryItem {
  id: string;
  kind: "event" | "view";
  action: HistoryAction;
  occurredAt: string;
  actor: { type: "admin" | "automation"; label: string };
  changes: HistoryChange[];
  meta: { label?: string; collection?: string; importSource?: string; duplicatedFrom?: { id: string; label: string }; body?: string; origin?: string; [key: string]: unknown };
  comment?: { id: string; body: string; current: string; mine: boolean; deleted: boolean };
}

export interface RecordHistory {
  total: number;
  views: number;
  edits: number;
  createdBy: { label: string; at: string } | null;
  lastEditedBy: { label: string; at: string } | null;
  items: HistoryItem[];
}

export interface HistoryListItem extends HistoryItem {
  /** `title`: the record's current title (or its last known one); `exists`: false once it's deleted. */
  entity: { type: string; id: string; label: string; title: string; exists: boolean };
}
