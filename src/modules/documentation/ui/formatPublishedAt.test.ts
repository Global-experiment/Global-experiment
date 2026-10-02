import { describe, expect, it } from "vitest";
import { formatPublishedAt, formatUpdatedAt } from "./formatPublishedAt";

describe("formatUpdatedAt", () => {
  const now = new Date("2026-10-02T18:00:00.000Z");

  it("shows only the clock time for an edit made today, as in Figma", () => {
    expect(formatUpdatedAt(new Date("2026-10-02T14:07:00.000Z"), now)).toBe("at 2:07 PM");
  });

  it("adds the date for an older edit, so the time is never misleading", () => {
    expect(formatUpdatedAt(new Date("2026-08-12T09:14:00.000Z"), now)).toBe("on Aug 12 at 9:14 AM");
  });
});

describe("formatPublishedAt", () => {
  it("renders date and 24h time for a timestamped publication", () => {
    expect(formatPublishedAt(new Date("2026-08-12T09:14:00.000Z"))).toBe("Aug 12 09:14");
  });

  it("omits the time for a date-only publication (midnight UTC)", () => {
    expect(formatPublishedAt(new Date("2026-08-29T00:00:00.000Z"))).toBe("Aug 29");
  });
});
