import { describe, expect, it } from "vitest";
import { cleanSvg, fileNameFor } from "./cleanSvg.mjs";

/** As Google serves a Material Symbol (fonts.gstatic.com), and as a design tool exports one. */
const MATERIAL = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M480-480q-66 0-113-47t-47-113Z"/></svg>';
const EXPORTED = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: a design tool -->
<svg id="Layer_1" class="icon" style="display: block;" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16px" height="16px" viewBox='0 0 16 16' version="1.1">
  <title>manage accounts</title>
  <g id="Vector" fill="#B2B2B2">
    <path id="Shape" fill="white" d="M2 2h12v12H2z"/>
    <path fill="none" stroke="#000" d="M1 1h14"/>
  </g>
</svg>`;

describe("icon cleaning (npm run icons:add)", () => {
  it("keeps the viewBox and the shapes, takes its colour from the text, and has no size", () => {
    expect(cleanSvg(MATERIAL)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-480q-66 0-113-47t-47-113Z"/></svg>\n',
    );
  });

  it("drops every export leftover: declaration, comments, title, ids, classes, styles, data attributes, fixed colours", () => {
    const cleaned = cleanSvg(EXPORTED);
    expect(cleaned).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><g><path d="M2 2h12v12H2z"/><path fill="none" stroke="currentColor" d="M1 1h14"/></g></svg>\n',
    );
    expect(cleaned).not.toMatch(/width|height|id=|class=|style=|data-|<title|<\?xml|<!--|#B2B2B2|white/);
  });

  it("refuses what isn't a plain vector icon", () => {
    expect(() => cleanSvg("<!DOCTYPE html><html></html>")).toThrow("Not an SVG file.");
    expect(() => cleanSvg('<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>')).toThrow(/refused/);
    expect(() => cleanSvg('<svg viewBox="0 0 24 24"><path onclick="x()" d="M0 0"/></svg>')).toThrow(/refused/);
    expect(() => cleanSvg('<svg viewBox="0 0 24 24"><image href="https://example.org/a.png"/></svg>')).toThrow(/refused/);
    expect(() => cleanSvg('<svg width="24" height="24"><path d="M0 0"/></svg>')).toThrow(/viewBox/);
  });

  it("names the file like the project's other icons", () => {
    expect(fileNameFor("manage_accounts")).toBe("manage-accounts.svg");
    expect(fileNameFor("home", true)).toBe("home-filled.svg");
  });
});
