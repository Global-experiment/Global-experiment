import { readFileSync } from "node:fs";
import { and, asc, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { RevalidationService } from "../revalidation/revalidation.service.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { IMPORTED_LABEL, loadCmsFixtures } from "../testing/fixtures/load-cms-fixtures.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { cmsDocuments, cmsRevisions } from "./cms.schema.js";
import type { ContentBlock } from "./content.js";

/**
 * The live data model after the one-time Notion import of 2026-11-05: the
 * 11 pages as the import wrote them (the fixture is the same public text),
 * then the editing steps an admin takes on one of them. The import code is
 * gone; these rows stay, so the CMS must keep working on them.
 */
const fixture = JSON.parse(readFileSync(new URL("../testing/fixtures/cms-content.json", import.meta.url), "utf8")) as {
  articles: { slug: string; title: string; displayOrder: number; expertise: string[]; content: ContentBlock[] }[];
};

/** The production dry run of 2026-11-05: the articles in order, with their number of tags. */
const LIVE_ORDER = [
  ["introduction", 4],
  ["version-0-1-scope", 4],
  ["vision-and-what-comes-next", 4],
  ["organisation-and-responsibilities", 4],
  ["privacy-and-personal-data", 4],
  ["technology-infrastructure-and-accessibility", 6],
  ["accessibility", 4],
  ["contributing-feedback-and-issues", 4],
  ["public-treasury", 5],
  ["documentation-publishing-and-synchronisation", 6],
] as const;

describe("the imported Home and Documentation (live since 2026-11-05)", () => {
  let t: TestApp;
  let admin: SignedInAdmin;
  const anonymous = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp({}, [{ provide: RevalidationService, useValue: { revalidate: vi.fn(async () => true) } }]);
    expect(await loadCmsFixtures(t.db, new Date("2026-11-05T11:15:50Z"), { as: "imported" })).toBe(11);
    admin = await signedInAdmin(t);
  });
  afterAll(() => t.close());

  /** Every History event of a document, oldest first (views are counted elsewhere). */
  const events = async (documentId: string) =>
    (
      await t.db
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, "cms_document"), eq(auditEvents.entityId, documentId)))
        .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id))
    ).map((event) => event.action);
  const publicArticles = async () =>
    (await anonymous().get("/api/cms/documentation").expect(200)).body.articles as {
      slug: string;
      title: string;
      displayOrder: number;
      expertise: string[];
      content: ContentBlock[];
    }[];
  const documentBySlug = async (slug: string) => {
    const [row] = await t.db
      .select({ id: cmsDocuments.id })
      .from(cmsDocuments)
      .innerJoin(cmsRevisions, eq(cmsRevisions.id, cmsDocuments.publishedRevisionId))
      .where(eq(cmsRevisions.slug, slug));
    return row!.id;
  };

  it('each of the 11 pages has exactly one revision: version 1, published, live and latest, by "Notion import"', async () => {
    const documents = await t.db.select().from(cmsDocuments);
    expect(documents).toHaveLength(11);
    expect(documents.filter((document) => document.kind === "home")).toHaveLength(1);
    for (const document of documents) {
      const revisions = await t.db.select().from(cmsRevisions).where(eq(cmsRevisions.documentId, document.id));
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({ number: 1, status: "published", authorLabel: IMPORTED_LABEL, authorId: null, publishedByLabel: IMPORTED_LABEL });
      expect(document.publishedRevisionId).toBe(revisions[0]!.id);
      expect(document.latestRevisionId).toBe(revisions[0]!.id);
      expect(document.sourceRef).toMatch(/^notion:/);
      expect(document.archivedAt).toBeNull();
      expect(await events(document.id)).toEqual(["imported", "published"]);
    }
  });

  it("the website shows them in the same order, with the same slugs, tags and text", async () => {
    const articles = await publicArticles();
    expect(articles.map((article) => [article.slug, article.expertise.length])).toEqual(LIVE_ORDER.map(([slug, tags]) => [slug, tags]));
    expect(articles.map((article) => article.displayOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const article of articles) {
      const source = fixture.articles.find((item) => item.slug === article.slug)!;
      expect(article).toMatchObject({ title: source.title, expertise: source.expertise, content: source.content });
    }
    const home = (await anonymous().get("/api/cms/home").expect(200)).body;
    expect(home.content[0]).toMatchObject({ kind: "heading", level: 4 });
    expect(home.content).toHaveLength(15);
  });

  it("anchors stay intact: every slug is a valid, unique anchor, and every link between articles points to one", async () => {
    const articles = await publicArticles();
    const slugs = new Set(articles.map((article) => article.slug));
    expect(slugs.size).toBe(10);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const links = articles.flatMap((article) =>
      article.content.flatMap((block) => {
        const runs = block.kind === "list" ? block.items.flat() : block.kind === "image" ? [] : block.text;
        return runs.flatMap((run) => (run.kind === "link" ? [run.href] : []));
      }),
    );
    const internal = links.filter((href) => href.startsWith("/documentation/"));
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) expect(slugs).toContain(href.replace("/documentation/", "").split("#")[0]);
    // The public history of each shows the one published version.
    for (const slug of slugs) {
      const versions = (await anonymous().get(`/api/cms/documentation/${slug}/versions`).expect(200)).body.versions;
      expect(versions.map((version: { number: number }) => version.number)).toEqual([1]);
    }
  });

  it("editing an imported page: save draft → v2, publish → live, restore → v3; one History event per step; version 1 is never changed", async () => {
    const id = await documentBySlug("introduction");
    const [before] = await t.db.select().from(cmsRevisions).where(eq(cmsRevisions.documentId, id));
    const source = fixture.articles.find((item) => item.slug === "introduction")!;
    const body = { title: source.title, slug: source.slug, expertise: source.expertise, displayOrder: source.displayOrder };

    const draft = (
      await admin
        .post(`/api/admin/cms/documents/${id}/revisions`, {
          ...body,
          content: [...source.content, { kind: "paragraph", text: [{ kind: "text", value: "A new closing paragraph." }] }],
          summary: "Closing paragraph",
          baseRevisionId: before!.id,
        })
        .expect(201)
    ).body;
    expect(draft).toMatchObject({ latest: { number: 2, status: "draft" }, live: { number: 1 }, hasDraft: true });
    expect(await events(id)).toEqual(["imported", "published", "updated"]);
    expect((await publicArticles()).find((article) => article.slug === "introduction")!.content).toEqual(source.content);

    const live = (await admin.post(`/api/admin/cms/documents/${id}/publish`, { revisionId: draft.latest.id }).expect(200)).body;
    expect(live).toMatchObject({ live: { number: 2 }, hasDraft: false });
    expect(await events(id)).toEqual(["imported", "published", "updated", "published"]);
    expect((await publicArticles()).find((article) => article.slug === "introduction")!.content).toHaveLength(source.content.length + 1);

    const restored = (await admin.post(`/api/admin/cms/documents/${id}/revisions/${before!.id}/restore`, { publish: false }).expect(200)).body;
    expect(restored).toMatchObject({ latest: { number: 3, status: "draft", restoredFrom: 1 }, live: { number: 2 } });
    expect(await events(id)).toEqual(["imported", "published", "updated", "published", "updated"]);

    await admin.post(`/api/admin/cms/documents/${id}/publish`, { revisionId: restored.latest.id }).expect(200);
    expect(await events(id)).toEqual(["imported", "published", "updated", "published", "updated", "published"]);
    expect((await publicArticles()).find((article) => article.slug === "introduction")!.content).toEqual(source.content);

    // Version 1, as imported, is untouched; the public history now lists 3, 2, 1.
    const [after] = await t.db.select().from(cmsRevisions).where(eq(cmsRevisions.id, before!.id));
    expect(after).toEqual(before);
    const versions = (await anonymous().get("/api/cms/documentation/introduction/versions").expect(200)).body.versions;
    expect(versions.map((version: { number: number }) => version.number)).toEqual([3, 2, 1]);
    // The other ten pages are unchanged.
    expect((await t.db.select().from(cmsRevisions)).length).toBe(13);
  });
});
