import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Migrations 0009 (append-only audit log, comments, views) and 0010 (person
 * fields, contact channels, archive columns, the follow-up as a date and
 * time) — on a database carried over from 0008 with rows in it, through
 * Drizzle's own migrator, as production runs it.
 */
const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
const AT_0008 = journal.entries.findIndex((entry) => entry.tag.startsWith("0009_"));

const opened: PGlite[] = [];
const tempDirs: string[] = [];
afterEach(async () => {
  for (const client of opened.splice(0)) await client.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folder(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), "ge-migrations-"));
  tempDirs.push(dir);
  cpSync(join(MIGRATIONS, "meta"), join(dir, "meta"), { recursive: true });
  const entries = journal.entries.slice(0, count);
  for (const { tag } of entries) cpSync(join(MIGRATIONS, `${tag}.sql`), join(dir, `${tag}.sql`));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  return dir;
}

async function databaseAt(count: number): Promise<PGlite> {
  const client = new PGlite();
  opened.push(client);
  await migrate(drizzle(client), { migrationsFolder: folder(count) });
  return client;
}

const rows = async <T = Record<string, unknown>>(client: PGlite, query: string) => (await client.query<T>(query)).rows;
const failure = async (client: PGlite, query: string) => {
  try {
    await client.exec(query);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

describe("migration 0009 — audit log, comments, views", () => {
  it("keeps the audit log append-only: inserts work; updates, deletes and truncates are refused", async () => {
    const client = await databaseAt(journal.entries.length);
    await client.exec(`INSERT INTO audit_events (entity_type, entity_id, action, actor_type, actor_label, source) VALUES ('person', 'x', 'created', 'automation', 'Automation', 'import')`);
    expect(await rows(client, "select action, actor_label from audit_events")).toEqual([{ action: "created", actor_label: "Automation" }]);
    expect(await failure(client, "UPDATE audit_events SET action = 'updated'")).toMatch(/append-only \(UPDATE refused\)/);
    expect(await failure(client, "DELETE FROM audit_events")).toMatch(/append-only \(DELETE refused\)/);
    expect(await failure(client, "TRUNCATE audit_events")).toMatch(/append-only \(TRUNCATE refused\)/);
    expect(await rows(client, "select count(*)::int as n from audit_events")).toEqual([{ n: 1 }]);
  });

  it("checks actions, actors and sources", async () => {
    const client = await databaseAt(journal.entries.length);
    const insert = (action: string, actor: string, source: string) =>
      failure(client, `INSERT INTO audit_events (entity_type, entity_id, action, actor_type, actor_label, source) VALUES ('person', 'x', '${action}', '${actor}', 'Someone', '${source}')`);
    expect(await insert("renamed", "admin", "admin")).toMatch(/audit_events_action_known/);
    expect(await insert("updated", "robot", "admin")).toMatch(/audit_events_actor_type_known/);
    expect(await insert("updated", "admin", "email")).toMatch(/audit_events_source_known/);
    expect(await insert("comment_added", "admin", "admin")).toBeNull();
  });
});

describe("migration 0010 — person fields, contact channels, archive", () => {
  it("turns each follow-up date into that day at 09:00 in Zurich (summer and winter), and drops the date column", async () => {
    const client = await databaseAt(AT_0008);
    await client.exec(`
      INSERT INTO people (name, next_followup_on) VALUES ('Summer', '2026-07-01'), ('Winter', '2026-12-01'), ('None', NULL);
    `);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    const migrated = await rows<{ name: string; at: string | null }>(client, "select name, to_char(next_followup_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI') as at from people order by name");
    expect(migrated).toEqual([
      { name: "None", at: null },
      { name: "Summer", at: "2026-07-01T07:00" }, // CEST, UTC+2
      { name: "Winter", at: "2026-12-01T08:00" }, // CET, UTC+1
    ]);
    expect(await rows(client, "select column_name from information_schema.columns where table_name = 'people' and column_name = 'next_followup_on'")).toEqual([]);
  });

  it("seeds the nine contact channels in the decided order (vocabulary, not demo data)", async () => {
    const client = await databaseAt(journal.entries.length);
    expect((await rows<{ label: string }>(client, "select label from contact_channels order by sort_order")).map((row) => row.label)).toEqual([
      "Email",
      "Phone",
      "WhatsApp",
      "Signal",
      "Telegram",
      "LinkedIn",
      "X",
      "Matrix",
      "Workana",
    ]);
    expect(await rows(client, "select count(*)::int as n from people")).toEqual([{ n: 0 }]);
  });

  it("keeps scores within 0–10 and the first contact before the last", async () => {
    const client = await databaseAt(journal.entries.length);
    expect(await failure(client, "INSERT INTO people (name, relevance_score) VALUES ('A', 11)")).toMatch(/people_relevance_scores_range/);
    expect(await failure(client, "INSERT INTO people (name, ai_relevance_score) VALUES ('A', -1)")).toMatch(/people_relevance_scores_range/);
    expect(await failure(client, "INSERT INTO people (name, first_contact_on, last_contact_on) VALUES ('A', '2026-10-02', '2026-10-01')")).toMatch(/people_contact_dates_order/);
    expect(await failure(client, "INSERT INTO people (name, relevance_score, ai_relevance_score, first_contact_on, last_contact_on) VALUES ('A', 0, 10, '2026-10-01', '2026-10-01')")).toBeNull();
  });

  it("archived entries leave the public Treasury view; existing rows are not archived", async () => {
    const client = await databaseAt(AT_0008);
    await client.exec(`
      INSERT INTO treasury_entries (entry_type, name, currency, gross_amount, source, managed_by, livemode, occurred_on, review_status_key, publication_status, published_at, public_description)
      VALUES ('donation', 'Donation', 'USD', 500, 'manual', 'native', true, '2026-10-01', 'not_required', 'published', now(), 'A donation'),
             ('donation', 'Donation', 'USD', 700, 'manual', 'native', true, '2026-10-02', 'not_required', 'published', now(), 'A donation');
    `);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    expect(await rows(client, "select count(*)::int as n from treasury_entries where archived_at is not null")).toEqual([{ n: 0 }]);
    expect(await rows(client, "select count(*)::int as n from treasury_public_entries")).toEqual([{ n: 2 }]);
    await client.exec("UPDATE treasury_entries SET archived_at = now() WHERE gross_amount = 700");
    expect(await rows(client, "select gross_amount::int as amount from treasury_public_entries")).toEqual([{ amount: 500 }]);
  });
});
