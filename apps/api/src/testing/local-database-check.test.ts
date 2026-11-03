import { describe, expect, it } from "vitest";
import { checkLocalDatabase } from "./local-database-check.js";

describe("the local setup's database guard (npm run setup)", () => {
  it("accepts PGlite and a PostgreSQL server on this machine named *_dev or *_test", () => {
    expect(checkLocalDatabase("pglite:.data/pglite", undefined)).toBe("pglite:.data/pglite");
    expect(checkLocalDatabase("postgres://dev@localhost:5432/global_experiment_dev", "development")).toContain("localhost");
    expect(checkLocalDatabase("postgresql://dev@127.0.0.1/global_experiment_test", undefined)).toContain("127.0.0.1");
  });

  it("refuses production, another host, any other database name, or no database", () => {
    expect(() => checkLocalDatabase("pglite:.data/pglite", "production")).toThrow(/production/);
    expect(() => checkLocalDatabase("postgres://user@db.example.org:5432/global_experiment_dev", undefined)).toThrow(/db\.example\.org/);
    expect(() => checkLocalDatabase("postgres://user@localhost:5432/global_experiment", undefined)).toThrow(/_dev or \*_test/);
    expect(() => checkLocalDatabase("mysql://localhost/global_experiment_dev", undefined)).toThrow(/pglite/);
    expect(() => checkLocalDatabase(undefined, undefined)).toThrow(/npm run setup/);
  });
});
