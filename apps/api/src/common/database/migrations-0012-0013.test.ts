import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS } from "../../access-control/permissions.js";

/**
 * Migrations 0012 (accounts and roles) and 0013 (services and access), on a
 * database carried over from 0011 with its owner account and a live session,
 * through Drizzle's own migrator.
 */
const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
const AT_0011 = journal.entries.findIndex((entry) => entry.tag.startsWith("0012_"));

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

async function carriedOver(): Promise<PGlite> {
  expect(AT_0011).toBeGreaterThan(0);
  const client = new PGlite();
  opened.push(client);
  await migrate(drizzle(client), { migrationsFolder: folder(AT_0011) });
  await client.exec(`
    INSERT INTO admin_users (email, role, password_hash, display_name) VALUES ('owner@example.org', 'owner', 'scrypt$kept', 'Owner');
    INSERT INTO admin_sessions (token_hash, admin_user_id, expires_at)
      SELECT 'session-hash', id, now() + interval '1 day' FROM admin_users;
  `);
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  return client;
}

describe("migrations 0012–0013 — accounts, roles, services, access", () => {
  it("keeps the existing owner as an active Rootadmin, GE-000001, with its password and session", async () => {
    const client = await carriedOver();
    expect(await rows(client, "select email, role, status, account_number, password_hash, display_name, appearance from admin_users")).toEqual([
      { email: "owner@example.org", role: "owner", status: "active", account_number: 1, password_hash: "scrypt$kept", display_name: "Owner", appearance: "system" },
    ]);
    expect(await rows(client, "select count(*)::int as n from admin_sessions")).toEqual([{ n: 1 }]);
  });

  it("seeds the roles and the permission matrix exactly as permissions.ts defines them, and no demo rows", async () => {
    const client = await carriedOver();
    expect((await rows<{ key: string; label: string }>(client, "select key, label from admin_roles order by sort_order")).map((row) => row.key)).toEqual(ROLE_KEYS);
    expect((await rows(client, "select label from admin_roles where key = 'owner'"))[0]).toEqual({ label: "Rootadmin" });
    expect((await rows<{ key: string }>(client, "select key from admin_permissions order by key")).map((row) => row.key)).toEqual([...ALL_PERMISSIONS].sort());
    const pairs = (await rows<{ role_key: string; permission_key: string }>(client, "select role_key, permission_key from admin_role_permissions")).map((row) => `${row.role_key} ${row.permission_key}`);
    const expected = ROLE_KEYS.flatMap((role) => ROLE_PERMISSIONS[role].map((permission) => `${role} ${permission}`));
    expect(pairs.sort()).toEqual(expected.sort());
    expect(await rows(client, "select key from access_statuses order by sort_order")).toEqual(
      ["planned", "invited", "active", "needs_confirmation", "revoked", "expired"].map((key) => ({ key })),
    );
    for (const table of ["services", "access_grants", "admin_tokens"]) {
      expect(await rows(client, `select count(*)::int as n from ${table}`), table).toEqual([{ n: 0 }]);
    }
  });

  it("allows several Rootadmins but never leaves none: deactivating, demoting or deleting the last one fails", async () => {
    const client = await carriedOver();
    const last = /last active Rootadmin/;
    await expect(client.exec("UPDATE admin_users SET status = 'deactivated'")).rejects.toThrow(last);
    await expect(client.exec("UPDATE admin_users SET role = 'admin'")).rejects.toThrow(last);
    await expect(client.exec("DELETE FROM admin_users")).rejects.toThrow(last);
    // Deleting the last session still works, and the owner is untouched.
    await client.exec("DELETE FROM admin_sessions");
    expect(await rows(client, "select status, role from admin_users")).toEqual([{ status: "active", role: "owner" }]);

    await client.exec("INSERT INTO admin_users (email, role, status, password_hash) VALUES ('second@example.org', 'owner', 'active', 'scrypt$x')");
    await client.exec("UPDATE admin_users SET status = 'deactivated' WHERE email = 'owner@example.org'");
    expect((await rows(client, "select account_number from admin_users where email = 'second@example.org'"))[0]).toEqual({ account_number: 2 });
    // An invited account has no password yet; an active one must have one.
    await client.exec("INSERT INTO admin_users (email, role, status) VALUES ('invited@example.org', 'tech', 'invited')");
    await expect(client.exec("UPDATE admin_users SET status = 'active' WHERE email = 'invited@example.org'")).rejects.toThrow(/admin_users_password_when_active/);
    await expect(client.exec("INSERT INTO admin_users (email, role, status, password_hash) VALUES ('x@example.org', 'nobody', 'active', 'h')")).rejects.toThrow(/admin_users_role_admin_roles_key_fk/);
  });
});
