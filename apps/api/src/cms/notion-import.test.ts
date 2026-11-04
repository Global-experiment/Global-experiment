import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { FILE_STORAGE, LocalDiskStorage } from "../files/file-storage.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { cmsDocuments, cmsImages, cmsRevisions } from "./cms.schema.js";
import { CmsService } from "./cms.service.js";
import { applyImport, formatPlan, mapNotionBlocks, normalizeLink, planImport, type NotionBlock, type NotionPage, type NotionSource } from "./notion-import.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const rt = (plain_text: string, href: string | null = null) => ({ plain_text, href });
const block = (type: string, data: Record<string, unknown> = {}, children?: NotionBlock[]): NotionBlock => ({
  id: `${type}-${Math.random()}`,
  type,
  [type]: data,
  children,
});
const para = (text: string) => block("paragraph", { rich_text: [rt(text)] });

const page = (id: string, properties: NotionPage["properties"], edited = "2026-09-29T10:00:00.000Z"): NotionPage => ({
  id,
  created_time: "2026-08-01T00:00:00.000Z",
  last_edited_time: edited,
  properties,
});
const article = (id: string, title: string, slug: string, order: number, extra: NotionPage["properties"] = {}) =>
  page(id, {
    Name: { type: "title", title: [rt(title)] },
    Slug: { type: "rich_text", rich_text: [rt(slug)] },
    "Display order": { type: "number", number: order },
    Expertise: { type: "multi_select", multi_select: [{ name: "Civic technology" }, { name: "Data governance" }] },
    Status: { type: "select", select: { name: "Published" } },
    Archive: { type: "relation", relation: [] },
    "Published at": { type: "date", date: { start: "2026-08-29" } },
    ...extra,
  });

function fakeNotion(overrides: Partial<{ articles: { page: NotionPage; blocks: NotionBlock[] }[] }> = {}): NotionSource {
  return {
    homePage: async () => ({
      page: page("home-page", {}, "2026-10-17T18:29:00.000Z"),
      blocks: [
        block("heading_4", { rich_text: [rt("A global space.")] }),
        block("heading_2", { rich_text: [rt("Purpose and principles")] }),
        block("heading_3", { rich_text: [rt("Open")] }),
        para("Transparent."),
      ],
    }),
    documentationPages: async () =>
      overrides.articles ?? [
        {
          page: article("a1", "Introduction", "introduction", 1),
          blocks: [
            block("heading_2", { rich_text: [rt("Summary")] }),
            block("paragraph", { rich_text: [rt("See "), rt("the scope", "https://globalexperiment.org/documentation/version-0-1-scope")] }),
            block("bulleted_list_item", { rich_text: [rt("One")] }, [block("bulleted_list_item", { rich_text: [rt("One, nested")] })]),
            block("bulleted_list_item", { rich_text: [rt("Two")] }),
            block("image", { type: "file", file: { url: "https://files.example.org/diagram.png" }, caption: [rt("A diagram")] }),
            block("divider"),
            para("   "),
          ],
        },
        { page: article("a2", "Version 0.1 scope", "version-0-1-scope", 2), blocks: [para("Scope.")] },
        { page: article("a3", "Old notes", "old-notes", 3, { Status: { type: "select", select: { name: "Draft" } } }), blocks: [para("Not yet.")] },
        { page: article("a4", "Retired", "retired", 4, { Archive: { type: "relation", relation: [{ id: "x" }] } }), blocks: [para("Gone.")] },
      ],
    download: async () => PNG,
  };
}

