import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./mapWithConcurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const items = [30, 10, 20];
    const result = await mapWithConcurrency(items, 3, (ms) => new Promise((r) => setTimeout(() => r(ms), ms)));
    expect(result).toEqual([30, 10, 20]);
  });

  it("never runs more than `concurrency` calls at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i * 2;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("maps every item exactly once", async () => {
    const items = ["a", "b", "c", "d", "e"];
    const result = await mapWithConcurrency(items, 2, async (item) => item.toUpperCase());
    expect(result).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("handles an empty input without hanging", async () => {
    const result = await mapWithConcurrency([], 3, async () => 1);
    expect(result).toEqual([]);
  });

  it("propagates a rejection", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
