import { readFileSync } from "node:fs";
import { count, eq } from "drizzle-orm";
import { recordAuditEvent } from "../../audit/audit.service.js";
import { cmsDocuments, cmsRevisions } from "../../cms/cms.schema.js";
import { contentHash, documentLabel } from "../../cms/cms.service.js";
import { Content } from "../../cms/content.js";
import type { Database } from "../../common/database/database.module.js";

/**
 * Home and Documentation for tests and a contributor's machine (TEST AND
 * LOCAL ONLY — never production, where the real pages were imported from
 * Notion once, on 2026-11-05, and are edited in the admin). cms-content.json is a copy of the public pages' text as
 * published on 4 November 2026 (no personal data), so the website looks and
 * searches as it does live. Loaded only into empty tables.
 */
const LABEL = "Sample content";
/** The author and actor label production's imported pages carry. */
export const IMPORTED_LABEL = "Notion import";

interface FixtureArticle {
  title: string;
  slug: string;
  displayOrder: number;
  expertise: string[];
  publishedAt: string;
  editedAt: string;
  content: unknown;
}

/**
 * `as: "imported"` writes the pages exactly as production's one-time Notion
 * import did on 2026-11-05 (version 1 by "Notion import", `source_ref`
 * `notion:…`, "imported" and "published" History events), so tests can
 * check the live data model without a copy of production.
 */
export async function loadCmsFixtures(db: Database, at = new Date(), options: { as?: "sample" | "imported" } = {}): Promise<number> {
  const imported = options.as === "imported";
  const label = imported ? IMPORTED_LABEL : LABEL;
  const [{ n }] = (await db.select({ n: count() }).from(cmsDocuments)) as [{ n: number }];
  if (n > 0) return 0;
  const fixture = JSON.parse(readFileSync(new URL("./cms-content.json", import.meta.url), "utf8")) as {
    home: { editedAt: string; content: unknown };
    articles: FixtureArticle[];
  };
  const pages = [
    {
      kind: "home" as const,
      title: "Home",
      slug: "home",
      displayOrder: 0,
      expertise: [],
      publishedAt: fixture.home.editedAt,
      editedAt: fixture.home.editedAt,
      content: fixture.home.content,
    },
    ...fixture.articles.map((article) => ({ kind: "article" as const, ...article })),
  ];
  await db.transaction(async (tx) => {
    for (const page of pages) {
      const content = Content.parse(page.content);
      const [document] = await tx
        .insert(cmsDocuments)
        .values({ kind: page.kind, displayOrder: page.displayOrder, sourceRef: imported ? `notion:fixture-${page.slug}` : null, createdAt: at, updatedAt: at })
        .returning();
      const [revision] = await tx
        .insert(cmsRevisions)
        .values({
          documentId: document!.id,
          number: 1,
          status: "published",
          title: page.title,
          slug: page.slug,
          expertise: page.expertise,
          content,
          summary: imported ? "Copied from Notion" : null,
          authorLabel: label,
          createdAt: new Date(page.editedAt),
          publishedAt: at,
          publishedByLabel: label,
          contentHash: contentHash({ ...page, content }),
        })
        .returning();
      await tx
        .update(cmsDocuments)
        .set({ latestRevisionId: revision!.id, publishedRevisionId: revision!.id, firstPublishedAt: new Date(page.publishedAt) })
        .where(eq(cmsDocuments.id, document!.id));
      const event = (action: "created" | "imported" | "published", meta: Record<string, unknown>) =>
        recordAuditEvent(
          tx,
          {
            entityType: "cms_document",
            entityId: document!.id,
            action,
            actor: { type: "automation", label },
            source: imported ? "import" : "system",
            meta: { label: documentLabel(document!, page.title), ...meta },
          },
          at,
        );
      if (imported) {
        await event("imported", { importSource: "Notion", revision: 1, editedInNotionAt: page.editedAt });
        await event("published", { revision: 1 });
      } else {
        await event("created", { revision: 1 });
      }
    }
  });
  return pages.length;
}