describe("the one-time Notion import", () => {
  it("maps blocks as the website showed them: headings, paragraphs, links (site links made relative), lists, images; skips the rest", () => {
    const mapped = mapNotionBlocks([
      block("heading_1", { rich_text: [rt("Title")] }),
      block("numbered_list_item", { rich_text: [rt("First")] }),
      block("numbered_list_item", { rich_text: [rt("Second")] }),
      block("bulleted_list_item", { rich_text: [rt("Bullet")] }),
      block("table"),
      block("table"),
    ]);
    expect(mapped.blocks).toEqual([
      { kind: "heading", level: 1, text: [{ kind: "text", value: "Title" }] },
      { kind: "list", ordered: true, items: [[{ kind: "text", value: "First" }], [{ kind: "text", value: "Second" }]] },
      { kind: "list", ordered: false, items: [[{ kind: "text", value: "Bullet" }]] },
    ]);
    expect(mapped.unsupported).toEqual({ table: 2 });
    expect(normalizeLink("https://globalexperiment.org/documentation/x#y")).toBe("/documentation/x#y");
    expect(normalizeLink("https://example.org/documentation/x")).toBe("https://example.org/documentation/x");
  });

  describe("against a database", () => {
    let t: TestApp;
    let storageDir: string;
    beforeAll(async () => {
      storageDir = await mkdtemp(join(tmpdir(), "ge-import-"));
      t = await createTestApp({}, [{ provide: FILE_STORAGE, useValue: new LocalDiskStorage(storageDir) }]);
    });
    afterAll(async () => {
      await t.close();
      await rm(storageDir, { recursive: true, force: true });
    });

    it("the dry run reports every page and writes nothing; problems stop the import", async () => {
      const plan = await planImport(t.db, fakeNotion());
      const report = formatPlan(plan, "DRY RUN");
      expect(report).toContain("Documentation — 4 page(s) in Notion: 2 published, 1 not published (imported as drafts), 1 archived (imported archived)");
      expect(report).toContain('introduction — "Introduction"');
      expect(report).toContain("skipped as on the website: divider ×1");
      expect(report).toContain("1 nested list item(s) kept one level up");
      expect(report).toContain('tagline: "A global space."');
      expect(report).toContain("Would create: 5 document(s)");
      expect(report).toContain("No problems found.");
      expect((await t.db.select().from(cmsDocuments)).length).toBe(0);

      const clash = await planImport(
        t.db,
        fakeNotion({
          articles: [
            { page: article("b1", "A", "same", 1), blocks: [] },
            { page: article("b2", "B", "same", 2), blocks: [] },
          ],
        }),
      );
      expect(clash.problems).toEqual(['"B" and "A" share the slug "same"']);
      await expect(applyImport(t.db, new LocalDiskStorage(storageDir), fakeNotion(), clash)).rejects.toThrow(/Refusing to import/);
    });

    it("imports once: revision 1 by Notion import, published pages live with their order, tags, dates and images; then refuses to run again", async () => {
      const source = fakeNotion();
      const result = await applyImport(t.db, new LocalDiskStorage(storageDir), source, await planImport(t.db, source), new Date("2026-11-05T09:00:00.000Z"));
      expect(result).toEqual({ documents: 5, images: 1 });

      const service = t.app.get(CmsService);
      const home = await service.publicHome();
      expect(home!.content[0]).toEqual({ kind: "heading", level: 4, text: [{ kind: "text", value: "A global space." }] });
      const articles = await service.publicArticles();
      expect(articles.map((item) => item.slug)).toEqual(["introduction", "version-0-1-scope"]);
      expect(articles[0]).toMatchObject({
        expertise: ["Civic technology", "Data governance"],
        publishedAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-09-29T10:00:00.000Z",
      });
      expect(articles[0]!.content[1]).toEqual({
        kind: "paragraph",
        text: [
          { kind: "text", value: "See " },
          { kind: "link", value: "the scope", href: "/documentation/version-0-1-scope" },
        ],
      });
      expect(articles[0]!.content[2]).toMatchObject({ kind: "list", items: [[{ value: "One" }], [{ value: "One, nested" }], [{ value: "Two" }]] });
      const [image] = await t.db.select().from(cmsImages);
      expect(articles[0]!.content[3]).toEqual({ kind: "image", imageId: image!.id, alt: "A diagram" });
      expect((await service.publicImage(image!.id)).contentType).toBe("image/png");

      const revisions = await t.db.select().from(cmsRevisions);
      expect(new Set(revisions.map((revision) => revision.authorLabel))).toEqual(new Set(["Notion import"]));
      expect(revisions.every((revision) => revision.number === 1)).toBe(true);
      const [draft] = await t.db.select().from(cmsDocuments).where(eq(cmsDocuments.sourceRef, "notion:a3"));
      expect(draft).toMatchObject({ publishedRevisionId: null, archivedAt: null });
      const [archived] = await t.db.select().from(cmsDocuments).where(eq(cmsDocuments.sourceRef, "notion:a4"));
      expect(archived!.archivedAt).not.toBeNull();
      const events = await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, draft!.id));
      expect(events.map((event) => [event.action, event.actorLabel, event.source])).toEqual([["imported", "Notion import", "import"]]);

      const again = await planImport(t.db, source);
      expect(again.problems).toEqual(["5 native page(s) already exist: the import runs once, on empty tables"]);
    });
  });
});
