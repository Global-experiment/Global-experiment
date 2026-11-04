import { count, eq } from "drizzle-orm";
import { recordAuditEvent } from "../audit/audit.service.js";
import type { AuditActor } from "../audit/audit.types.js";
import type { Database } from "../common/database/database.module.js";
import type { FileStorage } from "../files/file-storage.js";
import { CMS_IMAGE_MAX_BYTES, cmsDocuments, cmsImages, cmsRevisions } from "./cms.schema.js";
import { contentHash, documentLabel } from "./cms.service.js";
import { Content, type ContentBlock, type RichText } from "./content.js";

/**
 * The one-time copy of Home and Documentation from Notion into the native
 * tables (Delivery 6; ADR 020). Read-only on Notion. Each page becomes a
 * document whose first revision is attributed to "Notion import", with the
 * same text, structure, tags, order and images — the same blocks the
 * website showed from Notion (headings, paragraphs, links; plus lists and
 * images, which the Notion pages could hold but the website skipped).
 *
 * Dry run by default (a report, nothing written). `apply` writes everything
 * in one transaction and refuses to run if any native page already exists.
 */

export const IMPORT_LABEL = "Notion import";
const IMPORT_ACTOR: AuditActor = { type: "automation", label: IMPORT_LABEL };

// ── What the import reads from Notion (shapes of the public API, 2025-09-03) ──

export interface NotionRichText {
  plain_text: string;
  href: string | null;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  /** The block's own payload, under its type ({ paragraph: { rich_text } }). */
  [type: string]: unknown;
  children?: NotionBlock[];
}

export interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, { type: string; [key: string]: unknown }>;
}

/** Read-only access to the two Notion sources. */
export interface NotionSource {
  homePage(): Promise<{ page: NotionPage; blocks: NotionBlock[] }>;
  documentationPages(): Promise<{ page: NotionPage; blocks: NotionBlock[] }[]>;
  /** An image's bytes (Notion's file URLs expire after an hour: called during the run). */
  download(url: string): Promise<Buffer>;
}

// ── Mapping ──

const SITE_HOSTS = new Set(["globalexperiment.org", "www.globalexperiment.org"]);
const DOCUMENTATION_PATH = /^\/documentation(\/[a-z0-9][a-z0-9-]*)?\/?$/;

/** As the website did (src/shared/content/internalLinks.ts): links to this site's documentation become site paths. */
export function normalizeLink(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if ((url.protocol === "https:" || url.protocol === "http:") && SITE_HOSTS.has(url.hostname.toLowerCase()) && DOCUMENTATION_PATH.test(url.pathname)) {
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
    return `${path}${url.search}${url.hash}`;
  }
  return href;
}

function richText(value: unknown): RichText {
  const runs = Array.isArray(value) ? (value as NotionRichText[]) : [];
  return runs.map((run) => (run.href ? { kind: "link", value: run.plain_text, href: normalizeLink(run.href) } : { kind: "text", value: run.plain_text }));
}

const payload = (block: NotionBlock) =>
  (block[block.type] ?? {}) as { rich_text?: unknown; caption?: unknown; type?: string; file?: { url: string }; external?: { url: string } };

/** An image to copy: where to download it, and its description (the Notion caption). */
export interface PendingImage {
  index: number;
  url: string;
  alt: string;
}

export interface MappedContent {
  blocks: (ContentBlock | { kind: "pending-image"; image: PendingImage })[];
  unsupported: Record<string, number>;
  /** List items nested under another item: kept, one level up. */
  flattened: number;
}

/**
 * Notion blocks → our blocks, in order. Consecutive list items become one
 * list; nested content follows its parent (as the website rendered it);
 * images wait for their download; any other type is counted and skipped —
 * exactly what the website did with it.
 */
