import { demoMarkers } from "../demo-markers.js";
import { vocabularyMatcher, type Vocabulary } from "../taxonomy/taxonomy-plan.js";
import type { SourceTreasuryEntry, TreasurySource } from "./treasury-source.js";

/**
 * The Notion Treasury import rules as one pure function: Notion rows + what
 * the database holds → what to create, update, flag, skip
 * (docs/architecture/data-model.md §4.5, roadmap 1b). No I/O.
 *
 * - Expenses only: donations come from Stripe (native) — Notion donation
 *   rows are skipped and listed, never written.
 * - Demo rows (DEMO- ids, example.org, "Fictional sample") are skipped and
 *   listed. Today all 40 rows are demo.
 * - Matching by Notion page id only. A row the importer wrote is
 *   `managed_by = notion`; a native row (Stripe, admin) is never touched,
 *   even if it somehow carries the page id.
 * - Amounts are whole currency units in Notion (decided): × 100 → minor
 *   units, gross = net, fee 0 — every imported row is flagged fee_unknown.
 * - Expense types by label (Notion's 10, seeded); unknown ones reported.
 * - Recipient person / organization by Notion page id; unresolved → left
 *   empty and flagged; both set → the organization is kept, flagged.
 * - Database rules are kept, never broken: a qualified (or not-required)
 *   expense needs exactly one recipient — without one it's imported as
 *   "Pending documents" and flagged; a published reviewed entry needs a
 *   public description — without one it's imported unpublished and
 *   flagged; while `treasury.publish_unqualified` is off, an unqualified
 *   entry is imported unpublished and flagged.
 * - Transaction ID (EXP-n) sets entry_number; a number another row holds
 *   (e.g. a Stripe donation) is flagged and left to the database.
 * - Rows Notion no longer has are reported, never deleted.
 */

export interface DbTreasuryEntry {
  id: string;
  notionPageId: string | null;
  managedBy: string;
  entryNumber: number;
  entryType: string;
  name: string;
  currency: string;
  grossAmount: number;
  feeAmount: number | null;
  netAmount: number | null;
  cadence: string;
  source: string;
  externalTransactionId: string | null;
  sourceAccountId: string | null;
  occurredOn: string;
  occurredAt: string | null;
  recipientPersonId: string | null;
  recipientOrganizationId: string | null;
  reviewStatusKey: string;
  reviewedAt: string | null;
  publicationStatus: string;
  publishedAt: string | null;
  publicDescription: string | null;
  internalNote: string | null;
  importedAt: string | null;
  expenseTypeKeys: string[];
}

export interface TreasurySnapshot {
  entries: DbTreasuryEntry[];
  expenseTypes: Vocabulary[];
  reviewStatuses: Vocabulary[];
  /** Notion page id → row id, for recipients. */
  peopleByPage: Map<string, string>;
  organizationsByPage: Map<string, string>;
  /** The treasury.publish_unqualified setting. */
  publishUnqualified: boolean;
  /** When the run happens (imported_at of new rows without Notion's value). */
  now: Date;
}

export type TreasuryIssueCode =
  | "demo_record"
  | "donation_row"
  | "unknown_entry_type"
  | "native_entry_page"
  | "missing_amount"
  | "invalid_amount"
  | "unknown_currency"
  | "missing_date"
  | "fee_unknown"
  | "empty_name"
  | "value_too_long"
  | "unknown_cadence"
  | "unknown_source"
  | "unknown_expense_type"
  | "unknown_review_status"
  | "unknown_publication_status"
  | "unresolved_recipient"
  | "two_recipients"
  | "review_downgraded"
  | "published_without_description"
  | "unpublished_unqualified"
  | "external_id_taken"
  | "number_taken"
  | "reviewer_not_mapped"
  | "missing_from_notion";

export type TreasuryIssueKind = "skipped" | "flagged" | "value_skipped" | "missing";

export interface TreasuryIssue {
  kind: TreasuryIssueKind;
  code: TreasuryIssueCode;
  name: string;
  pageId?: string;
  dbId?: string;
  detail: string;
}

