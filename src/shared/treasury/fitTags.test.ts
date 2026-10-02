import { describe, expect, it } from "vitest";
import { fitTagCount } from "./fitTags";

const badge = (hidden: number) => (hidden >= 10 ? 30 : 22);

describe("fitTagCount", () => {
  it("shows every tag when they all fit, with no badge", () => {
    expect(fitTagCount(200, [50, 60, 70], 8, badge)).toBe(3); // 180 + 16 = 196
    expect(fitTagCount(196, [50, 60, 70], 8, badge)).toBe(3);
  });

  it("keeps room for the +N badge when some are hidden", () => {
    // 2 tags + gap + badge = 50 + 8 + 60 + 8 + 22 = 148
    expect(fitTagCount(150, [50, 60, 70], 8, badge)).toBe(2);
    expect(fitTagCount(147, [50, 60, 70], 8, badge)).toBe(1);
  });

  it("is not limited to two tags", () => {
    expect(fitTagCount(400, [40, 40, 40, 40, 40, 40], 8, badge)).toBe(6);
    expect(fitTagCount(230, [40, 40, 40, 40, 40, 40], 8, badge)).toBe(4); // 4*40+3*8+8+22 = 214
  });

  it("falls back to only the badge when nothing fits", () => {
    expect(fitTagCount(30, [50, 60], 8, badge)).toBe(0);
    expect(fitTagCount(0, [50], 8, badge)).toBe(0);
  });

  it("uses the badge width for the actual hidden count", () => {
    const widths = Array.from({ length: 12 }, () => 20);
    // 1 visible + 11 hidden: 20 + 8 + 30 = 58
    expect(fitTagCount(58, widths, 8, badge)).toBe(1);
    expect(fitTagCount(57, widths, 8, badge)).toBe(0);
  });

  it("handles no tags and sub-pixel widths", () => {
    expect(fitTagCount(100, [], 8, badge)).toBe(0);
    expect(fitTagCount(99.6, [45.3, 46.2], 8, badge)).toBe(2); // 99.5 within tolerance
  });
});
