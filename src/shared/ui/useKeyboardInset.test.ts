import { describe, expect, it } from "vitest";
import { computeKeyboardInset } from "./useKeyboardInset";

describe("computeKeyboardInset", () => {
  it("is 0 when nothing covers the viewport (desktop, keyboard closed)", () => {
    expect(computeKeyboardInset(800, 800, 0)).toBe(0);
  });

  it("returns the covered height when the keyboard opens", () => {
    // 800px layout viewport, keyboard leaves 500px of visual viewport.
    expect(computeKeyboardInset(800, 500, 0)).toBe(300);
  });

  it("accounts for a non-zero visual-viewport offset (iOS Safari while scrolled)", () => {
    expect(computeKeyboardInset(800, 500, 20)).toBe(280);
  });

  it("ignores sub-pixel rounding noise and never returns a negative inset", () => {
    expect(computeKeyboardInset(800, 800.4, 0)).toBe(0);
    expect(computeKeyboardInset(800, 801, 0)).toBe(0);
  });

  it("rounds a fractional covered height to the nearest pixel", () => {
    expect(computeKeyboardInset(800, 500.6, 0)).toBe(299);
  });

  it("ignores viewport differences while no text field is focused (browser toolbars collapsing on scroll)", () => {
    // Same numbers as a 300px keyboard, but nothing editable has focus: no keyboard, no lift.
    expect(computeKeyboardInset(800, 500, 0, false)).toBe(0);
    expect(computeKeyboardInset(800, 740, 0, false)).toBe(0);
    expect(computeKeyboardInset(800, 500, 0, true)).toBe(300);
  });

  it("follows the keyboard closing and the orientation changing (no stale inset)", () => {
    expect(computeKeyboardInset(800, 500, 0, true)).toBe(300);
    // Keyboard dismissed: focus left the field, viewport restored.
    expect(computeKeyboardInset(800, 800, 0, false)).toBe(0);
    // Rotated to landscape with the keyboard still open: recomputed from the new sizes.
    expect(computeKeyboardInset(400, 180, 0, true)).toBe(220);
  });
});
