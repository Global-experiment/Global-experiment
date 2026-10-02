import { describe, expect, it } from "vitest";
import { focusRow, initialAccordionState, isExpanded, queryChanged, toggleRow } from "./accordionState";

describe("documentation accordion state", () => {
  it("starts collapsed and toggles rows independently", () => {
    let state = initialAccordionState;
    expect(isExpanded(state, "a", false)).toBe(false);
    state = toggleRow(state, "a", false);
    state = toggleRow(state, "b", false);
    expect(isExpanded(state, "a", false)).toBe(true);
    expect(isExpanded(state, "b", false)).toBe(true);
    state = toggleRow(state, "a", false);
    expect(isExpanded(state, "a", false)).toBe(false);
  });

  it("auto-expands every match while searching, without touching the normal accordion", () => {
    const state = toggleRow(initialAccordionState, "a", false);
    expect(isExpanded(state, "a", true)).toBe(true);
    expect(isExpanded(state, "b", true)).toBe(true);
    // Clearing the search returns to exactly what was open before.
    expect(isExpanded(state, "b", false)).toBe(false);
    expect(isExpanded(state, "a", false)).toBe(true);
  });

  it("lets a match be folded during a search until the query changes", () => {
    let state = toggleRow(initialAccordionState, "b", true);
    expect(isExpanded(state, "b", true)).toBe(false);
    expect(isExpanded(state, "b", false)).toBe(false);
    state = queryChanged(state);
    expect(isExpanded(state, "b", true)).toBe(true);
  });

  it("a deep link expands only the target", () => {
    let state = toggleRow(toggleRow(initialAccordionState, "a", false), "b", false);
    state = focusRow("c");
    expect(isExpanded(state, "c", false)).toBe(true);
    expect(isExpanded(state, "a", false)).toBe(false);
    expect(isExpanded(state, "b", false)).toBe(false);
  });
});
