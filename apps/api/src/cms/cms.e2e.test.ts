import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adminRolePermissions, adminRoles } from "../auth/auth.schema.js";
import { FILE_STORAGE, LocalDiskStorage } from "../files/file-storage.js";
import { RevalidationService } from "../revalidation/revalidation.service.js";
import { signedInAdmin, signedInAs, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, TEST_ORIGIN, type TestApp } from "../testing/test-app.js";
import { cmsRevisions } from "./cms.schema.js";
import type { ContentBlock } from "./content.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const text = (value: string) => [{ kind: "text" as const, value }];
const paragraph = (value: string): ContentBlock => ({ kind: "paragraph", text: text(value) });
const heading = (value: string, level: 1 | 2 | 3 | 4 = 2): ContentBlock => ({ kind: "heading", level, text: text(value) });

const article = (overrides: Record<string, unknown> = {}) => ({
  title: "Version 0.1 scope",
  slug: "version-0-1-scope",
  expertise: ["Civic technology", "Data governance"],
  displayOrder: 2,
  content: [heading("Summary"), paragraph("Version 0.1 is a public information website.")],
  ...overrides,
});

describe("native Home and Documentation (ADR 020)", () => {
  let t: TestApp;
  let admin: SignedInAdmin;
  let storageDir: string;
  const revalidate = vi.fn(async () => true);
  const anonymous = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "ge-cms-"));
    t = await createTestApp({}, [
      { provide: RevalidationService, useValue: { revalidate } },
      { provide: FILE_STORAGE, useValue: new LocalDiskStorage(storageDir) },
    ]);
    admin = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
    await rm(storageDir, { recursive: true, force: true });
  });
  beforeEach(() => revalidate.mockClear());

  const history = async (id: string) =>
    (await admin.get(`/api/admin/history/cms_document/${id}`).expect(200)).body.items as {
      action: string;
      changes: { field: string; before: unknown; after: unknown }[];
      meta: Record<string, unknown>;
      actor: { label: string };
    }[];
  const publicArticles = async () =>
    (await anonymous().get("/api/cms/documentation").expect(200)).body.articles as { slug: string; title: string; content: ContentBlock[] }[];

  it("a new document is a draft (revision 1), not on the website until published; publishing revalidates Documentation", async () => {
    const created = (await admin.post("/api/admin/cms/documents", article()).expect(201)).body;
    expect(created).toMatchObject({
      kind: "article",
      state: "draft",
      hasDraft: false,
      live: null,
      latest: { number: 1, status: "draft", title: "Version 0.1 scope" },
    });
    expect(created.permissions).toEqual({ edit: true, publish: true });
    expect(await publicArticles()).toEqual([]);
    expect(revalidate).not.toHaveBeenCalled();

    const published = (await admin.post(`/api/admin/cms/documents/${created.id}/publish`, { revisionId: created.latest.id }).expect(200)).body;
    expect(published).toMatchObject({ state: "published", live: { number: 1 }, firstPublishedAt: expect.any(String) });
    expect(revalidate).toHaveBeenCalledWith(["documentation"]);
    expect(await publicArticles()).toMatchObject([
      { slug: "version-0-1-scope", title: "Version 0.1 scope", expertise: ["Civic technology", "Data governance"] },
    ]);
    expect((await history(created.id)).map((item) => item.action)).toEqual(["published", "created"]);
  });

  it("every save is a new revision with its author and time; the published one stays what visitors see until the next publication", async () => {
    const created = (await admin.post("/api/admin/cms/documents", article({ slug: "revisions", title: "Revisions", publish: true })).expect(201)).body;
    const saved = (
      await admin
        .post(`/api/admin/cms/documents/${created.id}/revisions`, {
          ...article({ slug: "revisions", title: "Revisions, edited" }),
          content: [heading("Summary"), paragraph("A clearer explanation.")],
          summary: "Clearer summary",
          baseRevisionId: created.latest.id,
        })
        .expect(201)
    ).body;
    expect(saved).toMatchObject({
      state: "published",
      hasDraft: true,
      latest: { number: 2, status: "draft", summary: "Clearer summary", author: expect.any(String) },
      live: { number: 1 },
    });
    expect((await publicArticles()).find((item) => item.slug === "revisions")!.title).toBe("Revisions");

    // The history names the changed fields, content as removed → added blocks (p7/p10).
    const [updated] = await history(created.id);
    expect(updated).toMatchObject({ action: "updated", meta: { revision: 2, summary: "Clearer summary" } });
    expect(updated!.changes.map((change) => change.field)).toEqual(["title", "content"]);
    expect(updated!.changes[1]).toMatchObject({
      before: [{ label: "Version 0.1 is a public information website." }],
      after: [{ label: "A clearer explanation." }],
    });

    // Saving the same thing again makes no revision; a save from an old version is refused (someone saved in between).
    const same = await admin.post(`/api/admin/cms/documents/${created.id}/revisions`, {
      ...article({ slug: "revisions", title: "Revisions, edited" }),
      content: [heading("Summary"), paragraph("A clearer explanation.")],
      baseRevisionId: saved.latest.id,
    });
    expect(same.body.latest.number).toBe(2);
    const stale = await admin.post(`/api/admin/cms/documents/${created.id}/revisions`, {
      ...article({ slug: "revisions" }),
      baseRevisionId: created.latest.id,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toEqual({ reason: "stale" });

    // Publish the draft: the website changes, the first publication date stays.
    const live = (await admin.post(`/api/admin/cms/documents/${created.id}/publish`, { revisionId: saved.latest.id }).expect(200)).body;
    expect(live).toMatchObject({ hasDraft: false, live: { number: 2 }, firstPublishedAt: created.firstPublishedAt });
    expect((await publicArticles()).find((item) => item.slug === "revisions")!.title).toBe("Revisions, edited");
    // Only the newest version can be published.
    expect((await admin.post(`/api/admin/cms/documents/${created.id}/publish`, { revisionId: created.latest.id })).body.error.details).toEqual({
      reason: "not_latest",
    });
  });

  it("versions (OPS-28): list, view, restore as a new revision (published at once on request); old versions stay unchanged", async () => {
    const created = (await admin.post("/api/admin/cms/documents", article({ slug: "versions", title: "Versions", publish: true })).expect(201)).body;
    const second = (
      await admin
        .post(`/api/admin/cms/documents/${created.id}/revisions`, {
          ...article({ slug: "versions", title: "Versions two" }),
          publish: true,
          baseRevisionId: created.latest.id,
        })
        .expect(201)
    ).body;
    let versions = (await admin.get(`/api/admin/cms/documents/${created.id}/revisions`).expect(200)).body;
    expect(versions.map((version: { number: number; live: boolean; latest: boolean }) => [version.number, version.live, version.latest])).toEqual([
      [2, true, true],
      [1, false, false],
    ]);
    const first = (await admin.get(`/api/admin/cms/documents/${created.id}/revisions/${versions[1].id}`).expect(200)).body;
    expect(first).toMatchObject({ number: 1, title: "Versions", status: "published", content: article().content });

    const restored = (await admin.post(`/api/admin/cms/documents/${created.id}/revisions/${first.id}/restore`, { publish: true }).expect(200)).body;
    expect(restored).toMatchObject({ latest: { number: 3, title: "Versions", restoredFrom: 1, summary: "Restored version 1" }, live: { number: 3 } });
    expect((await publicArticles()).find((item) => item.slug === "versions")!.title).toBe("Versions");
    const [event] = await history(created.id);
    expect(event).toMatchObject({ action: "published" });
    expect((await history(created.id))[1]).toMatchObject({ action: "updated", meta: { revision: 3, restoredFrom: 1 } });
    versions = (await admin.get(`/api/admin/cms/documents/${created.id}/revisions`).expect(200)).body;
    expect(versions).toHaveLength(3);
    expect(second.latest.number).toBe(2);

    // The public history lists the published versions only, newest first.
    const publicVersions = (await anonymous().get("/api/cms/documentation/versions/versions").expect(200)).body.versions;
    expect(publicVersions.map((version: { number: number }) => version.number)).toEqual([3, 2, 1]);
    expect(JSON.stringify(publicVersions)).not.toMatch(/author|Owner/i);
  });

  it("a revision is never rewritten or removed (the database refuses it)", async () => {
    const created = (await admin.post("/api/admin/cms/documents", article({ slug: "immutable" })).expect(201)).body;
    await expect(t.db.update(cmsRevisions).set({ title: "Rewritten" }).where(eq(cmsRevisions.id, created.latest.id))).rejects.toThrow();
    await expect(t.db.delete(cmsRevisions).where(eq(cmsRevisions.id, created.latest.id))).rejects.toThrow();
    await expect(t.db.execute(sql`truncate cms_revisions cascade`)).rejects.toThrow();
    expect((await admin.get(`/api/admin/cms/documents/${created.id}`).expect(200)).body.latest.title).toBe("Version 0.1 scope");
  });

  it("sanitizes: links only to https, http, mailto or this site; markup stays text; control characters are dropped", async () => {
    const bad = (href: string) =>
      admin.post(
        "/api/admin/cms/documents",
        article({ slug: `bad-${Math.random().toString(36).slice(2, 8)}`, content: [{ kind: "paragraph", text: [{ kind: "link", value: "x", href }] }] }),
      );
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:x",
      "//evil.example",
      "/\\evil.example",
      "file:///etc/passwd",
      "https://exa mple.org",
    ])
      expect((await bad(href)).status, href).toBe(400);
    expect(
      (await admin.post("/api/admin/cms/documents", article({ slug: "unknown-block", content: [{ kind: "html", html: "<script>alert(1)</script>" }] }))).status,
    ).toBe(400);
    expect(
      (await admin.post("/api/admin/cms/documents", article({ slug: "extra-field", content: [{ kind: "paragraph", text: text("x"), onclick: "alert(1)" }] })))
        .status,
    ).toBe(400);

    const created = (
      await admin
        .post(
          "/api/admin/cms/documents",
          article({
            slug: "sanitized",
            publish: true,
            content: [
              { kind: "paragraph", text: [{ kind: "text", value: "<img src=x onerror=alert(1)>\u0000\u0007 done" }] },
              {
                kind: "paragraph",
                text: [
                  { kind: "link", value: "Mail", href: "mailto:donations@example.org" },
                  { kind: "link", value: "Doc", href: "/documentation/x" },
                  { kind: "link", value: "Site", href: "https://example.org/a?b=c#d" },
                ],
              },
            ],
          }),
        )
        .expect(201)
    ).body;
    const stored = (await publicArticles()).find((item) => item.slug === "sanitized")!;
    expect(stored.content[0]).toEqual({ kind: "paragraph", text: [{ kind: "text", value: "<img src=x onerror=alert(1)> done" }] });
    expect(created.latest.content[1].text.map((run: { href: string }) => run.href)).toEqual([
      "mailto:donations@example.org",
      "/documentation/x",
      "https://example.org/a?b=c#d",
    ]);
  });

  it("slugs are unique among the articles on the website or being edited; Home can't take a slug", async () => {
    await admin.post("/api/admin/cms/documents", article({ slug: "unique-slug" })).expect(201);
    const taken = await admin.post("/api/admin/cms/documents", article({ slug: "unique-slug" }));
    expect(taken.status).toBe(409);
    expect(taken.body.error.details).toEqual({ reason: "slug_taken" });
    expect((await admin.post("/api/admin/cms/documents", article({ slug: "Not A Slug" }))).status).toBe(400);
    expect(
      (await admin.post("/api/admin/cms/documents", article({ slug: "ten-tags", expertise: Array.from({ length: 11 }, (_, i) => `Tag ${i}`) }))).status,
    ).toBe(400);
  });

  it("a renamed article's old slug points to its new one (shared links keep working)", async () => {
    const created = (await admin.post("/api/admin/cms/documents", article({ slug: "old-name", title: "Renamed", publish: true })).expect(201)).body;
    await admin
      .post(`/api/admin/cms/documents/${created.id}/revisions`, {
        ...article({ slug: "new-name", title: "Renamed" }),
        publish: true,
        baseRevisionId: created.latest.id,
      })
      .expect(201);
    expect((await anonymous().get("/api/cms/documentation/old-name/current-slug").expect(200)).body).toEqual({ slug: "new-name" });
    await anonymous().get("/api/cms/documentation/new-name/current-slug").expect(404);
    await anonymous().get("/api/cms/documentation/never-existed/current-slug").expect(404);
  });

  it("unpublish and archive take a page off the website; restore brings it back; there is no delete", async () => {
    const created = (await admin.post("/api/admin/cms/documents", article({ slug: "offline", publish: true })).expect(201)).body;
    expect((await admin.post(`/api/admin/cms/documents/${created.id}/unpublish`).expect(200)).body.state).toBe("unpublished");
    expect((await publicArticles()).some((item) => item.slug === "offline")).toBe(false);
    expect(revalidate).toHaveBeenCalledWith(["documentation"]);
    await admin.post(`/api/admin/cms/documents/${created.id}/publish`, { revisionId: created.latest.id }).expect(200);
    expect((await admin.post(`/api/admin/cms/documents/${created.id}/archive`).expect(200)).body.state).toBe("archived");
    expect((await publicArticles()).some((item) => item.slug === "offline")).toBe(false);
    expect(
      (await admin.post(`/api/admin/cms/documents/${created.id}/revisions`, { ...article({ slug: "offline" }), baseRevisionId: created.latest.id })).body.error
        .details,
    ).toEqual({ reason: "archived" });
    expect((await admin.post(`/api/admin/cms/documents/${created.id}/restore`).expect(200)).body.state).toBe("published");
    expect((await publicArticles()).some((item) => item.slug === "offline")).toBe(true);
    expect((await admin.delete(`/api/admin/cms/documents/${created.id}`)).status).toBe(404);
    expect((await history(created.id)).map((item) => item.action)).toEqual(["restored", "archived", "published", "unpublished", "published", "created"]);
  });

  it("duplicate makes a draft copy with a free slug, linked in the history", async () => {
    const created = (await admin.post("/api/admin/cms/documents", article({ slug: "original", title: "Original" })).expect(201)).body;
    const copy = (await admin.post(`/api/admin/cms/documents/${created.id}/duplicate`).expect(201)).body;
    expect(copy).toMatchObject({ state: "draft", latest: { title: "Original (copy)", slug: "original-copy", number: 1 } });
    expect((await history(copy.id))[0]).toMatchObject({ action: "duplicated", meta: { duplicatedFrom: { id: created.id } } });
    expect((await admin.post(`/api/admin/cms/documents/${created.id}/duplicate`).expect(201)).body.latest.slug).toBe("original-copy-2");
  });

  it("Home: one document, saved and published from the editor; public only once published; revalidates Home", async () => {
    expect((await admin.get("/api/admin/cms/home").expect(200)).body).toEqual({ home: null });
    await anonymous().get("/api/cms/home").expect(404);
    const draft = (await admin.post("/api/admin/cms/home/revisions", { content: [heading("A global space.", 4)], baseRevisionId: null }).expect(201)).body;
    expect(draft).toMatchObject({ kind: "home", state: "draft", latest: { number: 1, title: "Home", slug: "home" } });
    await anonymous().get("/api/cms/home").expect(404);
    const published = (
      await admin
        .post("/api/admin/cms/home/revisions", {
          content: [heading("A global space.", 4), paragraph("Purpose.")],
          publish: true,
          baseRevisionId: draft.latest.id,
        })
        .expect(201)
    ).body;
    expect(published).toMatchObject({ state: "published", live: { number: 2 } });
    expect(revalidate).toHaveBeenCalledWith(["home"]);
    expect((await anonymous().get("/api/cms/home").expect(200)).body).toMatchObject({
      content: [heading("A global space.", 4), paragraph("Purpose.")],
      publishedAt: expect.any(String),
    });
    expect((await admin.post(`/api/admin/cms/documents/${draft.id}/archive`)).body.error.details).toEqual({ reason: "home" });
    expect((await admin.get("/api/admin/cms/documents").expect(200)).body.some((item: { id: string }) => item.id === draft.id)).toBe(false);
  });

  it("images: PNG/JPEG/WebP/GIF up to 5 MB from the bytes; private until a published page uses them; never SVG", async () => {
    const image = (await admin.upload("/api/admin/cms/images", "file", PNG, "../../diagram.png").expect(201)).body;
    expect(image).toMatchObject({ fileName: "diagram.png", contentType: "image/png", sizeBytes: PNG.length });
    expect((await admin.upload("/api/admin/cms/images", "file", PNG, "again.png").expect(201)).body.id).toBe(image.id);
    expect((await admin.upload("/api/admin/cms/images", "file", Buffer.from('<svg onload="alert(1)"/>'), "x.svg")).status).toBe(400);
    expect((await admin.upload("/api/admin/cms/images", "file", Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), "big.png")).status).toBe(413);
    await admin.get(`/api/admin/cms/images/${image.id}`).expect(200);
    await anonymous().get(`/api/cms/images/${image.id}`).expect(404);

    // An image id that was never uploaded can't be used.
    expect(
      (
        await admin.post(
          "/api/admin/cms/documents",
          article({ slug: "ghost-image", content: [{ kind: "image", imageId: "00000000-0000-4000-8000-000000000000", alt: "x" }] }),
        )
      ).status,
    ).toBe(400);

    const withImage = (
      await admin
        .post("/api/admin/cms/documents", article({ slug: "with-image", content: [{ kind: "image", imageId: image.id, alt: "A diagram" }] }))
        .expect(201)
    ).body;
    await anonymous().get(`/api/cms/images/${image.id}`).expect(404);
    await admin.post(`/api/admin/cms/documents/${withImage.id}/publish`, { revisionId: withImage.latest.id }).expect(200);
    const served = await anonymous().get(`/api/cms/images/${image.id}`).expect(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.headers["content-security-policy"]).toContain("sandbox");
    expect(served.headers["cache-control"]).toContain("immutable");
    expect((await readdir(storageDir, { recursive: true })).filter((name) => /[0-9a-f]{64}$/.test(name))).toHaveLength(1);
  });

  describe("permissions (cms.* keys)", () => {
    it("cms.read sees; cms.update saves drafts; cms.publish publishes; others are refused", async () => {
      const created = (await admin.post("/api/admin/cms/documents", article({ slug: "permissions" })).expect(201)).body;
      // A role that can edit but not publish: the future "submit, then Superadmins validate" step starts here.
      await t.db.insert(adminRoles).values({ key: "editor", label: "Editor", sortOrder: 99 }).onConflictDoNothing();
      await t.db
        .insert(adminRolePermissions)
        .values(["cms.read", "cms.update"].map((permissionKey) => ({ roleKey: "editor", permissionKey })))
        .onConflictDoNothing();
      const editor = await signedInAs(t, "editor");
      expect((await editor.get(`/api/admin/cms/documents/${created.id}`).expect(200)).body.permissions).toEqual({ edit: true, publish: false });
      const draft = await editor.post(`/api/admin/cms/documents/${created.id}/revisions`, {
        ...article({ slug: "permissions", title: "Edited by an editor" }),
        baseRevisionId: created.latest.id,
      });
      expect(draft.status).toBe(201);
      expect(draft.body.state).toBe("draft");
      expect(
        (
          await editor.post(`/api/admin/cms/documents/${created.id}/revisions`, {
            ...article({ slug: "permissions" }),
            publish: true,
            baseRevisionId: draft.body.latest.id,
          })
        ).status,
      ).toBe(403);
      expect((await editor.post(`/api/admin/cms/documents/${created.id}/publish`, { revisionId: draft.body.latest.id })).status).toBe(403);
      expect((await editor.post("/api/admin/cms/documents", article({ slug: "editor-new" }))).status).toBe(403);
      expect((await editor.upload("/api/admin/cms/images", "file", PNG, "a.png")).status).toBe(201);

      // Moderation reads Home and Documentation; it can't save.
      const moderator = await signedInAs(t, "moderation");
      await moderator.get("/api/admin/cms/documents").expect(200);
      expect(
        (
          await moderator.post(`/api/admin/cms/documents/${created.id}/revisions`, {
            ...article({ slug: "permissions" }),
            baseRevisionId: draft.body.latest.id,
          })
        ).status,
      ).toBe(403);
      expect((await moderator.upload("/api/admin/cms/images", "file", PNG, "a.png")).status).toBe(403);
      // Treasury has no cms permission at all.
      const treasury = await signedInAs(t, "treasury");
      expect((await treasury.get("/api/admin/cms/documents")).status).toBe(403);
      expect((await treasury.get(`/api/admin/history/cms_document/${created.id}`)).status).toBe(403);
      // Anonymous visitors: nothing under /api/admin.
      expect((await anonymous().get("/api/admin/cms/documents")).status).toBe(401);
      expect((await anonymous().post("/api/admin/cms/documents").set("origin", TEST_ORIGIN).send(article())).status).toBe(401);
    });

    it("archiving or restoring a published page needs cms.publish", async () => {
      const created = (await admin.post("/api/admin/cms/documents", article({ slug: "archive-rights", publish: true })).expect(201)).body;
      const editor = await signedInAs(t, "editor");
      expect((await editor.post(`/api/admin/cms/documents/${created.id}/archive`)).status).toBe(403);
      const draftOnly = (await admin.post("/api/admin/cms/documents", article({ slug: "archive-rights-draft" })).expect(201)).body;
      expect((await editor.post(`/api/admin/cms/documents/${draftOnly.id}/archive`).expect(200)).body.state).toBe("archived");
    });
  });
});
