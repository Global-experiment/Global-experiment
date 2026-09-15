import type { DocumentationRepository } from "@/modules/documentation/domain/DocumentationRepository";
import type { DocumentationArticle, DocumentationArticleSummary } from "@/modules/documentation/domain/types";

/**
 * In-memory repository used when Notion credentials aren't configured, so
 * the Documentation UI can be built and browsed locally before live
 * credentials arrive. Content here is illustrative placeholder text, not a
 * copy of the real client content from the Notion export.
 */
const fixtureArticles: DocumentationArticle[] = [
  {
    slug: "introduction",
    title: "Introduction",
    displayOrder: 1,
    expertise: ["Civic technology", "Privacy engineering"],
    publishedAt: new Date("2026-08-29"),
    content: [
      { kind: "heading", level: 1, text: [{ kind: "text", value: "Summary" }] },
      {
        kind: "paragraph",
        text: [
          {
            kind: "text",
            value: "Fixture content for local development — replaced by live Notion content once credentials are configured.",
          },
        ],
      },
    ],
  },
  {
    slug: "version-0-1-scope",
    title: "Version 0.1 scope",
    displayOrder: 2,
    expertise: ["Platform governance"],
    publishedAt: new Date("2026-08-29"),
    content: [
      { kind: "heading", level: 1, text: [{ kind: "text", value: "Summary" }] },
      {
        kind: "paragraph",
        text: [
          { kind: "text", value: "See the " },
          { kind: "link", value: "Introduction", href: "/documentation/introduction" },
          { kind: "text", value: " article for context. Fixture content only." },
        ],
      },
    ],
  },
];

export class FixtureDocumentationRepository implements DocumentationRepository {
  async listPublished(): Promise<DocumentationArticleSummary[]> {
    return fixtureArticles
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((article): DocumentationArticleSummary => {
        const { slug, title, displayOrder, expertise, publishedAt } = article;
        return { slug, title, displayOrder, expertise, publishedAt };
      });
  }

  async getBySlug(slug: string): Promise<DocumentationArticle | null> {
    return fixtureArticles.find((article) => article.slug === slug) ?? null;
  }
}