/** What the importer writes for an expense (synced fields; the rest of the row is native). */
export interface TreasuryValues {
  notionPageId: string;
  name: string;
  currency: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  cadence: "one_off" | "monthly" | "yearly";
  source: "stripe" | "wise" | "manual";
  externalTransactionId: string | null;
  sourceAccountId: string | null;
  occurredOn: string;
  occurredAt: string | null;
  recipientPersonId: string | null;
  recipientOrganizationId: string | null;
  reviewStatusKey: string;
  reviewedAt: string | null;
  publicationStatus: "published" | "unpublished";
  publishedAt: string | null;
  publicDescription: string | null;
  internalNote: string | null;
  importedAt: string;
  expenseTypeKeys: string[];
}

export interface PlannedEntry {
  pageId: string;
  action: "create" | "update" | "unchanged";
  dbId: string | null;
  values: TreasuryValues;
  /** entry_number to set; null = keep the current one (update) or let the database assign one (create). */
  number: number | null;
  changes: string[];
}

export interface TreasuryPlan {
  entries: PlannedEntry[];
  issues: TreasuryIssue[];
  totals: { notion: number; demo: number; donations: number; expenses: number };
  ignored: { unreadProperties: string[] };
}

export interface TreasuryCounts {
  created: number;
  updated: number;
  unchanged: number;
  /** Imported rows with at least one flag. */
  flagged: number;
  skipped: number;
  demo: number;
  donations: number;
  missing: number;
  changes: number;
}

const CURRENCIES = new Set(["EUR", "USD", "CHF"]);
const CADENCES: Record<string, TreasuryValues["cadence"]> = { "one-off": "one_off", "one off": "one_off", monthly: "monthly", yearly: "yearly" };
const SOURCES: Record<string, TreasuryValues["source"]> = { wise: "wise", stripe: "stripe", manual: "manual" };
/** Notion's review options (with the "Needs information" wording its description uses). */
const REVIEW_ALIASES: Record<string, string> = { "needs information": "pending_documents", "pending documents": "pending_documents" };
const REVIEWED = new Set(["qualified", "not_required"]);

/** A Notion date or date-time → the calendar day as written in Notion (its own offset). */
const dayOf = (value: string) => value.slice(0, 10);
/** A Notion date-time → ISO UTC; a plain date → null (no exact time). */
const momentOf = (value: string) => (value.includes("T") ? new Date(value).toISOString() : null);
/** A Notion date or date-time → ISO UTC (a plain date at 00:00 UTC). */
const instantOf = (value: string) => new Date(value.includes("T") ? value : `${value}T00:00:00Z`).toISOString();
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(new Date(value.includes("T") ? value : `${value}T00:00:00Z`).getTime());

const COMPARED: (keyof TreasuryValues)[] = [
  "name",
  "currency",
  "grossAmount",
  "feeAmount",
  "netAmount",
  "cadence",
  "source",
  "externalTransactionId",
  "sourceAccountId",
  "occurredOn",
  "occurredAt",
  "recipientPersonId",
  "recipientOrganizationId",
  "reviewStatusKey",
  "reviewedAt",
  "publicationStatus",
  "publishedAt",
  "publicDescription",
  "internalNote",
];

