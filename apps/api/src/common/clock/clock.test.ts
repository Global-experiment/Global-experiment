import { describe, expect, it } from "vitest";
import { zurichDate } from "./clock.js";

describe("zurichDate", () => {
  it("is Zurich's calendar date, not UTC's — just after midnight in summer (UTC+2)", () => {
    // 00:30 on Oct 15 in Zurich is still Oct 14 in UTC.
    expect(zurichDate(new Date("2026-10-14T22:30:00Z"))).toBe("2026-10-15");
    expect(zurichDate(new Date("2026-10-14T21:59:59Z"))).toBe("2026-10-14");
  });

  it("follows winter time (UTC+1)", () => {
    expect(zurichDate(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
    expect(zurichDate(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
  });
});
