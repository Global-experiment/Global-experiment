import { describe, expect, it } from "vitest";
import { countTreasuryPlan, planTreasuryImport, treasuryOnlyDemoRefusal, type DbTreasuryEntry, type TreasurySnapshot } from "./treasury-plan.js";
import type { SourceTreasuryEntry, TreasurySource } from "./treasury-source.js";

// Test fixtures only.
const page = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const PERSON_PAGE = page(900);
const ORG_PAGE = page(901);

const row = (n: number, values: Partial<SourceTreasuryEntry> = {}): SourceTreasuryEntry => ({
  pageId: page(n),
  createdTime: "2026-10-01T10:00:00.000Z",
  number: n,
  name: `Hosting invoice ${n}`,
  entryType: "Expense",
  source: "Wise",
  transactionDate: "2026-10-01",
  netAmount: -120.5,
  currency: "EUR",
  cadence: "Monthly",
  expenseTypes: ["Hosting and infrastructure"],
  recipientPersonPageIds: [],
  recipientOrganizationPageIds: [ORG_PAGE],
  reviewStatus: "Qualified",
  reviewedOn: "2026-10-02",
  reviewedByCount: 0,
  publicationStatus: "Published",
  publishedOn: "2026-10-03T09:30:00.000+02:00",
  publicDescription: "Monthly hosting of the platform",
  internalNote: null,
  sourceAccountId: null,
  externalTransactionId: `TRANSFER-${n}`,
  wiseTransactionNumber: null,
  importedAt: null,
  ...values,
});

const source = (entries: SourceTreasuryEntry[]): TreasurySource => ({ entries, layout: { names: {}, unread: ["Expertise"], absent: [] } });

const snapshot = (values: Partial<TreasurySnapshot> = {}): TreasurySnapshot => ({
  entries: [],
  expenseTypes: [
    { key: "hosting_and_infrastructure", label: "Hosting and infrastructure" },
    { key: "legal_and_compliance", label: "Legal and compliance" },
  ],
  reviewStatuses: [
    { key: "unqualified", label: "Unqualified" },
    { key: "pending_documents", label: "Pending documents" },
    { key: "qualified", label: "Qualified" },
    { key: "not_required", label: "Not required" },
  ],
  peopleByPage: new Map([[PERSON_PAGE, "person-1"]]),
  organizationsByPage: new Map([[ORG_PAGE, "org-1"]]),
  publishUnqualified: false,
  now: new Date("2026-10-15T12:00:00Z"),
  ...values,
});

const codes = (plan: ReturnType<typeof planTreasuryImport>, pageId?: string) =>
  plan.issues.filter((issue) => !pageId || issue.pageId === pageId).map((issue) => `${issue.kind}:${issue.code}`);

