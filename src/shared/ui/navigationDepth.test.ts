import { describe, expect, it } from "vitest";
import { shouldUseHistoryBack } from "./navigationDepth";

describe("shouldUseHistoryBack", () => {
  it("falls back to the link on a directly opened page (first in-app page)", () => {
    expect(shouldUseHistoryBack(0)).toBe(false);
    expect(shouldUseHistoryBack(1)).toBe(false);
  });

  it("uses real history once an earlier in-app page exists in this tab", () => {
    expect(shouldUseHistoryBack(2)).toBe(true);
    expect(shouldUseHistoryBack(7)).toBe(true);
  });
});