export function mapNotionBlocks(input: NotionBlock[]): MappedContent {
  const out: MappedContent = { blocks: [], unsupported: {}, flattened: 0 };
  let images = 0;
  const walk = (blocks: NotionBlock[], nested: boolean) => {
    for (const block of blocks) {
      const data = payload(block);
      const heading = /^heading_([1-4])$/.exec(block.type);
      if (heading) out.blocks.push({ kind: "heading", level: Number(heading[1]) as 1 | 2 | 3 | 4, text: richText(data.rich_text) });
      else if (block.type === "paragraph") out.blocks.push({ kind: "paragraph", text: richText(data.rich_text) });
      else if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
        const ordered = block.type === "numbered_list_item";
        const last = out.blocks.at(-1);
        if (nested) out.flattened += 1;
        if (last?.kind === "list" && (last.ordered === ordered || nested)) last.items.push(richText(data.rich_text));
        else out.blocks.push({ kind: "list", ordered, items: [richText(data.rich_text)] });
      } else if (block.type === "image") {
        const url = data.type === "external" ? data.external?.url : data.file?.url;
        if (url)
          out.blocks.push({
            kind: "pending-image",
            image: {
              index: images++,
              url,
              alt: richText(data.caption)
                .map((run) => run.value)
                .join(""),
            },
          });
      } else out.unsupported[block.type] = (out.unsupported[block.type] ?? 0) + 1;
      if (block.children?.length) walk(block.children, block.type.endsWith("list_item"));
    }
  };
  walk(input, false);
  // Empty paragraphs are spacing in Notion; the website skipped them too.
  out.blocks = out.blocks.filter((block) => !(block.kind === "paragraph" && block.text.every((run) => run.value.trim() === "")));
  return out;
}

const text = (property: { type: string; [key: string]: unknown } | undefined) => {
  if (!property) return "";
  const runs = (property.type === "title" ? property.title : property.type === "rich_text" ? property.rich_text : []) as NotionRichText[];
  return runs
    .map((run) => run.plain_text)
    .join("")
    .trim();
};

export interface PlannedArticle {
  pageId: string;
  title: string;
  slug: string;
  displayOrder: number;
  expertise: string[];
  state: "published" | "draft" | "archived";
  publishedAt: string;
  lastEditedAt: string;
  content: MappedContent;
  problems: string[];
}

/** The same reading of the Documentation database's properties as the website (notionPropertyMapper.ts). */
export function planArticle(page: NotionPage, blocks: NotionBlock[]): PlannedArticle {
  const properties = page.properties;
  const problems: string[] = [];
  const title = text(properties["Name"]);
  const slug = text(properties["Slug"]);
  if (!title) problems.push("no title");
  if (!slug) problems.push("no slug");
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) problems.push(`slug "${slug}" isn't lowercase words joined by hyphens`);
  const order = properties["Display order"];
  const displayOrder = order?.type === "number" && typeof order.number === "number" && Number.isFinite(order.number) ? Math.round(order.number) : 100_000;
  const expertise =
    properties["Expertise"]?.type === "multi_select" ? (properties["Expertise"].multi_select as { name: string }[]).map((option) => option.name) : [];
  if (expertise.length > 10) problems.push(`${expertise.length} expertise tags (the limit is 10)`);
  const statusProperty = properties["Status"];
  const status =
    statusProperty?.type === "select"
      ? (statusProperty.select as { name: string } | null)?.name
      : statusProperty?.type === "status"
        ? (statusProperty.status as { name: string } | null)?.name
        : undefined;
  const archive = properties["Archive"];
  const archived =
    archive?.type === "relation"
      ? (archive.relation as unknown[]).length > 0
      : archive?.type === "checkbox"
        ? archive.checkbox === true
        : archive?.type === "select"
          ? archive.select !== null
          : false;
  const publishedProperty = properties["Published at"];
  const publishedAt = (publishedProperty?.type === "date" ? (publishedProperty.date as { start: string } | null)?.start : undefined) ?? page.created_time;
  return {
    pageId: page.id,
    title,
    slug,
    displayOrder,
    expertise,
    state: archived ? "archived" : status === "Published" ? "published" : "draft",
    publishedAt: new Date(publishedAt).toISOString(),
    lastEditedAt: new Date(page.last_edited_time).toISOString(),
    content: mapNotionBlocks(blocks),
    problems,
  };
}

export interface ImportPlan {
  home: { pageId: string; lastEditedAt: string; content: MappedContent; tagline: string | null; sections: number } | null;
  articles: PlannedArticle[];
  /** Native pages already in the database: the import refuses to run. */
  existing: number;
  problems: string[];
}

