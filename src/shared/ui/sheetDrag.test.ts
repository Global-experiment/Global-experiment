import { describe, expect, it } from "vitest";
import { contentGestureOwner, DISTANCE_MAX_PX, recentVelocity, sheetDragOffset, shouldDismissSheet } from "./sheetDrag";

describe("sheet drag", () => {
  it("never moves the sheet above its resting position", () => {
    expect(sheetDragOffset(-40)).toBe(0);
    expect(sheetDragOffset(0)).toBe(0);
    expect(sheetDragOffset(35)).toBe(35);
  });

  it("closes past the distance threshold (25% of height, capped)", () => {
    expect(shouldDismissSheet({ offset: 49, velocity: 0, height: 200 })).toBe(false);
    expect(shouldDismissSheet({ offset: 50, velocity: 0, height: 200 })).toBe(true);
    // Tall sheet: the cap applies.
    expect(shouldDismissSheet({ offset: DISTANCE_MAX_PX, velocity: 0, height: 800 })).toBe(true);
    expect(shouldDismissSheet({ offset: DISTANCE_MAX_PX - 1, velocity: 0, height: 800 })).toBe(false);
  });

  it("closes on a fast downward flick, but not on a tap or an upward flick", () => {
    expect(shouldDismissSheet({ offset: 20, velocity: 0.8, height: 600 })).toBe(true);
    expect(shouldDismissSheet({ offset: 5, velocity: 2, height: 600 })).toBe(false);
    expect(shouldDismissSheet({ offset: 40, velocity: -1, height: 600 })).toBe(false);
  });

  it("snaps back on a slow, short drag", () => {
    expect(shouldDismissSheet({ offset: 30, velocity: 0.1, height: 600 })).toBe(false);
  });

  it("lets a content swipe drag the sheet only from the top and mostly downward", () => {
    expect(contentGestureOwner({ dx: 2, dy: 3, scrollTop: 0 })).toBe("undecided");
    expect(contentGestureOwner({ dx: 1, dy: 20, scrollTop: 0 })).toBe("drag");
    // Upward swipe, sideways swipe, or content already scrolled: native scrolling.
    expect(contentGestureOwner({ dx: 0, dy: -20, scrollTop: 0 })).toBe("scroll");
    expect(contentGestureOwner({ dx: 30, dy: 10, scrollTop: 0 })).toBe("scroll");
    expect(contentGestureOwner({ dx: 0, dy: 20, scrollTop: 40 })).toBe("scroll");
  });

  it("measures velocity over the recent window only", () => {
    expect(recentVelocity([])).toBe(0);
    expect(recentVelocity([{ y: 0, t: 0 }])).toBe(0);
    expect(
      recentVelocity([
        { y: 0, t: 0 },
        { y: 10, t: 500 }, // slow start, outside the window
        { y: 60, t: 550 },
        { y: 110, t: 600 },
      ]),
    ).toBe(1);
    expect(
      recentVelocity([
        { y: 100, t: 0 },
        { y: 50, t: 50 },
      ]),
    ).toBe(-1);
  });
});
