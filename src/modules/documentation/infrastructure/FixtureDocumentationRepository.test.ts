import { describe, expect, it } from "vitest";
import { FixtureDocumentationRepository } from "./FixtureDocumentationRepository";

describe("FixtureDocumentationRepository", () => {
  it("lists articles sorted by display order without leaking content blocks", async () => {
    const repo = new FixtureDocumentationRepository();
    const articles = await repo.listPublished();

    expect(articles.length).toBeGreaterThan(0);
    expect(articles).toEqual([...articles].sort((a, b) => a.displayOrder - b.displayOrder));
    for (const article of articles) {
      expect(article).not.toHaveProperty("content");
    }
  });

  it("returns null for an unknown slug", async () => {
    const repo = new FixtureDocumentationRepository();
    expect(await repo.getBySlug("does-not-exist")).toBeNull();
  });

  it("returns full content for a known slug", async () => {
    const repo = new FixtureDocumentationRepository();
    const article = await repo.getBySlug("introduction");
    expect(article?.content.length).toBeGreaterThan(0);
  });
});