export async function planImport(db: Database, source: NotionSource): Promise<ImportPlan> {
  const [{ n }] = (await db.select({ n: count() }).from(cmsDocuments)) as [{ n: number }];
  const home = await source.homePage();
  const homeContent = mapNotionBlocks(home.blocks);
  const headingsOrText = homeContent.blocks.filter((block): block is ContentBlock => block.kind !== "pending-image");
  const tagline = headingsOrText.find((block) => (block.kind === "heading" && block.level === 4) || block.kind === "paragraph");
  const articles = (await source.documentationPages()).map(({ page, blocks }) => planArticle(page, blocks));
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const article of articles) {
    if (article.state === "archived" || !article.slug) continue;
    if (seen.has(article.slug)) problems.push(`"${article.title}" and "${seen.get(article.slug)}" share the slug "${article.slug}"`);
    seen.set(article.slug, article.title);
  }
  for (const article of articles) for (const problem of article.problems) problems.push(`"${article.title || article.pageId}": ${problem}`);
  if (!tagline) problems.push("Home has no tagline (a heading 4 or a paragraph first)");
  if (n > 0) problems.push(`${n} native page(s) already exist: the import runs once, on empty tables`);
  return {
    home: {
      pageId: home.page.id,
      lastEditedAt: new Date(home.page.last_edited_time).toISOString(),
      content: homeContent,
      tagline: tagline && tagline.kind !== "list" && tagline.kind !== "image" ? tagline.text.map((run) => run.value).join("") : null,
      sections: headingsOrText.filter((block) => block.kind === "heading" && block.level !== 4).length,
    },
    articles,
    existing: n,
    problems,
  };
}

const countImages = (content: MappedContent) => content.blocks.filter((block) => block.kind === "pending-image").length;
const countBlocks = (content: MappedContent) => content.blocks.length;
const unsupportedText = (content: MappedContent) =>
  Object.entries(content.unsupported)
    .map(([type, n]) => `${type} ×${n}`)
    .join(", ");

/** The dry-run report: what would be created, per page, and anything that stops the import. No content beyond titles. */
export function formatPlan(plan: ImportPlan, heading: string): string {
  const lines = [heading, ""];
  if (plan.home) {
    const c = plan.home.content;
    lines.push(
      "Home",
      `  ${countBlocks(c)} blocks (${plan.home.sections} section headings), ${countImages(c)} image(s)${unsupportedText(c) ? `; skipped as on the website: ${unsupportedText(c)}` : ""}`,
      `  tagline: ${plan.home.tagline ? `"${plan.home.tagline}"` : "none"}`,
      `  last edited in Notion ${plan.home.lastEditedAt}`,
      "",
    );
  }
  const states = { published: 0, draft: 0, archived: 0 };
  for (const article of plan.articles) states[article.state] += 1;
  lines.push(
    `Documentation — ${plan.articles.length} page(s) in Notion: ${states.published} published, ${states.draft} not published (imported as drafts), ${states.archived} archived (imported archived)`,
  );
  const sorted = [...plan.articles].sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title));
  for (const article of sorted) {
    const c = article.content;
    lines.push(
      `  ${String(article.displayOrder === 100_000 ? "–" : article.displayOrder).padStart(3)}  ${article.state.padEnd(9)} ${article.slug || "(no slug)"} — "${article.title || "(no title)"}"`,
      `       ${countBlocks(c)} blocks, ${countImages(c)} image(s), ${article.expertise.length} tag(s)${article.expertise.length ? ` (${article.expertise.join(", ")})` : ""}; published ${article.publishedAt.slice(0, 10)}, last edited ${article.lastEditedAt.slice(0, 10)}${unsupportedText(c) ? `; skipped as on the website: ${unsupportedText(c)}` : ""}${c.flattened ? `; ${c.flattened} nested list item(s) kept one level up` : ""}`,
    );
  }
  const images = (plan.home ? countImages(plan.home.content) : 0) + plan.articles.reduce((sum, article) => sum + countImages(article.content), 0);
  lines.push(
    "",
    `Would create: ${(plan.home ? 1 : 0) + plan.articles.length} document(s), one revision each, attributed to "${IMPORT_LABEL}"; ${images} image(s) copied into the file storage.`,
  );
  lines.push(
    plan.problems.length
      ? `\nProblems — the import won't run until they are fixed:\n${plan.problems.map((problem) => `  - ${problem}`).join("\n")}`
      : "\nNo problems found.",
  );
  return lines.join("\n");
}

