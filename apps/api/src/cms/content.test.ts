import { describe, expect, it } from "vitest";
import { Content, diffContent, isSafeHref, plainText, type ContentBlock } from "./content.js";

const p = (value: string): ContentBlock => ({ kind: "paragraph", text: [{ kind: "text", value }] });
const h = (value: string, level: 1 | 2 | 3 | 4 = 2): ContentBlock => ({ kind: "heading", level, text: [{ kind: "text", value }] });

describe("the content model (ADR 019: the sanitizing step)", () => {
  it("accepts https, http, mailto, site paths and anchors only", () => {
    for (const href of ["https://example.org", "http://example.org/a?b#c", "mailto:someone@example.org", "/documentation/x", "/", "#summary"])
      expect(isSafeHref(href), href).toBe(true);
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "//evil.example/x",
      "/\\evil.example",
      "mailto:",
      "#",
      "",
      "https://",
      "ftp://example.org",
      "https://exa mple.org",
    ])
      expect(isSafeHref(href), href).toBe(false);
  });

  it("refuses unknown blocks and fields, drops control characters, keeps markup as plain text", () => {
    expect(Content.safeParse([{ kind: "script", value: "x" }]).success).toBe(false);
    expect(Content.safeParse([{ kind: "paragraph", text: [{ kind: "text", value: "x", style: "color:red" }] }]).success).toBe(false);
    expect(Content.safeParse([{ kind: "heading", level: 5, text: [] }]).success).toBe(false);
    expect(Content.safeParse([{ kind: "list", ordered: false, items: [] }]).success).toBe(false);
    expect(Content.safeParse([{ kind: "image", imageId: "not-a-uuid" }]).success).toBe(false);
    const parsed = Content.parse([{ kind: "paragraph", text: [{ kind: "text", value: "<b>bold</b>\u0000\u001b ok\n\tline" }] }]);
    expect(parsed).toEqual([{ kind: "paragraph", text: [{ kind: "text", value: "<b>bold</b> ok\n\tline" }] }]);
  });

  it("limits a page's size", () => {
    expect(Content.safeParse(Array.from({ length: 601 }, () => p("x"))).success).toBe(false);
    expect(Content.safeParse(Array.from({ length: 16 }, () => p("x".repeat(20_000)))).success).toBe(false);
  });

  it("diffs block by block: what was removed and what was added (the history's Content change)", () => {
    const before = [h("Summary"), p("Version 0.1 is a website."), h("Purpose"), p("Foundations.")];
    const after = [
      h("Summary"),
      p("Version 0.1 is a public website."),
      h("Purpose"),
      p("Foundations."),
      { kind: "list", ordered: false, items: [[{ kind: "text", value: "One" }]] } as ContentBlock,
    ];
    const { removed, added } = diffContent(before, after);
    expect(removed.map((line) => line.label)).toEqual(["Version 0.1 is a website."]);
    expect(added.map((line) => [line.id.split(":")[0], line.label])).toEqual([
      ["p", "Version 0.1 is a public website."],
      ["ul", "One"],
    ]);
    // A heading that becomes a paragraph is a change too.
    expect(diffContent([h("Same")], [p("Same")]).removed).toHaveLength(1);
    expect(diffContent(before, before)).toEqual({ removed: [], added: [] });
    expect(plainText(before)).toContain("Foundations.");
  });
});