export function planTreasuryImport(source: TreasurySource, snapshot: TreasurySnapshot): TreasuryPlan {
  const issues: TreasuryIssue[] = [];
  const entries: PlannedEntry[] = [];
  const expenseType = vocabularyMatcher(snapshot.expenseTypes);
  const reviewStatus = vocabularyMatcher(snapshot.reviewStatuses);
  const byPage = new Map(snapshot.entries.filter((entry) => entry.notionPageId).map((entry) => [entry.notionPageId!, entry]));
  const numberOwner = new Map(snapshot.entries.map((entry) => [entry.entryNumber, entry]));
  const externalOwner = new Map(
    snapshot.entries.filter((entry) => entry.externalTransactionId).map((entry) => [`${entry.source}:${entry.externalTransactionId}`, entry]),
  );
  const totals = { notion: source.entries.length, demo: 0, donations: 0, expenses: 0 };
  const claimedNumbers = new Map<number, string>();
  const claimedExternal = new Map<string, string>();

  for (const row of source.entries) {
    const label = row.name || (row.number !== null ? `EXP-${row.number}` : row.pageId);
    const issue = (kind: TreasuryIssueKind, code: TreasuryIssueCode, detail: string, dbId?: string) =>
      issues.push({ kind, code, name: label, pageId: row.pageId, ...(dbId ? { dbId } : {}), detail });

    // Counted by type first, so the report says what the rows are (demo ones included).
    const type = row.entryType?.toLowerCase() ?? null;
    if (type === "donation") totals.donations++;
    else if (type === "expense") totals.expenses++;

    const markers = demoMarkers({
      texts: [row.name, row.sourceAccountId, row.externalTransactionId, row.wiseTransactionNumber, row.internalNote, row.publicDescription],
    });
    if (markers.length > 0) {
      totals.demo++;
      issue("skipped", "demo_record", `demo row (${markers.join(", ")}) — not imported`);
      continue;
    }
    if (type === "donation") {
      issue("skipped", "donation_row", "donations come from Stripe (native entries); Notion donation rows are not imported");
      continue;
    }
    if (type !== "expense") {
      issue("skipped", "unknown_entry_type", row.entryType ? `entry type "${row.entryType}" is neither Expense nor Donation` : "no entry type");
      continue;
    }
    const existing = byPage.get(row.pageId);
    if (existing && existing.managedBy !== "notion") {
      issue("skipped", "native_entry_page", `the database row EXP-${existing.entryNumber} is native: the importer never changes native entries`, existing.id);
      continue;
    }

    // Amount: signed whole units (expenses negative) → minor units.
    if (row.netAmount === null) {
      issue("skipped", "missing_amount", "no Net amount");
      continue;
    }
    const cents = Math.round(row.netAmount * 100);
    if (row.netAmount >= 0 || Math.abs(row.netAmount * 100 - cents) > 1e-6) {
      issue("skipped", "invalid_amount", `Net amount ${row.netAmount} must be negative for an expense, with at most two decimals`);
      continue;
    }
    if (!row.currency || !CURRENCIES.has(row.currency.toUpperCase())) {
      issue("skipped", "unknown_currency", row.currency ? `currency "${row.currency}" is not EUR, USD or CHF` : "no currency");
      continue;
    }
    if (!row.transactionDate || !validDate(row.transactionDate)) {
      issue("skipped", "missing_date", row.transactionDate ? `Transaction date "${row.transactionDate}" is not a date` : "no Transaction date");
      continue;
    }
    const flags: string[] = [];
    const flag = (code: TreasuryIssueCode, detail: string) => {
      issue("flagged", code, detail, existing?.id);
      flags.push(code);
    };
    const skipValue = (code: TreasuryIssueCode, detail: string) => issue("value_skipped", code, detail, existing?.id);
    flag("fee_unknown", "Notion has the net amount only: imported with gross = net and fee 0");

    let name = row.name;
    if (!name) {
      name = row.number !== null ? `Expense EXP-${row.number}` : "Expense";
      flag("empty_name", `no Name: imported as "${name}"`);
    } else if (name.length > 200) {
      name = name.slice(0, 200);
      flag("value_too_long", "Name longer than 200 characters: shortened");
    }

    let cadence: TreasuryValues["cadence"] = "one_off";
    if (row.cadence) {
      const mapped = CADENCES[row.cadence.toLowerCase()];
      if (mapped) cadence = mapped;
      else skipValue("unknown_cadence", `cadence "${row.cadence}" unknown: imported as one-off`);
    }

    let entrySource: TreasuryValues["source"] = "manual";
    if (row.source && SOURCES[row.source.toLowerCase()]) entrySource = SOURCES[row.source.toLowerCase()]!;
    else skipValue("unknown_source", row.source ? `source "${row.source}" unknown: imported as manual` : "no Source: imported as manual");

    let externalId = entrySource === "wise" && row.wiseTransactionNumber ? row.wiseTransactionNumber : row.externalTransactionId;
    if (externalId && externalId.length > 255) {
      skipValue("value_too_long", "External transaction ID longer than 255 characters: left empty");
      externalId = null;
    }
    if (externalId) {
      const key = `${entrySource}:${externalId}`;
      const owner = externalOwner.get(key);
      const claimed = claimedExternal.get(key);
      if ((owner && owner.notionPageId !== row.pageId) || (claimed && claimed !== row.pageId)) {
        flag("external_id_taken", `${entrySource} transaction id ${externalId} is already used by another entry: left empty`);
        externalId = null;
      } else claimedExternal.set(key, row.pageId);
    }
    let sourceAccountId = row.sourceAccountId;
    if (sourceAccountId && sourceAccountId.length > 255) {
      skipValue("value_too_long", "Source account ID longer than 255 characters: left empty");
      sourceAccountId = null;
    }

    const expenseTypeKeys: string[] = [];
    for (const label of row.expenseTypes) {
      const key = expenseType(label);
      if (key) {
        if (!expenseTypeKeys.includes(key)) expenseTypeKeys.push(key);
      } else skipValue("unknown_expense_type", `expense type "${label}" is not one of the 10 types`);
    }

    // Recipient: one person or one organization.
    const person = row.recipientPersonPageIds[0];
    const organization = row.recipientOrganizationPageIds[0];
    let recipientPersonId = person ? (snapshot.peopleByPage.get(person) ?? null) : null;
    const recipientOrganizationId = organization ? (snapshot.organizationsByPage.get(organization) ?? null) : null;
    if (person && !recipientPersonId) flag("unresolved_recipient", "the recipient person isn't in the database (import People first): left empty");
    if (organization && !recipientOrganizationId) flag("unresolved_recipient", "the recipient organization isn't in the database (import Organizations first): left empty");
    if (row.recipientPersonPageIds.length > 1 || row.recipientOrganizationPageIds.length > 1) {
      flag("two_recipients", "more than one recipient in Notion: the first one is kept");
    }
    if (recipientPersonId && recipientOrganizationId) {
      flag("two_recipients", "both a recipient person and organization: the organization is kept");
      recipientPersonId = null;
    }

    let reviewStatusKey = "unqualified";
    if (row.reviewStatus) {
      const key = REVIEW_ALIASES[row.reviewStatus.toLowerCase()] ?? reviewStatus(row.reviewStatus);
      if (key) reviewStatusKey = key;
      else skipValue("unknown_review_status", `review status "${row.reviewStatus}" unknown: imported as Unqualified`);
    }
    if (REVIEWED.has(reviewStatusKey) && !recipientPersonId && !recipientOrganizationId) {
      flag("review_downgraded", `"${row.reviewStatus}" needs exactly one recipient in the database: imported as Pending documents`);
      reviewStatusKey = "pending_documents";
    }
    if (row.reviewedByCount > 0) skipValue("reviewer_not_mapped", "Reviewed by (a person in Notion) isn't an admin: not stored");

    let publicationStatus: TreasuryValues["publicationStatus"] = "unpublished";
    if (row.publicationStatus) {
      const status = row.publicationStatus.toLowerCase();
      if (status === "published" || status === "unpublished") publicationStatus = status;
      else skipValue("unknown_publication_status", `publication status "${row.publicationStatus}" unknown: imported as Unpublished`);
    }
    let publicDescription = row.publicDescription;
    if (publicDescription && publicDescription.length > 2000) {
      publicDescription = publicDescription.slice(0, 2000);
      flag("value_too_long", "Public description longer than 2000 characters: shortened");
    }
    let internalNote = row.internalNote;
    if (internalNote && internalNote.length > 5000) {
      internalNote = internalNote.slice(0, 5000);
      flag("value_too_long", "Internal note longer than 5000 characters: shortened");
    }
    if (publicationStatus === "published" && !REVIEWED.has(reviewStatusKey) && !snapshot.publishUnqualified) {
      flag("unpublished_unqualified", "published in Notion but not qualified (treasury.publish_unqualified is off): imported unpublished");
      publicationStatus = "unpublished";
    }
    if (publicationStatus === "published" && REVIEWED.has(reviewStatusKey) && !publicDescription) {
      flag("published_without_description", "a published, reviewed entry needs a public description: imported unpublished");
      publicationStatus = "unpublished";
    }
    const publishedAt =
      publicationStatus === "published" ? instantOf(row.publishedOn && validDate(row.publishedOn) ? row.publishedOn : row.transactionDate) : null;

    // Entry number (EXP-n).
    let number: number | null = row.number;
    if (number !== null) {
      const owner = numberOwner.get(number);
      const claimed = claimedNumbers.get(number);
      if ((owner && owner.notionPageId !== row.pageId) || (claimed && claimed !== row.pageId)) {
        flag("number_taken", `EXP-${number} is already used by another entry (e.g. a Stripe donation): ${existing ? "number kept" : "the database assigns one"}`);
        number = null;
      } else claimedNumbers.set(number, row.pageId);
    }

    const values: TreasuryValues = {
      notionPageId: row.pageId,
      name,
      currency: row.currency.toUpperCase(),
      grossAmount: cents,
      feeAmount: 0,
      netAmount: cents,
      cadence,
      source: entrySource,
      externalTransactionId: externalId,
      sourceAccountId,
      occurredOn: dayOf(row.transactionDate),
      occurredAt: momentOf(row.transactionDate),
      recipientPersonId,
      recipientOrganizationId,
      reviewStatusKey,
      reviewedAt: row.reviewedOn && validDate(row.reviewedOn) ? instantOf(row.reviewedOn) : null,
      publicationStatus,
      publishedAt,
      publicDescription,
      internalNote,
      importedAt: row.importedAt && validDate(row.importedAt) ? instantOf(row.importedAt) : (existing?.importedAt ?? snapshot.now.toISOString()),
      expenseTypeKeys,
    };

    if (!existing) {
      entries.push({ pageId: row.pageId, action: "create", dbId: null, values, number, changes: [] });
      continue;
    }
    const changes: string[] = COMPARED.filter((field) => normalize(values[field]) !== normalize(existing[field as keyof DbTreasuryEntry]));
    if ([...values.expenseTypeKeys].sort().join(",") !== [...existing.expenseTypeKeys].sort().join(",")) changes.push("expenseTypes");
    if (number !== null && number !== existing.entryNumber) changes.push("entryNumber");
    entries.push({
      pageId: row.pageId,
      action: changes.length > 0 ? "update" : "unchanged",
      dbId: existing.id,
      values,
      number: number !== null && number !== existing.entryNumber ? number : null,
      changes,
    });
  }

  const seen = new Set(source.entries.map((row) => row.pageId));
  for (const entry of snapshot.entries) {
    if (entry.managedBy === "notion" && entry.notionPageId && !seen.has(entry.notionPageId)) {
      issues.push({
        kind: "missing",
        code: "missing_from_notion",
        name: entry.name,
        dbId: entry.id,
        detail: `EXP-${entry.entryNumber} is no longer in Notion: kept (never deleted)`,
      });
    }
  }
  return { entries, issues, totals, ignored: { unreadProperties: source.layout.unread } };
}

