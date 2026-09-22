import { describe, expect, it } from "vitest";
import { buildSearchHaystack, searchArticles } from "./searchArticles";
import type { DocumentationArticle } from "@/modules/documentation/domain/types";

function article(overrides: Partial<DocumentationArticle> = {}): DocumentationArticle {
  return {
    slug: "introduction",
    title: "Introduction",
    displayOrder: 1,
    expertise: ["Civic technology"],
    publishedAt: new Date("2026-08-12T09:14:00.000Z"),
    content: [
      { kind: "heading", level: 1, text: [{ kind: "text", value: "Summary" }] },
      { kind: "paragraph", text: [{ kind: "text", value: "A shared civic infrastructure for participation." }] },
    ],
    ...overrides,
  };
}

describe("buildSearchHaystack", () => {
  it("includes the title, expertise tags, and body text, lowercased", () => {
    const haystack = buildSearchHaystack(article());
    expect(haystack).toContain("introduction");
    expect(haystack).toContain("civic technology");
    expect(haystack).toContain("shared civic infrastructure");
  });

  it("skips unsupported blocks without throwing", () => {
    const haystack = buildSearchHaystack(
      article({ content: [{ kind: "unsupported", type: "image" }] }),
    );
    expect(haystack).toContain("introduction");
  });
});

describe("searchArticles", () => {
  const articles = [
    article({ slug: "introduction", title: "Introduction", expertise: ["Civic technology"] }),
    article({
      slug: "accessibility",
      title: "Accessibility",
      expertise: ["WCAG"],
      content: [{ kind: "paragraph", text: [{ kind: "text", value: "Screen reader support is required." }] }],
    }),
  ];
  const haystacks = new Map(articles.map((a) => [a.slug, buildSearchHaystack(a)]));

  it("returns every article for an empty query", () => {
    expect(searchArticles(articles, haystacks, "")).toHaveLength(2);
    expect(searchArticles(articles, haystacks, "   ")).toHaveLength(2);
  });

  it("matches by title", () => {
    expect(searchArticles(articles, haystacks, "Introduction").map((a) => a.slug)).toEqual(["introduction"]);
  });

  it("matches by expertise tag even when the tag doesn't appear in the title or body", () => {
    expect(searchArticles(articles, haystacks, "WCAG").map((a) => a.slug)).toEqual(["accessibility"]);
  });

  it("matches by full body text, not just the title", () => {
    expect(searchArticles(articles, haystacks, "screen reader").map((a) => a.slug)).toEqual(["accessibility"]);
  });

  it("is case-insensitive", () => {
    expect(searchArticles(articles, haystacks, "SCREEN READER").map((a) => a.slug)).toEqual(["accessibility"]);
  });

  it("returns no results for a non-matching query", () => {
    expect(searchArticles(articles, haystacks, "nonexistent")).toEqual([]);
  });
});
