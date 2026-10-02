import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-app.js";

describe("real-PostgreSQL test mode safety", () => {
  const original = process.env.TEST_DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = original;
  });

  it.each(["global_experiment_dev", "postgres", "global_experiment", "test_global_experiment"])(
    "refuses to reset %s (not a *_test database) before connecting",
    async (name) => {
      // Port 1: if the guard ever let this through, the connection would fail differently.
      process.env.TEST_DATABASE_URL = `postgres://fake_user@127.0.0.1:1/${name}`;
      await expect(createTestDatabase()).rejects.toThrow(/Refusing to reset/);
    },
  );
});
