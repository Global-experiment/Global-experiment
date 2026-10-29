import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../common/config/env.js";
import { fixtureImportSource, notionImportSource } from "./import-source.js";

const FIXTURE = fileURLToPath(new URL("../../../../e2e/fixtures/notion-import.json", import.meta.url));
const base = { DATABASE_URL: "postgres://u@localhost:5432/db_test" };

describe("import source", () => {
  it("reads the test fixture through the same Notion mapping", async () => {
    const directory = await fixtureImportSource(FIXTURE).directory();
    expect(directory.layouts.people.required).toEqual(["State", "Source", "Description"]);
  });

  it("allows the fixture source only under NODE_ENV=test", () => {
    expect(parseConfig({ ...base, NODE_ENV: "test", IMPORT_FIXTURE_FILE: FIXTURE }).notion.fixtureFile).toBe(FIXTURE);
    for (const NODE_ENV of ["development", "production"]) {
      expect(() =>
        parseConfig({ ...base, NODE_ENV, IMPORT_FIXTURE_FILE: FIXTURE, ADMIN_ALLOWED_ORIGINS: "https://globalexperiment.org" }),
      ).toThrow(/IMPORT_FIXTURE_FILE: is only allowed when NODE_ENV is test/);
    }
  });

  it("names the missing server variables (never their values) when Notion isn't configured", () => {
    const config = parseConfig({ ...base, NODE_ENV: "test", NOTION_API_KEY: "secret_value_never_shown", NOTION_PEOPLE_DB_ID: "p" });
    const source = notionImportSource(config);
    expect(source.unavailable("directory")).toBe("Notion import isn't configured on the server (missing NOTION_ORGANIZATIONS_DB_ID).");
    expect(source.unavailable("directory")).not.toContain("secret_value_never_shown");
  });
});