function sniff(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

interface ImportPage {
  kind: "home" | "article";
  ref: string;
  title: string;
  slug: string;
  expertise: string[];
  displayOrder: number;
  state: "published" | "draft" | "archived";
  publishedAt: string;
  editedAt: string;
  content: ContentBlock[];
}

export interface ImportResult {
  documents: number;
  images: number;
}

/**
 * Writes the plan: images first (to the storage, content-addressed), then
 * every document, its revision 1 ("Notion import") and its History events,
 * in one transaction. Published pages are published by the import.
 */
export async function applyImport(db: Database, storage: FileStorage, source: NotionSource, plan: ImportPlan, now = new Date()): Promise<ImportResult> {
  if (plan.problems.length > 0) throw new Error(`Refusing to import: ${plan.problems.join("; ")}`);

  let images = 0;
  const resolve = async (content: MappedContent, page: string): Promise<ContentBlock[]> => {
    const blocks: ContentBlock[] = [];
    for (const block of content.blocks) {
      if (block.kind !== "pending-image") {
        blocks.push(block);
        continue;
      }
      const bytes = await source.download(block.image.url);
      const type = sniff(bytes);
      if (!type || bytes.length > CMS_IMAGE_MAX_BYTES) throw new Error(`An image on "${page}" isn't a PNG, JPEG, WebP or GIF under 5 MB.`);
      const stored = await storage.put(bytes);
      await db
        .insert(cmsImages)
        .values({
          storageKey: stored.key,
          contentType: type,
          sizeBytes: bytes.length,
          sha256: stored.sha256,
          fileName: `${page} image ${block.image.index + 1}`.slice(0, 255),
          uploadedByLabel: IMPORT_LABEL,
        })
        .onConflictDoNothing({ target: cmsImages.sha256 });
      const [row] = await db.select({ id: cmsImages.id }).from(cmsImages).where(eq(cmsImages.sha256, stored.sha256));
      blocks.push({ kind: "image", imageId: row!.id, alt: block.image.alt });
      images += 1;
    }
    // The same checks as an admin's save.
    return Content.parse(blocks);
  };

  const pages: ImportPage[] = [];
  if (plan.home)
    pages.push({
      kind: "home",
      ref: `notion:${plan.home.pageId}`,
      title: "Home",
      slug: "home",
      expertise: [],
      displayOrder: 0,
      state: "published",
      publishedAt: now.toISOString(),
      editedAt: plan.home.lastEditedAt,
      content: await resolve(plan.home.content, "Home"),
    });
  for (const article of plan.articles)
    pages.push({
      kind: "article",
      ref: `notion:${article.pageId}`,
      title: article.title,
      slug: article.slug,
      expertise: article.expertise,
      displayOrder: article.displayOrder,
      state: article.state,
      publishedAt: article.publishedAt,
      editedAt: article.lastEditedAt,
      content: await resolve(article.content, article.title),
    });

  await db.transaction(async (tx) => {
    for (const page of pages) {
      const [document] = await tx
        .insert(cmsDocuments)
        .values({
          kind: page.kind,
          displayOrder: page.displayOrder,
          sourceRef: page.ref,
          createdAt: now,
          updatedAt: now,
          archivedAt: page.state === "archived" ? now : null,
        })
        .returning();
      // Only what the website showed goes live; drafts and archived pages are kept, not shown.
      const live = page.state === "published";
      // The revision is the content as last edited in Notion; it went live with the import.
      const [revision] = await tx
        .insert(cmsRevisions)
        .values({
          documentId: document!.id,
          number: 1,
          status: live ? "published" : "draft",
          title: page.title,
          slug: page.slug,
          expertise: page.expertise,
          content: page.content,
          summary: "Copied from Notion",
          authorLabel: IMPORT_LABEL,
          createdAt: new Date(page.editedAt),
          publishedAt: live ? now : null,
          publishedByLabel: live ? IMPORT_LABEL : null,
          contentHash: contentHash(page),
        })
        .returning();
      await tx
        .update(cmsDocuments)
        .set({ latestRevisionId: revision!.id, publishedRevisionId: live ? revision!.id : null, firstPublishedAt: live ? new Date(page.publishedAt) : null })
        .where(eq(cmsDocuments.id, document!.id));
      const label = documentLabel(document!, page.title);
      const event = (action: "imported" | "published" | "archived", meta: Record<string, unknown> = {}) =>
        recordAuditEvent(
          tx,
          { entityType: "cms_document", entityId: document!.id, action, actor: IMPORT_ACTOR, source: "import", meta: { label, ...meta } },
          now,
        );
      await event("imported", { importSource: "Notion", revision: 1, editedInNotionAt: page.editedAt });
      if (live) await event("published", { revision: 1 });
      if (page.state === "archived") await event("archived");
    }
  });
  return { documents: pages.length, images };
}
