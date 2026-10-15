import { describe, expect, it } from "vitest";
import type { PublicTreasuryEntry } from "@/shared/config/publicApi";
import { publicationLabel } from "@/modules/admin/treasury/treasuryDisplay";
import { entryTags } from "./HistoryList";

const entry = (overrides: Partial<PublicTreasuryEntry>): PublicTreasuryEntry => ({
  number: 3,
  type: "donation",
  currency: "USD",
  amount: 500,
  cadence: "one_off",
  occurredOn: "2026-10-14",
  occurredAt: "2026-10-14T19:24:38Z",
  publishedAt: "2026-10-14T19:24:41Z",
  qualified: true,
  description: null,
  expenseTypes: [],
  recipient: null,
  adjustsNumber: null,
  test: false,
  ...overrides,
});

describe("entryTags", () => {
  it("marks a sandbox donation Test, first", () => {
    expect(entryTags(entry({ test: true }))).toEqual(["Test"]);
    expect(entryTags(entry({}))).toEqual([]);
  });
  it("keeps Not qualified yet before the expense types", () => {
    expect(entryTags(entry({ type: "expense", amount: -5000, qualified: false, expenseTypes: [{ key: "hosting", label: "Hosting and infrastructure" }] }))).toEqual([
      "Not qualified yet",
      "Hosting and infrastructure",
    ]);
  });
});

describe("publicationLabel (admin)", () => {
  it("says when a published entry isn't shown to visitors", () => {
    expect(publicationLabel({ publication: "published", publicNow: true })).toBe("Published");
    expect(publicationLabel({ publication: "published", publicNow: false })).toBe("Published, not public");
    expect(publicationLabel({ publication: "unpublished", publicNow: false })).toBe("Unpublished");
  });
});
