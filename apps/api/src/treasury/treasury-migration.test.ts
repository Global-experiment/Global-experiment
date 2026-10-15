import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Migration 0006 (docs/architecture/data-model.md §4, roadmap module 1) on an
 * empty database and on a database still at 0005 with existing rows, then
 * every check, trigger and the public view — through Drizzle's own migrator,
 * as production runs it.
 */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));
const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
const AT_0005 = journal.entries.findIndex((entry) => entry.tag.startsWith("0006_"));

const opened: PGlite[] = [];
const tempDirs: string[] = [];
afterEach(async () => {
  for (const client of opened.splice(0)) await client.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function databaseAt(count: number): Promise<PGlite> {
  const client = new PGlite();
  opened.push(client);
  const dir = mkdtempSync(join(tmpdir(), "ge-migrations-"));
  tempDirs.push(dir);
  cpSync(join(MIGRATIONS, "meta"), join(dir, "meta"), { recursive: true });
  const entries = journal.entries.slice(0, count);
  for (const { tag } of entries) cpSync(join(MIGRATIONS, `${tag}.sql`), join(dir, `${tag}.sql`));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  await migrate(drizzle(client), { migrationsFolder: dir });
  return client;
}

const latest = () => databaseAt(journal.entries.length);
const rows = async <T = Record<string, unknown>>(client: PGlite, query: string, params: unknown[] = []) => (await client.query<T>(query, params)).rows;
const count = async (client: PGlite, table: string) => (await rows<{ n: number }>(client, `select count(*)::int as n from ${table}`))[0]!.n;

const PERSON = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG = "bbbbbbbb-0000-4000-8000-000000000001";

/** Inserts one entry; columns default to a valid native Stripe donation. */
async function insertEntry(client: PGlite, values: Record<string, unknown> = {}): Promise<string> {
  const row: Record<string, unknown> = {
    entry_type: "donation",
    name: "Anonymous donation",
    currency: "EUR",
    gross_amount: 1000,
    source: "stripe",
    occurred_on: "2026-10-15",
    ...values,
  };
  const columns = Object.keys(row);
  const result = await rows<{ id: string }>(
    client,
    `insert into treasury_entries (${columns.join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return result[0]!.id;
}

describe("migration 0006 — treasury and donations", () => {
  it("applies cleanly on an empty database and seeds only the Treasury vocabularies", async () => {
    const client = await latest();

    expect(await rows(client, "select key, label from treasury_review_statuses order by sort_order")).toEqual([
      { key: "unqualified", label: "Unqualified" },
      { key: "pending_documents", label: "Pending documents" },
      { key: "qualified", label: "Qualified" },
      { key: "not_required", label: "Not required" },
    ]);
    expect((await rows<{ key: string }>(client, "select key from treasury_expense_types order by sort_order")).map((row) => row.key)).toEqual([
      "legal_and_compliance",
      "accounting_and_administration",
      "banking_and_payment_processing",
      "software_and_subscriptions",
      "hosting_and_infrastructure",
      "development_and_engineering",
      "design_and_product",
      "research_and_consulting",
      "communication_and_content",
      "general_operations",
    ]);

    // No ledger, event, subscription or settings rows: never demo data, and
    // settings fall back to the environment until an admin saves one.
    for (const table of ["treasury_entries", "treasury_entry_expense_types", "stripe_events", "stripe_subscriptions", "settings"]) {
      expect(await count(client, table), table).toBe(0);
    }

    // Entry numbers start at 1; new entries default to native, one-off, unqualified, unpublished.
    await insertEntry(client);
    expect(await rows(client, "select entry_number, managed_by, cadence, review_status_key, publication_status from treasury_entries")).toEqual([
      { entry_number: 1, managed_by: "native", cadence: "one_off", review_status_key: "unqualified", publication_status: "unpublished" },
    ]);
  });

  it("creates every index the data model lists", async () => {
    const client = await latest();
    const indexes = (await rows<{ indexname: string }>(client, "select indexname from pg_indexes where tablename in ('treasury_entries', 'treasury_entry_expense_types', 'stripe_events', 'stripe_subscriptions', 'settings') order by 1")).map(
      (row) => row.indexname,
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        "treasury_entries_entry_number_unique",
        "treasury_entries_notion_page_id_unique",
        "treasury_entries_source_external_unique",
        "treasury_entries_published_idx",
        "treasury_entries_entry_type_idx",
        "treasury_entries_currency_idx",
        "treasury_entries_recipient_person_idx",
        "treasury_entries_recipient_organization_idx",
        "treasury_entries_adjusts_idx",
        "treasury_entries_recurrence_idx",
        "treasury_entries_fee_pending_idx",
        "treasury_entry_expense_types_type_idx",
        "stripe_events_pending_idx",
        "stripe_events_entry_idx",
        "stripe_subscriptions_status_idx",
      ]),
    );
  });

  it("carries a database at 0005 with existing rows over untouched", async () => {
    const client = await databaseAt(AT_0005);
    await client.exec(`
      INSERT INTO admin_users (id, email, password_hash, display_name) VALUES ('cccccccc-0000-4000-8000-000000000001', 'owner@example.test', 'x', 'Owner');
      INSERT INTO people (id, name) VALUES ('${PERSON}', 'Ada');
      INSERT INTO organizations (id, name) VALUES ('${ORG}', 'First');
    `);
    const before = {
      people: await rows(client, "select * from people"),
      organizations: await rows(client, "select * from organizations"),
      admins: await rows(client, "select * from admin_users"),
    };

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    expect(await rows(client, "select * from people")).toEqual(before.people);
    expect(await rows(client, "select * from organizations")).toEqual(before.organizations);
    expect(await rows(client, "select * from admin_users")).toEqual(before.admins);
    expect(await count(client, "treasury_review_statuses")).toBe(4);
    expect(await count(client, "treasury_entries")).toBe(0);

    // The new foreign keys reach the existing rows.
    await insertEntry(client, {
      entry_type: "expense",
      name: "Hosting",
      gross_amount: -500,
      source: "manual",
      recipient_organization_id: ORG,
      created_by_admin_id: "cccccccc-0000-4000-8000-000000000001",
    });
    await client.exec("insert into settings (key, value, updated_by_admin_id) values ('donations.monthly', 'true', 'cccccccc-0000-4000-8000-000000000001')");
    // Directory rows a ledger entry points at can't be deleted; an admin can (the link clears).
    await expect(client.exec(`delete from organizations where id = '${ORG}'`)).rejects.toThrow(/treasury_entries_recipient_organization_id/);
    await client.exec("delete from admin_users");
    expect(await rows(client, "select created_by_admin_id from treasury_entries")).toEqual([{ created_by_admin_id: null }]);
    expect(await rows(client, "select updated_by_admin_id from settings")).toEqual([{ updated_by_admin_id: null }]);
  });
});

describe("0006 treasury_entries checks", () => {
  const rejects = (client: PGlite, values: Record<string, unknown>, constraint: RegExp) => expect(insertEntry(client, values)).rejects.toThrow(constraint);

  it("enforces signs: donations positive, expenses and refunds negative; fees never negative", async () => {
    const client = await latest();
    await rejects(client, { gross_amount: 0 }, /treasury_entries_gross_sign/);
    await rejects(client, { gross_amount: -100 }, /treasury_entries_gross_sign/);
    await rejects(client, { entry_type: "expense", source: "manual", gross_amount: 100 }, /treasury_entries_gross_sign/);
    await rejects(client, { fee_amount: -1, net_amount: 1001 }, /treasury_entries_fee_not_negative/);
  });

  it("keeps fee and net together and net = gross − fee", async () => {
    const client = await latest();
    await rejects(client, { fee_amount: 59 }, /treasury_entries_fee_and_net_together/);
    await rejects(client, { net_amount: 941 }, /treasury_entries_fee_and_net_together/);
    await rejects(client, { fee_amount: 59, net_amount: 900 }, /treasury_entries_net_is_gross_minus_fee/);
    await insertEntry(client, { fee_amount: 59, net_amount: 941 });
    await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500, fee_amount: 0, net_amount: -500 });
  });

  it("keeps the settlement columns all-or-nothing, in another currency, balanced", async () => {
    const client = await latest();
    const settled = { settlement_currency: "EUR", settlement_gross_amount: 920, settlement_fee_amount: 57, settlement_net_amount: 863, exchange_rate: "0.92" };
    await insertEntry(client, { currency: "USD", ...settled });
    await rejects(client, { currency: "USD", ...settled, exchange_rate: null }, /treasury_entries_settlement_together/);
    await rejects(client, { currency: "EUR", ...settled }, /treasury_entries_settlement_together/); // same currency
    await rejects(client, { currency: "USD", ...settled, settlement_net_amount: 900 }, /treasury_entries_settlement_together/);
    await rejects(client, { currency: "USD", ...settled, exchange_rate: "0" }, /treasury_entries_settlement_together/);
    await rejects(client, { currency: "USD", ...settled, settlement_currency: "eur" }, /treasury_entries_settlement_together/);
  });

  it("knows its vocabularies: type, currency, cadence, source, managed_by, publication", async () => {
    const client = await latest();
    await rejects(client, { entry_type: "transfer" }, /treasury_entries_entry_type_known/);
    await rejects(client, { currency: "GBP" }, /treasury_entries_currency_known/);
    await rejects(client, { cadence: "weekly" }, /treasury_entries_cadence_known/);
    await rejects(client, { source: "paypal" }, /treasury_entries_source_known/);
    await rejects(client, { managed_by: "excel" }, /treasury_entries_managed_by_known/);
    await rejects(client, { publication_status: "draft" }, /treasury_entries_publication_known/);
    await rejects(client, { review_status_key: "approved" }, /treasury_entries_review_status_key/);
    await rejects(client, { name: "   " }, /treasury_entries_name_present/);
  });

  it("refuses yearly donations (decided: no yearly) but allows yearly expenses", async () => {
    const client = await latest();
    await rejects(client, { cadence: "yearly" }, /treasury_entries_no_yearly_donation/);
    await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -1200, cadence: "yearly" });
  });

  it("links a recurrence to monthly donations only", async () => {
    const client = await latest();
    await client.exec("insert into stripe_subscriptions (id, livemode, status, currency, amount, started_at) values ('sub_abc123', true, 'active', 'EUR', 1000, now())");
    await insertEntry(client, { cadence: "monthly", recurrence_id: "sub_abc123", external_transaction_id: "ch_1" });
    await rejects(client, { cadence: "one_off", recurrence_id: "sub_abc123" }, /treasury_entries_recurrence_monthly/);
    await rejects(client, { cadence: "monthly", recurrence_id: "sub_missing" }, /treasury_entries_recurrence_id_stripe_subscriptions_id_fk/);
  });

  it("makes (source, external transaction id) unique — the webhook's last line of defence", async () => {
    const client = await latest();
    await insertEntry(client, { external_transaction_id: "ch_same" });
    await rejects(client, { external_transaction_id: "ch_same" }, /treasury_entries_source_external_unique/);
    await insertEntry(client, { source: "wise", external_transaction_id: "ch_same" }); // other source
    await insertEntry(client); // no external id: manual rows
    await insertEntry(client);
  });

  it("requires a Notion page for Notion-managed rows, unique per page", async () => {
    const client = await latest();
    await rejects(client, { managed_by: "notion" }, /treasury_entries_notion_managed_has_page/);
    const page = "dddddddd-0000-4000-8000-000000000001";
    await insertEntry(client, { managed_by: "notion", notion_page_id: page, source: "manual" });
    await rejects(client, { managed_by: "notion", notion_page_id: page, source: "manual" }, /treasury_entries_notion_page_id_unique/);
  });

  it("applies the recipient rules: expenses only, never both, exactly one once qualified", async () => {
    const client = await latest();
    await client.exec(`insert into people (id, name) values ('${PERSON}', 'Ada'); insert into organizations (id, name) values ('${ORG}', 'First');`);
    const expense = { entry_type: "expense", source: "manual", gross_amount: -500 };
    await rejects(client, { recipient_person_id: PERSON }, /treasury_entries_recipient_rules/); // a donation
    await rejects(client, { ...expense, recipient_person_id: PERSON, recipient_organization_id: ORG }, /treasury_entries_recipient_rules/);
    await insertEntry(client, expense); // unqualified: recipient may be missing
    await rejects(client, { ...expense, review_status_key: "qualified" }, /treasury_entries_recipient_rules/);
    await insertEntry(client, { ...expense, review_status_key: "qualified", recipient_person_id: PERSON });
  });

  it("applies the publication rules", async () => {
    const client = await latest();
    await rejects(client, { publication_status: "published" }, /treasury_entries_published_at_matches/);
    await rejects(client, { published_at: "2026-10-15T10:00:00Z" }, /treasury_entries_published_at_matches/);
    const published = { publication_status: "published", published_at: "2026-10-15T10:00:00Z" };
    // A qualified (or not-required) published row needs its public description…
    await rejects(client, { ...published, review_status_key: "not_required" }, /treasury_entries_published_description/);
    await insertEntry(client, { ...published, review_status_key: "not_required", public_description: "Anonymous donation" });
    // …an unqualified one is published without it (the view hides it anyway).
    await insertEntry(client, published);
    await rejects(client, { public_description: "x".repeat(2001) }, /treasury_entries_public_description_length/);
    await rejects(client, { internal_note: "x".repeat(5001) }, /treasury_entries_internal_note_length/);
  });
});

describe("0006 cross-row triggers", () => {
  it("links a refund to a donation of the same currency, never beyond its amount", async () => {
    const client = await latest();
    const donation = await insertEntry(client, { gross_amount: 1000 });
    const refund = (values: Record<string, unknown> = {}) => insertEntry(client, { entry_type: "refund", name: "Donation refund", adjusts_entry_id: donation, gross_amount: -300, ...values });

    // The integrity trigger (BEFORE INSERT) answers first for an unlinked refund.
    await expect(insertEntry(client, { entry_type: "refund", gross_amount: -100 })).rejects.toThrow(/must adjust a donation/);
    await expect(insertEntry(client, { adjusts_entry_id: donation })).rejects.toThrow(/treasury_entries_adjustment_links_donation/);
    await expect(refund({ currency: "USD" })).rejects.toThrow(/currency of its donation/);

    await refund(); // 300 of 1000
    await refund({ gross_amount: -700 }); // the rest: exactly the donation
    await expect(refund({ gross_amount: -1 })).rejects.toThrow(/cannot exceed the donation/);

    const expense = await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500 });
    await expect(insertEntry(client, { entry_type: "refund", adjusts_entry_id: expense, gross_amount: -100 })).rejects.toThrow(/must adjust a donation/);
  });

  it("freezes a refunded donation's type, currency and amount", async () => {
    const client = await latest();
    const donation = await insertEntry(client, { gross_amount: 1000 });
    await insertEntry(client, { entry_type: "refund", name: "Donation refund", adjusts_entry_id: donation, gross_amount: -300 });
    await expect(client.query("update treasury_entries set gross_amount = 200 where id = $1", [donation])).rejects.toThrow(/keeps its type, currency and amount/);
    await expect(client.query("update treasury_entries set currency = 'USD' where id = $1", [donation])).rejects.toThrow(/keeps its type, currency and amount/);
    // Fee fill-in and review changes are fine.
    await client.query("update treasury_entries set fee_amount = 59, net_amount = 941 where id = $1", [donation]);
    // The donation can't be deleted while a refund points at it.
    await expect(client.query("delete from treasury_entries where id = $1", [donation])).rejects.toThrow(/treasury_entries_adjusts_entry_id/);
  });

  it("allows expense types on expenses only, and keeps them consistent", async () => {
    const client = await latest();
    const donation = await insertEntry(client);
    const expense = await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500 });
    await expect(client.query("insert into treasury_entry_expense_types (entry_id, type_key) values ($1, 'general_operations')", [donation])).rejects.toThrow(
      /expenses only/,
    );
    await client.query("insert into treasury_entry_expense_types (entry_id, type_key) values ($1, 'hosting_and_infrastructure')", [expense]);
    await expect(client.query("insert into treasury_entry_expense_types (entry_id, type_key) values ($1, 'parties')", [expense])).rejects.toThrow(
      /treasury_entry_expense_types_type_key/,
    );
    await expect(client.query("update treasury_entries set entry_type = 'donation', gross_amount = 500 where id = $1", [expense])).rejects.toThrow(
      /Remove the expense types/,
    );
    // Deleting the expense removes its type links.
    await client.query("delete from treasury_entries where id = $1", [expense]);
    expect(await count(client, "treasury_entry_expense_types")).toBe(0);
  });
});

describe("0006 stripe tables, settings and the public view", () => {
  it("validates Stripe event rows", async () => {
    const client = await latest();
    const insert = (values: string) => client.exec(`insert into stripe_events (id, type, livemode, stripe_created_at, status, processed_at, attempts, last_error) values ${values}`);
    await insert("('evt_1abc', 'charge.refunded', false, now(), 'received', null, 0, null)");
    await insert("('evt_2abc', 'invoice.paid', false, now(), 'processed', now(), 1, null)");
    await expect(insert("('ev_1', 'x', false, now(), 'received', null, 0, null)")).rejects.toThrow(/stripe_events_id_shape/);
    await expect(insert("('evt_3', 'x', false, now(), 'done', null, 0, null)")).rejects.toThrow(/stripe_events_status_known/);
    await expect(insert("('evt_4', 'x', false, now(), 'processed', null, 0, null)")).rejects.toThrow(/stripe_events_processed_at_matches/);
    await expect(insert("('evt_5', 'x', false, now(), 'failed', now(), 0, null)")).rejects.toThrow(/stripe_events_processed_at_matches/);
    await expect(insert("('evt_6', 'x', false, now(), 'received', null, -1, null)")).rejects.toThrow(/stripe_events_attempts_not_negative/);
    await expect(insert(`('evt_7', 'x', false, now(), 'failed', null, 1, '${"x".repeat(1001)}')`)).rejects.toThrow(/stripe_events_last_error_length/);
    await expect(insert("('evt_1abc', 'x', false, now(), 'received', null, 0, null)")).rejects.toThrow(/stripe_events_pkey/);
  });

  it("clears an event's entry link if the entry is ever deleted", async () => {
    const client = await latest();
    const entry = await insertEntry(client);
    await client.query("insert into stripe_events (id, type, livemode, stripe_created_at, status, processed_at, entry_id) values ('evt_1', 'x', false, now(), 'processed', now(), $1)", [entry]);
    await client.query("delete from treasury_entries where id = $1", [entry]);
    expect(await rows(client, "select entry_id from stripe_events")).toEqual([{ entry_id: null }]);
  });

  it("validates subscriptions", async () => {
    const client = await latest();
    const insert = (id: string, currency: string, amount: number) =>
      client.query("insert into stripe_subscriptions (id, livemode, status, currency, amount, started_at) values ($1, true, 'active', $2, $3, now())", [id, currency, amount]);
    await insert("sub_ok", "CHF", 500);
    await expect(insert("si_1", "CHF", 500)).rejects.toThrow(/stripe_subscriptions_id_shape/);
    await expect(insert("sub_2", "GBP", 500)).rejects.toThrow(/stripe_subscriptions_currency_known/);
    await expect(insert("sub_3", "EUR", 0)).rejects.toThrow(/stripe_subscriptions_amount_positive/);
  });

  it("accepts dotted settings keys only", async () => {
    const client = await latest();
    await client.exec(`insert into settings (key, value) values ('donations.monthly', 'false'), ('donations.default_currency', '"EUR"')`);
    for (const bad of ["monthly", "Donations.monthly", "donations.", ".monthly", "donations monthly"]) {
      await expect(client.query("insert into settings (key, value) values ($1, 'true')", [bad])).rejects.toThrow(/settings_key_shape/);
    }
  });

  it("exposes published rows only, with the description only once qualified", async () => {
    const client = await latest();
    const published = { publication_status: "published", published_at: "2026-10-15T10:00:00Z" };
    await insertEntry(client, { name: "Hidden", internal_note: "secret" });
    await insertEntry(client, { ...published, review_status_key: "not_required", public_description: "Anonymous donation", internal_note: "secret" });
    await insertEntry(client, { ...published, entry_type: "expense", source: "manual", gross_amount: -500, public_description: "Draft text" });

    const view = await rows<Record<string, unknown>>(client, "select * from treasury_public_entries order by entry_number");
    expect(view.map((row) => [row.entry_type, row.public_description])).toEqual([
      ["donation", "Anonymous donation"],
      ["expense", null], // unqualified: description withheld
    ]);
    // Internal columns never reach the view.
    expect(Object.keys(view[0]!).sort()).toEqual(
      [
        "cadence",
        "currency",
        "entry_number",
        "entry_type",
        "gross_amount",
        "id",
        "net_amount",
        "occurred_at",
        "occurred_on",
        "public_description",
        "published_at",
        "recurrence_id",
        "adjusts_entry_id",
        "source",
        "livemode",
        "review_status_key",
        "sample",
      ].sort(),
    );
  });
});

describe("0006 dispute adjustments and Stripe mode", () => {
  const dispute = (client: PGlite, donation: string, gross: number, values: Record<string, unknown> = {}) =>
    insertEntry(client, { entry_type: "dispute", name: gross < 0 ? "Payment disputed" : "Dispute won", adjusts_entry_id: donation, gross_amount: gross, ...values });

  it("links a dispute to its donation; withdrawn negative, reinstated positive, never more than withdrawn", async () => {
    const client = await latest();
    const donation = await insertEntry(client, { gross_amount: 1000 });
    await expect(insertEntry(client, { entry_type: "dispute", gross_amount: -100 })).rejects.toThrow(/must adjust a donation/);
    await expect(dispute(client, donation, 0)).rejects.toThrow(/treasury_entries_gross_sign/);
    // A dispute can't give back money that wasn't withdrawn.
    await expect(dispute(client, donation, 500)).rejects.toThrow(/cannot give back more than was withdrawn/);

    // Withdrawn with Stripe's dispute fee; then won, with the fee given back (negative fee: disputes only).
    await dispute(client, donation, -1000, { fee_amount: 1500, net_amount: -2500 });
    await expect(dispute(client, donation, -1)).rejects.toThrow(/cannot exceed the donation/);
    await dispute(client, donation, 1000, { fee_amount: -1500, net_amount: 2500 });
    await expect(dispute(client, donation, 1)).rejects.toThrow(/cannot give back more than was withdrawn/);
    await expect(insertEntry(client, { fee_amount: -1, net_amount: 1001 })).rejects.toThrow(/treasury_entries_fee_not_negative/);
  });

  it("counts refunds and disputes together against the donation", async () => {
    const client = await latest();
    const donation = await insertEntry(client, { gross_amount: 1000 });
    await insertEntry(client, { entry_type: "refund", name: "Donation refund", adjusts_entry_id: donation, gross_amount: -600 });
    await expect(dispute(client, donation, -500)).rejects.toThrow(/cannot exceed the donation/);
    await dispute(client, donation, -400);
  });

  it("keeps test mode to Stripe rows, and an adjustment in its donation's mode", async () => {
    const client = await latest();
    await expect(insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500, livemode: false })).rejects.toThrow(
      /treasury_entries_livemode_stripe_only/,
    );
    const testDonation = await insertEntry(client, { livemode: false });
    await expect(insertEntry(client, { entry_type: "refund", name: "Donation refund", adjusts_entry_id: testDonation, gross_amount: -100 })).rejects.toThrow(
      /Stripe mode of its donation/,
    );
    await insertEntry(client, { entry_type: "refund", name: "Donation refund", adjusts_entry_id: testDonation, gross_amount: -100, livemode: false });
    // Default: real (live) money.
    expect(await rows(client, "select livemode from treasury_entries where entry_type = 'donation'")).toEqual([{ livemode: false }]);
    await insertEntry(client, { source: "manual" });
    expect((await rows<{ n: number }>(client, "select count(*)::int as n from treasury_entries where livemode"))[0]!.n).toBe(1);
  });

  it("requires a Stripe mode on subscriptions", async () => {
    const client = await latest();
    await expect(client.exec("insert into stripe_subscriptions (id, status, currency, amount, started_at) values ('sub_x1', 'active', 'EUR', 100, now())")).rejects.toThrow(
      /livemode/,
    );
  });
});

describe("migration 0007 — treasury documents", () => {
  const AT_0006 = journal.entries.findIndex((entry) => entry.tag.startsWith("0007_"));
  const SHA = "a".repeat(64);
  const insertDocument = (client: PGlite, entry: string, values: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      entry_id: entry,
      file_name: "invoice.pdf",
      content_type: "application/pdf",
      size_bytes: 1024,
      sha256: SHA,
      storage_key: `sha256/aa/${SHA}`,
      ...values,
    };
    const columns = Object.keys(row);
    return client.query(`insert into treasury_documents (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(row));
  };

  it("carries a database at 0006 with ledger rows over untouched, with no document", async () => {
    const client = await databaseAt(AT_0006);
    await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500 });
    const before = await rows(client, "select * from treasury_entries");
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    // Untouched (0008 then adds `sample`, false for every existing row).
    expect(await rows(client, "select * from treasury_entries")).toEqual(before.map((row) => ({ ...row, sample: false })));
    expect(await count(client, "treasury_documents")).toBe(0);
  });

  it("checks type, size, hash, key and name; one document per file per entry", async () => {
    const client = await latest();
    const entry = await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500 });
    await insertDocument(client, entry);
    await expect(insertDocument(client, entry)).rejects.toThrow(/treasury_documents_entry_sha256_unique/);
    // The same file on another entry shares the stored file (same key).
    const other = await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -700 });
    await insertDocument(client, other);
    await expect(insertDocument(client, entry, { sha256: "b".repeat(64), content_type: "text/html" })).rejects.toThrow(/treasury_documents_content_type_known/);
    await expect(insertDocument(client, entry, { sha256: "c".repeat(64), size_bytes: 0 })).rejects.toThrow(/treasury_documents_size_range/);
    await expect(insertDocument(client, entry, { sha256: "d".repeat(64), size_bytes: 20 * 1024 * 1024 + 1 })).rejects.toThrow(/treasury_documents_size_range/);
    await insertDocument(client, entry, { sha256: "e".repeat(64), size_bytes: 20 * 1024 * 1024 });
    await expect(insertDocument(client, entry, { sha256: "F".repeat(64) })).rejects.toThrow(/treasury_documents_sha256_hex/);
    await expect(insertDocument(client, entry, { sha256: "1".repeat(64), storage_key: "../etc/passwd" })).rejects.toThrow(/treasury_documents_storage_key_shape/);
    await expect(insertDocument(client, entry, { sha256: "2".repeat(64), file_name: "  " })).rejects.toThrow(/treasury_documents_file_name_present/);
    // An entry with documents can't be deleted; an admin can (the uploader link clears).
    await expect(client.query("delete from treasury_entries where id = $1", [entry])).rejects.toThrow(/treasury_documents_entry_id/);
  });
});

describe("migration 0008 — sample entries", () => {
  const AT_0007 = journal.entries.findIndex((entry) => entry.tag.startsWith("0008_"));

  it("carries a database at 0007 over: every existing entry is real (sample false), and the view shows the column", async () => {
    const client = await databaseAt(AT_0007);
    await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500, publication_status: "published", published_at: new Date().toISOString() });
    const before = await rows(client, "select * from treasury_entries");
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    expect(await rows(client, "select * from treasury_entries")).toEqual(before.map((row) => ({ ...row, sample: false })));
    expect((await rows(client, "select sample from treasury_public_entries")).map((row) => row.sample)).toEqual([false]);
  });

  it("only a manual entry can be a sample", async () => {
    const client = await latest();
    await insertEntry(client, { entry_type: "expense", source: "manual", gross_amount: -500, sample: true });
    await expect(insertEntry(client, { entry_type: "expense", source: "wise", gross_amount: -500, sample: true })).rejects.toThrow(/treasury_entries_sample_manual_only/);
  });
});
