import { describe, expect, it } from "vitest";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { isPubliclyVisible, mapNotionPageProperties, toArticleSummary } from "./notionPropertyMapper";

// Synthetic fixtures only — never derived from the real Notion export.
// Real Notion property objects carry more fields than our mapper reads;
// casting a minimal shape keeps these tests focused.
function page(properties: Record<string, unknown>, overrides: Record<string, unknown> = {}): PageObjectResponse {
  return {
    id: "page-id",
    created_time: "2026-01-01T00:00:00.000Z",
    properties,
    ...overrides,
  } as unknown as PageObjectResponse;
}

const publishedTitle = { type: "title", title: [{ plain_text: "Introduction" }] };
const publishedSlug = { type: "rich_text", rich_text: [{ plain_text: "introduction" }] };
const publishedStatus = { type: "select", select: { name: "Published" } };
const publishedDate = { type: "date", date: { start: "2026-08-29" } };
const displayOrderOne = { type: "number", number: 1 };
const expertiseTags = { type: "multi_select", multi_select: [{ name: "Civic technology" }] };
const notArchivedCheckbox = { type: "checkbox", checkbox: false };
const archivedCheckbox = { type: "checkbox", checkbox: true };

function validPublishedPage(overrides: Record<string, unknown> = {}) {
  return page({
    Name: publishedTitle,
    Slug: publishedSlug,
    Status: publishedStatus,
    "Published at": publishedDate,
    "Display order": displayOrderOne,
    Expertise: expertiseTags,
    Archive: notArchivedCheckbox,
    ...overrides,
  });
}

describe("mapNotionPageProperties", () => {
  it("maps a well-formed published page", () => {
    const mapped = mapNotionPageProperties(validPublishedPage());
    expect(mapped).toMatchObject({
      slug: "introduction",
      title: "Introduction",
      displayOrder: 1,
      expertise: ["Civic technology"],
      status: "Published",
      archived: false,
    });
    expect(mapped?.publishedAt).toEqual(new Date("2026-08-29"));
  });

  it("returns null when the title is missing", () => {
    const mapped = mapNotionPageProperties(
      validPublishedPage({ Name: { type: "title", title: [] } }),
    );
    expect(mapped).toBeNull();
  });

  it("returns null when the slug is missing", () => {
    const mapped = mapNotionPageProperties(
      validPublishedPage({ Slug: { type: "rich_text", rich_text: [] } }),
    );
    expect(mapped).toBeNull();
  });

  it("falls back display order to sort-last when missing or invalid, without excluding the article", () => {
    const missing = mapNotionPageProperties(validPublishedPage({ "Display order": undefined }));
    expect(missing).not.toBeNull();
    expect(missing?.displayOrder).toBe(Number.MAX_SAFE_INTEGER);

    const wrongType = mapNotionPageProperties(
      validPublishedPage({ "Display order": { type: "rich_text", rich_text: [{ plain_text: "one" }] } }),
    );
    expect(wrongType?.displayOrder).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("defaults to the page's created_time when Published at is missing", () => {
    const mapped = mapNotionPageProperties(
      validPublishedPage({ "Published at": { type: "date", date: null } }),
    );
    expect(mapped?.publishedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("reads a non-empty Archive relation (the live property type) as archived", () => {
    const archived = mapNotionPageProperties(
      validPublishedPage({ Archive: { type: "relation", relation: [{ id: "archive-entry" }] } }),
    );
    expect(archived?.archived).toBe(true);
    expect(isPubliclyVisible(archived!)).toBe(false);
  });

  it("reads an empty Archive relation as not archived", () => {
    const live = mapNotionPageProperties(validPublishedPage({ Archive: { type: "relation", relation: [] } }));
    expect(live?.archived).toBe(false);
    expect(isPubliclyVisible(live!)).toBe(true);
  });

  it("reads a checked Archive checkbox as archived", () => {
    const mapped = mapNotionPageProperties(validPublishedPage({ Archive: archivedCheckbox }));
    expect(mapped?.archived).toBe(true);
  });
});

describe("isPubliclyVisible", () => {
  it("includes an article that is Published and not archived", () => {
    const mapped = mapNotionPageProperties(validPublishedPage());
    expect(mapped).not.toBeNull();
    expect(isPubliclyVisible(mapped!)).toBe(true);
  });

  it("excludes an article with any status other than Published", () => {
    const mapped = mapNotionPageProperties(
      validPublishedPage({ Status: { type: "select", select: { name: "Draft" } } }),
    );
    expect(isPubliclyVisible(mapped!)).toBe(false);
  });

  it("excludes an article with no status set", () => {
    const mapped = mapNotionPageProperties(validPublishedPage({ Status: { type: "select", select: null } }));
    expect(isPubliclyVisible(mapped!)).toBe(false);
  });

  it("excludes an archived article even if Status is Published", () => {
    const mapped = mapNotionPageProperties(validPublishedPage({ Archive: archivedCheckbox }));
    expect(isPubliclyVisible(mapped!)).toBe(false);
  });
});

describe("toArticleSummary", () => {
  it("drops internal Notion-only fields (status, archived) from the application-owned shape", () => {
    const mapped = mapNotionPageProperties(validPublishedPage())!;
    const summary = toArticleSummary(mapped);
    expect(summary).toEqual({
      slug: "introduction",
      title: "Introduction",
      displayOrder: 1,
      expertise: ["Civic technology"],
      publishedAt: mapped.publishedAt,
    });
    expect(summary).not.toHaveProperty("status");
    expect(summary).not.toHaveProperty("archived");
  });
});

describe("display ordering", () => {
  it("sorts mapped pages by displayOrder ascending", () => {
    const pages = [
      mapNotionPageProperties(validPublishedPage({ "Display order": { type: "number", number: 3 } }))!,
      mapNotionPageProperties(validPublishedPage({ "Display order": { type: "number", number: 1 } }))!,
      mapNotionPageProperties(validPublishedPage({ "Display order": { type: "number", number: 2 } }))!,
    ];
    const sorted = pages.slice().sort((a, b) => a.displayOrder - b.displayOrder);
    expect(sorted.map((p) => p.displayOrder)).toEqual([1, 2, 3]);
  });
});
