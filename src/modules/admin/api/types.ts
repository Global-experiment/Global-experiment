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

export type PersonCompletenessField = "State" | "Source" | "Personal note" | "Expertise";
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
  personalNote: string | null;
  doNotContact: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin: string | null;
  x: string | null;
  otherContact: string | null;
  wiseRecipientId: string | null;
  /** Next planned follow-up, YYYY-MM-DD. */
  nextFollowupOn: string | null;
  /** The former "last follow-up" value, kept as-is (read-only). */
  lastFollowupAtLegacy: string | null;
  /** Next follow-up before today, and neither Rejected nor Do not contact. */
  followUpOverdue: boolean;
  missing: PersonCompletenessField[];
  createdAt: string;
  updatedAt: string;
  organizations: EntityRef[];
  expertise: ExpertiseRef[];
}

export interface PersonInput {
  name?: string;
  stateKey?: string | null;
  sourceKey?: string | null;
  personalNote?: string | null;
  doNotContact?: boolean;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  x?: string | null;
  otherContact?: string | null;
  wiseRecipientId?: string | null;
  nextFollowupOn?: string | null;
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
}

export const formatPersonNumber = (n: number) => `PER-${n}`;
export const formatOrgNumber = (n: number) => `ORG-${n}`;

export interface PeopleOptions {
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

export interface AdminPrincipal {
  id: string;
  email: string;
  role: string;
  /** Null until set on /admin/profile. */
  displayName: string | null;
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
