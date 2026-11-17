import { describe, expect, it } from "vitest";
import { canArchiveEntry } from "./treasuryAccess";

describe("Archive / Restore on a Treasury entry (OPS-158)", () => {
  it("needs treasury.update", () => {
    expect(canArchiveEntry({ canUpdate: false, canPublish: true, published: false })).toBe(false);
    expect(canArchiveEntry({ canUpdate: true, canPublish: false, published: false })).toBe(true);
  });

  it("also needs treasury.publish when the entry is published", () => {
    expect(canArchiveEntry({ canUpdate: true, canPublish: false, published: true })).toBe(false);
    expect(canArchiveEntry({ canUpdate: true, canPublish: true, published: true })).toBe(true);
  });
});
