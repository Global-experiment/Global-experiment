import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Migration 0002 (docs/architecture/data-model.md §8) on an empty database
 * and on a database still at 0001 with existing rows — always through
 * Drizzle's own migrator, as production runs it. PGlite: real PostgreSQL
 * in-process.
 */
const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as {
  entries: { idx: number; tag: string }[];
};

/** A copy of the migrations folder holding only the first `count` migrations. */
function migrationsUpTo(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), "ge-migrations-"));
  cpSync(join(MIGRATIONS, "meta"), join(dir, "meta"), { recursive: true });
  const entries = journal.entries.slice(0, count);
  for (const { tag } of entries) cpSync(join(MIGRATIONS, `${tag}.sql`), join(dir, `${tag}.sql`));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  return dir;
}

const statementsOf = (tag: string) =>
  readFileSync(join(MIGRATIONS, `${tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

const opened: PGlite[] = [];
const tempDirs: string[] = [];
afterEach(async () => {
  for (const client of opened.splice(0)) await client.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function databaseAt(count: number): Promise<PGlite> {
  const client = new PGlite();
  opened.push(client);
  const dir = migrationsUpTo(count);
  tempDirs.push(dir);
  await migrate(drizzle(client), { migrationsFolder: dir });
  return client;
}

const rows = async <T>(client: PGlite, query: string) => (await client.query<T>(query)).rows;

/** Rows a pre-0002 database can hold, covering every case 0002 has to carry over. */
async function insertPre0002Rows(client: PGlite) {
  await client.exec(`
    INSERT INTO expertise_domains (id, name) VALUES ('11111111-1111-4111-8111-111111111111', 'Technology');
    INSERT INTO expertise_fields (id, domain_id, name) VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Software');
    INSERT INTO expertise_items (id, field_id, name) VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'Web development');

    -- Inserted out of creation order: numbering must follow created_at, not insertion.
    INSERT INTO people (id, name, source_key, state_key, last_followup_at, created_at) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000003', 'Cleo', 'notion_import', 'collaborating', '2026-09-03T08:00:00Z', '2026-09-03T00:00:00Z'),
      ('aaaaaaaa-0000-4000-8000-000000000001', 'Ada',  'candide',       'sourced',       '2026-09-01T08:00:00Z', '2026-09-01T00:00:00Z'),
      ('aaaaaaaa-0000-4000-8000-000000000002', 'Bo',   'waitlist',      NULL,            NULL,                   '2026-09-02T00:00:00Z');
    INSERT INTO organizations (id, name, note, created_at) VALUES
      ('bbbbbbbb-0000-4000-8000-000000000002', 'Second', NULL,             '2026-09-02T00:00:00Z'),
      ('bbbbbbbb-0000-4000-8000-000000000001', 'First',  'A long-standing partner.', '2026-09-01T00:00:00Z');
    INSERT INTO people_organizations (person_id, organization_id) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001');
    INSERT INTO people_expertise (person_id, expertise_id) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333');
  `);
}

describe("migration 0002 — directory aligned with Notion", () => {
  it("applies cleanly on an empty database and seeds only lookup vocabularies", async () => {
    const client = await databaseAt(journal.entries.length);

    expect(await rows(client, "select key from person_states order by sort_order")).toEqual(
      ["sourced", "contacted", "in_discussion", "collaborating", "on_hold", "rejected"].map((key) => ({ key })),
    );
    expect(await rows(client, "select key, label from person_sources order by sort_order")).toEqual([
      { key: "candide", label: "Candide" },
      { key: "ai", label: "AI" },
      { key: "contribution_email", label: "Contribution email" },
    ]);
    expect(await rows(client, "select key from teams order by sort_order")).toEqual(
      ["communication", "compliance", "moderation", "operations", "tech", "treasury"].map((key) => ({ key })),
    );
    expect(await rows(client, "select key from taxonomy_statuses")).toEqual([{ key: "active" }]);

    // No directory records: vocabulary only, never sample data.
    for (const table of ["people", "organizations", "expertise_domains", "expertise_fields", "expertise_items"]) {
      expect((await rows<{ n: number }>(client, `select count(*)::int as n from ${table}`))[0]!.n, table).toBe(0);
    }

    // Numbers start at 1 and are assigned automatically.
    await client.exec("insert into people (name) values ('First'), ('Second'); insert into organizations (name) values ('Org');");
    expect(await rows(client, "select person_number from people order by person_number")).toEqual([{ person_number: 1 }, { person_number: 2 }]);
    expect(await rows(client, "select org_number from organizations")).toEqual([{ org_number: 1 }]);
  });

  it("carries existing rows over without losing data", async () => {
    const client = await databaseAt(2);
    await insertPre0002Rows(client);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    const migratedPeople = await rows<Record<string, unknown>>(
      client,
      `select name, person_number, source_key, state_key, next_followup_on, last_followup_at_legacy
         from people order by person_number`,
    );
    expect(migratedPeople).toEqual([
      // Creation order, not insertion order.
      { name: "Ada", person_number: 1, source_key: "candide", state_key: "sourced", next_followup_on: null, last_followup_at_legacy: new Date("2026-09-01T08:00:00Z") },
      // Removed source cleared (and listed — see the next test); everything else kept.
      { name: "Bo", person_number: 2, source_key: null, state_key: null, next_followup_on: null, last_followup_at_legacy: null },
      { name: "Cleo", person_number: 3, source_key: null, state_key: "collaborating", next_followup_on: null, last_followup_at_legacy: new Date("2026-09-03T08:00:00Z") },
    ]);

    // The old follow-up column is gone; its values live in the legacy column only.
    expect(await rows(client, "select column_name from information_schema.columns where table_name = 'people' and column_name like '%followup%' order by 1")).toEqual([
      { column_name: "last_followup_at_legacy" },
      { column_name: "next_followup_on" },
    ]);

    expect(await rows(client, "select name, org_number, description from organizations order by org_number")).toEqual([
      { name: "First", org_number: 1, description: "A long-standing partner." },
      { name: "Second", org_number: 2, description: null },
    ]);
    expect(await rows(client, "select column_name from information_schema.columns where table_name = 'organizations' and column_name = 'note'")).toEqual([]);

    // Links and taxonomy untouched.
    expect((await rows<{ n: number }>(client, "select count(*)::int as n from people_organizations"))[0]!.n).toBe(1);
    expect((await rows<{ n: number }>(client, "select count(*)::int as n from people_expertise"))[0]!.n).toBe(1);
    expect(await rows(client, "select name, stable_id, status_key from expertise_items")).toEqual([
      { name: "Web development", stable_id: null, status_key: null },
    ]);

    // Sequences continue after the highest existing number.
    expect(await rows(client, "insert into people (name) values ('New') returning person_number")).toEqual([{ person_number: 4 }]);
    expect(await rows(client, "insert into organizations (name) values ('New') returning org_number")).toEqual([{ org_number: 3 }]);
  });

  it("lists every person whose removed source is cleared — never silently", async () => {
    const client = await databaseAt(2);
    await insertPre0002Rows(client);

    const notices: string[] = [];
    await client.exec("BEGIN");
    for (const statement of statementsOf(journal.entries[2]!.tag)) {
      await client.query(statement, [], { onNotice: (notice) => notices.push(notice.message ?? "") });
    }
    await client.exec("COMMIT");

    expect(notices).toEqual([
      '0002: source "waitlist" removed; cleared on person aaaaaaaa-0000-4000-8000-000000000002 (Bo)',
      '0002: source "notion_import" removed; cleared on person aaaaaaaa-0000-4000-8000-000000000003 (Cleo)',
    ]);
  });
});

describe("0002 constraints", () => {
  const ITEM = "33333333-3333-4333-8333-333333333333";
  const FIELD = "22222222-2222-4222-8222-222222222222";
  const DOMAIN = "11111111-1111-4111-8111-111111111111";

  async function ready() {
    const client = await databaseAt(journal.entries.length);
    await client.exec(`
      INSERT INTO expertise_domains (id, name) VALUES ('${DOMAIN}', 'Civic participation');
      INSERT INTO expertise_fields (id, domain_id, name) VALUES ('${FIELD}', '${DOMAIN}', 'Participatory democracy');
      INSERT INTO expertise_items (id, field_id, name) VALUES ('${ITEM}', '${FIELD}', 'Participatory democracy');
    `);
    return client;
  }
  const accepts = (client: PGlite, sql: string) => expect(client.exec(sql)).resolves.toBeDefined();
  const rejects = (client: PGlite, sql: string, constraint: RegExp) => expect(client.exec(sql)).rejects.toThrow(constraint);

  it("enforces the Stable ID formats (underscores, real Notion examples), after the http:// clean-up", async () => {
    const client = await ready();
    await accepts(client, `update expertise_items set stable_id = '07.02.participatory_democracy' where id = '${ITEM}'`);
    await accepts(client, `insert into expertise_items (field_id, name, stable_id) values ('${FIELD}', 'Sex work experience', '14.05.sex_work_experience')`);
    await accepts(client, `update expertise_fields set stable_id = 'field.07.02.participatory_democracy' where id = '${FIELD}'`);

    const item = (stableId: string) => `insert into expertise_items (field_id, name, stable_id) values ('${FIELD}', 'X ${stableId}', '${stableId}')`;
    for (const bad of ["http://07.02.x", "07.02.Upper", "07.02.with-hyphen", "7.02.short", "07.02.", "field.07.02.x"]) {
      await rejects(client, item(bad), /expertise_items_stable_id_shape/);
    }
    for (const bad of ["07.02.no_prefix", "field.07.02.Upper", "http://field.07.02.x"]) {
      await rejects(client, `update expertise_fields set stable_id = '${bad}' where id = '${FIELD}'`, /expertise_fields_stable_id_shape/);
    }
  });

  it("stores any Domain Stable ID (format still open), up to 120 characters", async () => {
    const client = await ready();
    await accepts(client, `update expertise_domains set stable_id = 'domain.07.civic_participation' where id = '${DOMAIN}'`);
    await rejects(client, `update expertise_domains set stable_id = '${"d".repeat(121)}' where id = '${DOMAIN}'`, /expertise_domains_stable_id_length/);
  });

  it("keeps Stable IDs, Notion page IDs and PER/ORG numbers unique", async () => {
    const client = await ready();
    await client.exec(`update expertise_items set stable_id = '07.02.participatory_democracy' where id = '${ITEM}'`);
    await rejects(client, `insert into expertise_items (field_id, name, stable_id) values ('${FIELD}', 'Other', '07.02.participatory_democracy')`, /expertise_items_stable_id_unique/);

    const page = "44444444-4444-4444-8444-444444444444";
    await client.exec(`insert into people (name, notion_page_id) values ('A', '${page}')`);
    await rejects(client, `insert into people (name, notion_page_id) values ('B', '${page}')`, /people_notion_page_id_unique/);
    await accepts(client, "insert into people (name) values ('No page'), ('No page either')"); // many NULLs allowed
    await client.exec(`insert into organizations (name, notion_page_id) values ('A', '${page}')`);
    await rejects(client, `insert into organizations (name, notion_page_id) values ('B', '${page}')`, /organizations_notion_page_id_unique/);
    for (const table of ["expertise_domains", "expertise_fields", "expertise_items"]) {
      await client.exec(`update ${table} set notion_page_id = '${page}'`);
    }
    await rejects(client, `insert into expertise_items (field_id, name, notion_page_id) values ('${FIELD}', 'Dup page', '${page}')`, /expertise_items_notion_page_id_unique/);

    await rejects(client, "insert into people (name, person_number) values ('Dup', 1)", /people_person_number_unique/);
    await rejects(client, "insert into people (name, person_number) values ('Zero', 0)", /people_person_number_positive/);
    await rejects(client, "insert into organizations (name, org_number) values ('Dup', 1)", /organizations_org_number_unique/);
    // The import sets Notion's numbers explicitly.
    await accepts(client, "insert into people (name, person_number) values ('From Notion', 812)");
  });

  it("checks organization emails like people's, and caps Wise recipient IDs at 100 characters of free text", async () => {
    const client = await ready();
    await rejects(client, "insert into organizations (name, email) values ('X', 'not-an-email')", /organizations_email_shape/);
    await accepts(client, "insert into organizations (name, email) values ('X', 'hello@ngo.ch')");
    await accepts(client, `insert into people (name, wise_recipient_id) values ('W', 'P-12 345 / any text')`);
    await rejects(client, `insert into people (name, wise_recipient_id) values ('W', '${"9".repeat(101)}')`, /people_wise_recipient_id_length/);
    await rejects(client, `insert into organizations (name, wise_recipient_id) values ('W', '${"9".repeat(101)}')`, /organizations_wise_recipient_id_length/);
  });

  it("rejects unknown teams and statuses, and drops team links with their expertise", async () => {
    const client = await ready();
    await accepts(client, `insert into expertise_teams (expertise_id, team_key) values ('${ITEM}', 'tech'), ('${ITEM}', 'treasury')`);
    await rejects(client, `insert into expertise_teams (expertise_id, team_key) values ('${ITEM}', 'marketing')`, /expertise_teams_team_key_teams_key_fk/);
    await accepts(client, `update expertise_items set status_key = 'active' where id = '${ITEM}'`);
    await rejects(client, `update expertise_items set status_key = 'archived' where id = '${ITEM}'`, /expertise_items_status_key_taxonomy_statuses_key_fk/);
    await rejects(client, `update expertise_domains set status_key = 'archived'`, /expertise_domains_status_key_taxonomy_statuses_key_fk/);
    // New statuses are rows, not migrations.
    await client.exec("insert into taxonomy_statuses (key, label, sort_order) values ('archived', 'Archived', 20)");
    await accepts(client, `update expertise_items set status_key = 'archived' where id = '${ITEM}'`);

    await client.exec(`delete from expertise_items where id = '${ITEM}'`);
    expect((await rows<{ n: number }>(client, "select count(*)::int as n from expertise_teams"))[0]!.n).toBe(0);
  });
});
