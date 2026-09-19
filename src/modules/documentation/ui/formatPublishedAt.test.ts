import { describe, expect, it } from "vitest";
import { formatPublishedAt } from "./formatPublishedAt";

describe("formatPublishedAt", () => {
  it("renders date and 24h time for a timestamped publication", () => {
    expect(formatPublishedAt(new Date("2026-08-12T09:14:00.000Z"))).toBe("Aug 12 09:14");
  });

  it("omits the time for a date-only publication (midnight UTC)", () => {
    expect(formatPublishedAt(new Date("2026-08-29T00:00:00.000Z"))).toBe("Aug 29");
  });
});