const normalize = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toISOString();
  return String(value);
};

export function countTreasuryPlan(plan: TreasuryPlan): TreasuryCounts {
  const by = (action: PlannedEntry["action"]) => plan.entries.filter((entry) => entry.action === action).length;
  const imported = new Set(plan.entries.map((entry) => entry.pageId));
  const flaggedPages = new Set(plan.issues.filter((issue) => issue.kind === "flagged" && issue.pageId && imported.has(issue.pageId)).map((issue) => issue.pageId));
  const counts = {
    created: by("create"),
    updated: by("update"),
    unchanged: by("unchanged"),
    flagged: flaggedPages.size,
    skipped: plan.issues.filter((issue) => issue.kind === "skipped").length,
    demo: plan.totals.demo,
    donations: plan.totals.donations,
    missing: plan.issues.filter((issue) => issue.kind === "missing").length,
    changes: 0,
  };
  counts.changes = counts.created + counts.updated;
  return counts;
}

/** Apply is refused when every Notion row is a demo row: nothing real to import yet. */
export function treasuryOnlyDemoRefusal(plan: TreasuryPlan): string | undefined {
  if (plan.totals.notion > 0 && plan.totals.demo === plan.totals.notion) {
    return `Refusing to apply: all ${plan.totals.notion} Notion Treasury rows are demo rows (DEMO- ids, example.org, "Fictional sample"). Nothing real to import yet — run a dry run to review.`;
  }
  return undefined;
}

export type { SourceTreasuryEntry };