describe("Treasury import plan", () => {
  it("imports an expense: cents, gross = net, fee 0 (flagged), types, recipient, review and publication", () => {
    const plan = planTreasuryImport(source([row(7)]), snapshot());
    expect(plan.entries).toHaveLength(1);
    const [entry] = plan.entries;
    expect(entry).toMatchObject({ action: "create", number: 7, dbId: null });
    expect(entry!.values).toMatchObject({
      notionPageId: page(7),
      name: "Hosting invoice 7",
      currency: "EUR",
      grossAmount: -12050,
      feeAmount: 0,
      netAmount: -12050,
      cadence: "monthly",
      source: "wise",
      externalTransactionId: "TRANSFER-7",
      occurredOn: "2026-10-01",
      occurredAt: null,
      recipientOrganizationId: "org-1",
      recipientPersonId: null,
      reviewStatusKey: "qualified",
      reviewedAt: "2026-10-02T00:00:00.000Z",
      publicationStatus: "published",
      publishedAt: "2026-10-03T07:30:00.000Z",
      publicDescription: "Monthly hosting of the platform",
      importedAt: "2026-10-15T12:00:00.000Z",
      expenseTypeKeys: ["hosting_and_infrastructure"],
    });
    expect(codes(plan)).toEqual(["flagged:fee_unknown"]);
    expect(countTreasuryPlan(plan)).toMatchObject({ created: 1, flagged: 1, changes: 1 });
  });

  it("skips demo rows and donation rows (donations come from Stripe), and refuses an all-demo apply", () => {
    const demo = row(1, { sourceAccountId: "DEMO-EXPENSE-WISE-EUR" });
    const donation = row(2, { entryType: "Donation", netAmount: 25 });
    const plan = planTreasuryImport(source([demo, donation]), snapshot());
    expect(plan.entries).toEqual([]);
    expect(codes(plan)).toEqual(["skipped:demo_record", "skipped:donation_row"]);
    expect(plan.totals).toEqual({ notion: 2, demo: 1, donations: 1, expenses: 1 });
    expect(treasuryOnlyDemoRefusal(plan)).toBeUndefined();
    expect(treasuryOnlyDemoRefusal(planTreasuryImport(source([demo]), snapshot()))).toMatch(/all 1 Notion Treasury rows are demo rows/);
  });

  it("skips rows it can't make a valid expense of", () => {
    const plan = planTreasuryImport(
      source([
        row(1, { entryType: null }),
        row(2, { netAmount: null }),
        row(3, { netAmount: 50 }),
        row(4, { netAmount: -10.005 }),
        row(5, { currency: "GBP" }),
        row(6, { transactionDate: null }),
        row(8, { transactionDate: "next week" }),
      ]),
      snapshot(),
    );
    expect(plan.entries).toEqual([]);
    expect(codes(plan)).toEqual([
      "skipped:unknown_entry_type",
      "skipped:missing_amount",
      "skipped:invalid_amount",
      "skipped:invalid_amount",
      "skipped:unknown_currency",
      "skipped:missing_date",
      "skipped:missing_date",
    ]);
  });

  it("never touches a native entry, even one carrying the Notion page id", () => {
    const native: DbTreasuryEntry = dbEntry({ id: "native-1", notionPageId: page(7), managedBy: "native", entryNumber: 3 });
    const plan = planTreasuryImport(source([row(7)]), snapshot({ entries: [native] }));
    expect(plan.entries).toEqual([]);
    expect(codes(plan)).toEqual(["skipped:native_entry_page"]);
  });

  it("keeps database rules: one recipient for a reviewed expense, a description to publish, publish_unqualified off", () => {
    const plan = planTreasuryImport(
      source([
        row(1, { recipientOrganizationPageIds: [] }),
        row(2, { recipientOrganizationPageIds: [page(999)] }),
        row(3, { publicDescription: null }),
        row(4, { reviewStatus: "Unqualified" }),
        row(5, { reviewStatus: null, publicationStatus: "Unpublished" }),
        row(6, { recipientPersonPageIds: [PERSON_PAGE], recipientOrganizationPageIds: [ORG_PAGE] }),
      ]),
      snapshot(),
    );
    const values = (n: number) => plan.entries.find((entry) => entry.pageId === page(n))!.values;
    expect(values(1)).toMatchObject({ reviewStatusKey: "pending_documents", publicationStatus: "unpublished" });
    expect(codes(plan, page(1))).toEqual(["flagged:fee_unknown", "flagged:review_downgraded", "flagged:unpublished_unqualified"]);
    expect(codes(plan, page(2))).toEqual(["flagged:fee_unknown", "flagged:unresolved_recipient", "flagged:review_downgraded", "flagged:unpublished_unqualified"]);
    expect(values(3)).toMatchObject({ reviewStatusKey: "qualified", publicationStatus: "unpublished", publishedAt: null });
    expect(codes(plan, page(3))).toContain("flagged:published_without_description");
    expect(values(4)).toMatchObject({ reviewStatusKey: "unqualified", publicationStatus: "unpublished" });
    expect(values(5)).toMatchObject({ reviewStatusKey: "unqualified", publicationStatus: "unpublished" });
    expect(values(6)).toMatchObject({ recipientOrganizationId: "org-1", recipientPersonId: null });
    expect(codes(plan, page(6))).toContain("flagged:two_recipients");

    // With treasury.publish_unqualified on, an unqualified expense stays published.
    const open = planTreasuryImport(source([row(4, { reviewStatus: "Unqualified" })]), snapshot({ publishUnqualified: true }));
    expect(open.entries[0]!.values).toMatchObject({ reviewStatusKey: "unqualified", publicationStatus: "published" });
  });

  it("maps values, reports what it can't, and never invents data", () => {
    const plan = planTreasuryImport(
      source([
        row(1, {
          name: "",
          cadence: "Weekly",
          source: null,
          expenseTypes: ["Hosting and infrastructure", "Parties"],
          reviewStatus: "Needs information",
          reviewedByCount: 1,
          transactionDate: "2026-10-01T14:07:00.000+02:00",
          wiseTransactionNumber: "W-1",
          internalNote: "x".repeat(5001),
        }),
      ]),
      snapshot(),
    );
    const [entry] = plan.entries;
    expect(entry!.values).toMatchObject({
      name: "Expense EXP-1",
      cadence: "one_off",
      source: "manual",
      expenseTypeKeys: ["hosting_and_infrastructure"],
      reviewStatusKey: "pending_documents",
      occurredOn: "2026-10-01",
      occurredAt: "2026-10-01T12:07:00.000Z",
      externalTransactionId: "TRANSFER-1", // the Wise number is used only for source = wise
    });
    expect(entry!.values.internalNote).toHaveLength(5000);
    expect(codes(plan)).toEqual([
      "flagged:fee_unknown",
      "flagged:empty_name",
      "value_skipped:unknown_cadence",
      "value_skipped:unknown_source",
      "value_skipped:unknown_expense_type",
      "value_skipped:reviewer_not_mapped",
      "flagged:value_too_long",
      "flagged:unpublished_unqualified",
    ]);
    const wise = planTreasuryImport(source([row(2, { wiseTransactionNumber: "W-2" })]), snapshot());
    expect(wise.entries[0]!.values.externalTransactionId).toBe("W-2");
  });

  it("leaves numbers and transaction ids another entry holds to that entry", () => {
    const stripe = dbEntry({ id: "stripe-1", managedBy: "native", entryNumber: 7, source: "wise", externalTransactionId: "TRANSFER-8" });
    const plan = planTreasuryImport(source([row(7), row(8)]), snapshot({ entries: [stripe] }));
    expect(plan.entries.map((entry) => [entry.number, entry.values.externalTransactionId])).toEqual([
      [null, "TRANSFER-7"],
      [8, null],
    ]);
    expect(codes(plan)).toEqual(["flagged:fee_unknown", "flagged:number_taken", "flagged:fee_unknown", "flagged:external_id_taken"]);
  });

  it("updates only what changed, is idempotent, and reports rows Notion no longer has", () => {
    const first = planTreasuryImport(source([row(7)]), snapshot());
    const stored = dbEntry({ ...asDb(first.entries[0]!.values), id: "e-7", entryNumber: 7, managedBy: "notion", importedAt: "2026-10-15T12:00:00.000Z" });
    const same = planTreasuryImport(source([row(7)]), snapshot({ entries: [stored] }));
    expect(same.entries[0]).toMatchObject({ action: "unchanged", changes: [] });
    expect(countTreasuryPlan(same).changes).toBe(0);

    const edited = planTreasuryImport(source([row(7, { netAmount: -99, expenseTypes: ["Legal and compliance"] })]), snapshot({ entries: [stored] }));
    expect(edited.entries[0]).toMatchObject({ action: "update", dbId: "e-7", changes: ["grossAmount", "netAmount", "expenseTypes"] });

    const gone = planTreasuryImport(source([]), snapshot({ entries: [stored] }));
    expect(codes(gone)).toEqual(["missing:missing_from_notion"]);
    expect(gone.entries).toEqual([]);
  });
});

function dbEntry(values: Partial<DbTreasuryEntry>): DbTreasuryEntry {
  return {
    id: "row",
    notionPageId: null,
    managedBy: "native",
    entryNumber: 1,
    entryType: "expense",
    name: "x",
    currency: "EUR",
    grossAmount: -100,
    feeAmount: 0,
    netAmount: -100,
    cadence: "one_off",
    source: "manual",
    externalTransactionId: null,
    sourceAccountId: null,
    occurredOn: "2026-10-01",
    occurredAt: null,
    recipientPersonId: null,
    recipientOrganizationId: null,
    reviewStatusKey: "unqualified",
    reviewedAt: null,
    publicationStatus: "unpublished",
    publishedAt: null,
    publicDescription: null,
    internalNote: null,
    importedAt: null,
    expenseTypeKeys: [],
    ...values,
  };
}

function asDb(values: ReturnType<typeof planTreasuryImport>["entries"][number]["values"]): Partial<DbTreasuryEntry> {
  const { expenseTypeKeys, ...rest } = values;
  return { ...rest, entryType: "expense", expenseTypeKeys };
}
