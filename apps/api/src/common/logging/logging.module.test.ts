import { describe, expect, it } from "vitest";
import { redactQueryParams, serializeError } from "./logging.module.js";

describe("error log serialization", () => {
  it("drops bound query parameters (personal data) but keeps the parameterised SQL", () => {
    const error = new Error(
      'Failed query: select "id" from "people" where lower("email") = $1\nparams: jane.doe@example.org,Jane',
    );
    const serialized = serializeError(error);
    expect(serialized.message).toContain('select "id" from "people"');
    expect(serialized.message).toContain("params: [redacted]");
    expect(serialized.message).not.toContain("jane.doe@example.org");
    expect(serialized.stack).not.toContain("jane.doe@example.org");
  });

  it("leaves messages without parameters untouched", () => {
    expect(redactQueryParams("connect ECONNREFUSED 127.0.0.1:5432")).toBe("connect ECONNREFUSED 127.0.0.1:5432");
  });
});
