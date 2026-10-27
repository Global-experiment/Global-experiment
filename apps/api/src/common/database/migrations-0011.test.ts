import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Migration 0011 (client review of 2026-10-22): "Personal note" becomes the
 * shared "Description", and the links a record orders by drag and drop
 * (contact channels, organizations, expertise) get a position — backfilled
 * to the order the records showed until now. On a database carried over
 * from 0010 with rows in it, through Drizzle's own migrator.
 */
const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
const AT_0010 = journal.entries.findIndex((entry) => entry.tag.startsWith("0011_"));

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

const rows = async <T = Record<string, unknown>>(client: PGlite, query: string) => (await client.query<T>(query)).rows;

describe("migration 0011 — Description, link order", () => {
  it("renames the personal note to the description, keeping every value and its length rule", async () => {
    expect(AT_0010).toBeGreaterThan(0);
    const client = new PGlite();
    opened.push(client);
    await migrate(drizzle(client), { migrationsFolder: folder(AT_0010) });
    await client.exec(`INSERT INTO people (name, personal_note) VALUES ('Ada', 'Met at the assembly'), ('Bea', NULL)`);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    expect(await rows(client, "select name, description from people order by name")).toEqual([
      { name: "Ada", description: "Met at the assembly" },
      { name: "Bea", description: null },
    ]);
    expect(await rows(client, "select column_name from information_schema.columns where table_name = 'people' and column_name = 'personal_note'")).toEqual([]);
    expect(await rows(client, "select conname from pg_constraint where conname like 'people_%_length' and conname like '%description%'")).toEqual([{ conname: "people_description_length" }]);
    await expect(client.exec(`UPDATE people SET description = repeat('x', 5001) WHERE name = 'Ada'`)).rejects.toThrow(/people_description_length/);
  });

  it("gives existing links the positions they were shown in: organizations by name, contact channels in the lookup's order", async () => {
    const client = new PGlite();
    opened.push(client);
    await migrate(drizzle(client), { migrationsFolder: folder(AT_0010) });
    await client.exec(`
      INSERT INTO people (name) VALUES ('Ada');
      INSERT INTO organizations (name) VALUES ('Zeta Labs'), ('Alpha Coop'), ('Mid Works');
      INSERT INTO people_organizations (person_id, organization_id)
        SELECT p.id, o.id FROM people p, organizations o WHERE p.name = 'Ada' ORDER BY o.name DESC;
      INSERT INTO person_contact_channels (person_id, channel_key)
        SELECT p.id, c.key FROM people p, contact_channels c WHERE p.name = 'Ada' AND c.key IN ('signal', 'email', 'phone');
    `);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    expect(await rows(client, "select o.name, po.position from people_organizations po join organizations o on o.id = po.organization_id order by po.position")).toEqual([
      { name: "Alpha Coop", position: 0 },
      { name: "Mid Works", position: 1 },
      { name: "Zeta Labs", position: 2 },
    ]);
    const channels = await rows<{ channel_key: string; position: number }>(client, "select channel_key, position from person_contact_channels order by position");
    const lookupOrder = (await rows<{ key: string }>(client, "select key from contact_channels where key in ('signal', 'email', 'phone') order by sort_order")).map((row) => row.key);
    expect(channels.map((row) => row.channel_key)).toEqual(lookupOrder);
    expect(channels.map((row) => row.position)).toEqual([0, 1, 2]);
    // New links default to position 0 until the application sets one.
    expect(await rows(client, "select column_default, is_nullable from information_schema.columns where table_name = 'organization_expertise' and column_name = 'position'")).toEqual([
      { column_default: "0", is_nullable: "NO" },
    ]);
  });
});
