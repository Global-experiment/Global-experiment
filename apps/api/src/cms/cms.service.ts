import { Inject, Injectable } from "@nestjs/common";
import { aliasedTable, and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { actorFor, AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor, AuditChange } from "../audit/audit.types.js";
import { adminUsers } from "../auth/auth.schema.js";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import { FILE_STORAGE, sha256Hex, type FileStorage } from "../files/file-storage.js";
import { PUBLIC_CACHE_TAGS, RevalidationService, type PublicCacheTag } from "../revalidation/revalidation.service.js";
import type {
  CmsImageDto,
  CreateDocumentRequest,
  DocumentDto,
  DocumentListItemDto,
  DocumentState,
  PublicArticleDto,
  PublicHomeDto,
  PublicVersionDto,
  RevisionDto,
  RevisionSummaryDto,
  SaveHomeRequest,
  SaveRevisionRequest,
} from "./cms.contracts.js";
import { CMS_IMAGE_MAX_BYTES, cmsDocuments, cmsImages, cmsRevisions, type CmsKind } from "./cms.schema.js";
import { diffContent, imageIds, type ContentBlock } from "./content.js";

type Document = typeof cmsDocuments.$inferSelect;
type Revision = typeof cmsRevisions.$inferSelect;

const refused = (reason: string, message: string) => new ConflictError(message, { reason });

/** Home's fixed title and slug (it has no fields of its own). */
const HOME = { title: "Home", slug: "home" } as const;

/** "DOC-3 · Version 0.1 scope", or "Home" — the label the history keeps. */
export const documentLabel = (document: Pick<Document, "kind" | "documentNumber">, title: string) =>
  document.kind === "home" ? "Home" : `DOC-${document.documentNumber} · ${title}`;

export const contentHash = (revision: { title: string; slug: string; expertise: string[]; content: ContentBlock[] }) =>
  sha256Hex(Buffer.from(JSON.stringify([revision.title, revision.slug, revision.expertise, revision.content])));

/** What the revision holds, as a save would write it. */
interface RevisionInput {
  title: string;
  slug: string;
  expertise: string[];
  content: ContentBlock[];
  summary: string | null;
  restoredFromId?: string | null;
}

/** An actor writing revisions: an admin, or the one-time import ("Notion import"). */
export type RevisionAuthor = { kind: "admin"; admin: AdminPrincipal } | { kind: "import"; label: string };

const authorActor = (author: RevisionAuthor): AuditActor => (author.kind === "admin" ? actorFor(author.admin) : { type: "automation", label: author.label });
const authorLabel = (author: RevisionAuthor) => (author.kind === "admin" ? actorFor(author.admin).label : author.label);
const authorId = (author: RevisionAuthor) => (author.kind === "admin" ? author.admin.id : null);

function sniffImage(bytes: Buffer): (typeof import("./cms.schema.js").CMS_IMAGE_TYPES)[number] | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

/**
 * The native Home and Documentation (ADR 020): documents, revisions,
 * publication, versions, images. Every write is one transaction with its
 * History event(s); every change visitors can see revalidates the public
 * pages. Rights follow the cms.* keys: cms.read to see, cms.create to make
 * a document, cms.update to save revisions, cms.publish to publish,
 * unpublish, and archive or restore a published page.
 */
@Injectable()
export class CmsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CmsService.name);
  }

  // ── Reading (admin) ──────────────────────────────────────────────────────

  async list(): Promise<DocumentListItemDto[]> {
    const rows = await this.db
      .select({ document: cmsDocuments, revision: cmsRevisions })
      .from(cmsDocuments)
      .innerJoin(cmsRevisions, eq(cmsRevisions.id, cmsDocuments.latestRevisionId))
      .where(eq(cmsDocuments.kind, "article"))
      .orderBy(asc(cmsDocuments.displayOrder), asc(cmsDocuments.documentNumber));
    const liveIds = rows.map((row) => row.document.publishedRevisionId).filter((id): id is string => id !== null);
    const live =
      liveIds.length === 0
        ? new Map<string, Date | null>()
        : new Map(
            (
              await this.db.select({ id: cmsRevisions.id, publishedAt: cmsRevisions.publishedAt }).from(cmsRevisions).where(inArray(cmsRevisions.id, liveIds))
            ).map((row) => [row.id, row.publishedAt]),
          );
    return rows.map(({ document, revision }) => ({
      id: document.id,
      number: document.documentNumber,
      title: revision.title,
      slug: revision.slug,
      state: stateOf(document),
      hasDraft: hasDraft(document),
      expertise: revision.expertise,
      displayOrder: document.displayOrder,
      firstPublishedAt: document.firstPublishedAt?.toISOString() ?? null,
      lastPublishedAt: (document.publishedRevisionId ? live.get(document.publishedRevisionId) : null)?.toISOString() ?? null,
      updatedAt: document.updatedAt.toISOString(),
      createdAt: document.createdAt.toISOString(),
      lastEditedBy: revision.authorLabel,
    }));
  }

  async get(id: string, viewer: AdminPrincipal): Promise<DocumentDto> {
    const document = await this.load(this.db, id);
    return this.toDto(document, viewer);
  }

  /** Home's record, or null before Home has any content. */
  async home(viewer: AdminPrincipal): Promise<DocumentDto | null> {
    const [document] = await this.db.select().from(cmsDocuments).where(eq(cmsDocuments.kind, "home"));
    return document ? this.toDto(document, viewer) : null;
  }

  async revisions(id: string): Promise<RevisionSummaryDto[]> {
    const document = await this.load(this.db, id);
    const rows = await this.db.select().from(cmsRevisions).where(eq(cmsRevisions.documentId, id)).orderBy(desc(cmsRevisions.number));
    const numbers = new Map(rows.map((row) => [row.id, row.number]));
    return rows.map((row) => {
      const full = toRevisionDto(row, numbers);
      return {
        id: full.id,
        number: full.number,
        status: full.status,
        title: full.title,
        summary: full.summary,
        author: full.author,
        createdAt: full.createdAt,
        publishedAt: full.publishedAt,
        publishedBy: full.publishedBy,
        restoredFrom: full.restoredFrom,
        live: row.id === document.publishedRevisionId && !document.archivedAt,
        latest: row.id === document.latestRevisionId,
      };
    });
  }

  async revision(id: string, revisionId: string): Promise<RevisionDto> {
    const [row] = await this.db
      .select()
      .from(cmsRevisions)
      .where(and(eq(cmsRevisions.id, revisionId), eq(cmsRevisions.documentId, id)));
    if (!row) throw new NotFoundError("Version not found.");
    const restored = row.restoredFromId ? await this.db.select().from(cmsRevisions).where(eq(cmsRevisions.id, row.restoredFromId)) : [];
    return toRevisionDto(row, new Map(restored.map((item) => [item.id, item.number])));
  }

  // ── Writing ──────────────────────────────────────────────────────────────

  async create(body: CreateDocumentRequest, admin: AdminPrincipal): Promise<DocumentDto> {
    this.assertCanPublish(admin, body.publish);
    const id = await this.db.transaction(async (tx) => {
      await this.checkArticle(tx, body.slug, null);
      await this.checkImages(tx, body.content);
      const document = await this.insertDocument(tx, "article", body.displayOrder, { kind: "admin", admin }, null);
      const revision = await this.insertRevision(tx, document, 1, { ...body, summary: body.summary }, { kind: "admin", admin });
      await this.record(tx, document, revision.title, actorFor(admin), "created", [], { revision: 1, ...(body.summary ? { summary: body.summary } : {}) });
      if (body.publish) await this.publishIn(tx, document, revision, { kind: "admin", admin });
      return document.id;
    });
    if (body.publish) await this.revalidate("article");
    return this.get(id, admin);
  }

  /** One "Submit changes": a new revision (a draft, or published at once with cms.publish). */
  async save(id: string, body: SaveRevisionRequest, admin: AdminPrincipal): Promise<DocumentDto> {
    this.assertCanPublish(admin, body.publish);
    const visible = await this.db.transaction(async (tx) => {
      const document = await this.load(tx, id, { lock: true });
      if (document.kind !== "article") throw new NotFoundError("Document not found.");
      if (document.archivedAt) throw refused("archived", "Restore this document before editing it.");
      await this.checkArticle(tx, body.slug, document.id);
      return this.saveIn(tx, document, body, { kind: "admin", admin }, { displayOrder: body.displayOrder });
    });
    if (visible) await this.revalidate("article");
    return this.get(id, admin);
  }

  async saveHome(body: SaveHomeRequest, admin: AdminPrincipal): Promise<DocumentDto> {
    this.assertCanPublish(admin, body.publish);
    const id = await this.db.transaction(async (tx) => {
      let [document] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.kind, "home")).for("update");
      if (!document) {
        if (body.baseRevisionId) throw refused("stale", "Home was changed since you opened it. Reload to see the current version.");
        await this.checkImages(tx, body.content);
        document = await this.insertDocument(tx, "home", 0, { kind: "admin", admin }, null);
        const revision = await this.insertRevision(
          tx,
          document,
          1,
          { ...HOME, expertise: [], content: body.content, summary: body.summary },
          { kind: "admin", admin },
        );
        await this.record(tx, document, HOME.title, actorFor(admin), "created", [], { revision: 1 });
        if (body.publish) await this.publishIn(tx, document, revision, { kind: "admin", admin });
        return { id: document.id, visible: body.publish };
      }
      const visible = await this.saveIn(tx, document, { ...HOME, expertise: [], ...body }, { kind: "admin", admin }, {});
      return { id: document.id, visible };
    });
    if (id.visible) await this.revalidate("home");
    return this.get(id.id, admin);
  }

  /** Publishes the newest revision (cms.publish). Publishing an older one is a restore. */
  async publish(id: string, revisionId: string, admin: AdminPrincipal): Promise<DocumentDto> {
    const kind = await this.db.transaction(async (tx) => {
      const document = await this.load(tx, id, { lock: true });
      if (document.archivedAt) throw refused("archived", "Restore this document before publishing it.");
      if (revisionId !== document.latestRevisionId)
        throw refused("not_latest", "Only the newest version can be published. Restore this version to publish it.");
      if (revisionId === document.publishedRevisionId) return null;
      const [revision] = await tx.select().from(cmsRevisions).where(eq(cmsRevisions.id, revisionId));
      if (document.kind === "article") await this.checkArticle(tx, revision!.slug, document.id);
      await this.publishIn(tx, document, revision!, { kind: "admin", admin });
      return document.kind as CmsKind;
    });
    if (kind) await this.revalidate(kind);
    return this.get(id, admin);
  }

  /** Takes the page off the website (cms.publish); its revisions stay, and publishing brings it back. */
  async unpublish(id: string, admin: AdminPrincipal): Promise<DocumentDto> {
    const kind = await this.db.transaction(async (tx) => {
      const document = await this.load(tx, id, { lock: true });
      if (!document.publishedRevisionId) return null;
      const [live] = await tx.select().from(cmsRevisions).where(eq(cmsRevisions.id, document.publishedRevisionId));
      const now = this.clock();
      await tx.update(cmsDocuments).set({ publishedRevisionId: null, unpublishedAt: now, updatedAt: now }).where(eq(cmsDocuments.id, id));
      await this.record(tx, document, live!.title, actorFor(admin), "unpublished", [statusChange("published", "unpublished")], { revision: live!.number });
      return document.kind as CmsKind;
    });
    if (kind) await this.revalidate(kind);
    return this.get(id, admin);
  }

  /** Archive-only (ADR 017): an archived document leaves the website and the list's default view, and is restored as it was. */
  async setArchived(id: string, archived: boolean, admin: AdminPrincipal): Promise<DocumentDto> {
    const changed = await this.db.transaction(async (tx) => {
      const document = await this.load(tx, id, { lock: true });
      if (document.kind === "home") throw refused("home", "Home can't be archived.");
      if ((document.archivedAt !== null) === archived) return false;
      // Archiving or restoring a published page changes the website: that's publishing.
      if (document.publishedRevisionId && !admin.permissions.has("cms.publish"))
        throw new ForbiddenError(`Your role can't ${archived ? "archive" : "restore"} a published document.`);
      if (!archived && document.publishedRevisionId) {
        const [live] = await tx.select().from(cmsRevisions).where(eq(cmsRevisions.id, document.publishedRevisionId));
        await this.checkArticle(tx, live!.slug, document.id);
      }
      const now = this.clock();
      await tx
        .update(cmsDocuments)
        .set({ archivedAt: archived ? now : null, updatedAt: now })
        .where(eq(cmsDocuments.id, id));
      const [latest] = await tx.select().from(cmsRevisions).where(eq(cmsRevisions.id, document.latestRevisionId!));
      await this.record(tx, document, latest!.title, actorFor(admin), archived ? "archived" : "restored");
      return document.publishedRevisionId !== null;
    });
    if (changed) await this.revalidate("article");
    return this.get(id, admin);
  }

  /** Restoring a version makes a new revision with its content (ADR 020); with `publish`, it goes live too. */
  async restoreRevision(id: string, revisionId: string, publish: boolean, admin: AdminPrincipal): Promise<DocumentDto> {
    this.assertCanPublish(admin, publish);
    const { visible, kind } = await this.db.transaction(async (tx) => {
      const document = await this.load(tx, id, { lock: true });
      if (document.archivedAt) throw refused("archived", "Restore this document before restoring a version.");
      const [source] = await tx
        .select()
        .from(cmsRevisions)
        .where(and(eq(cmsRevisions.id, revisionId), eq(cmsRevisions.documentId, id)));
      if (!source) throw new NotFoundError("Version not found.");
      if (document.kind === "article") await this.checkArticle(tx, source.slug, document.id);
      const changed = await this.saveIn(
        tx,
        document,
        {
          title: source.title,
          slug: source.slug,
          expertise: source.expertise,
          content: source.content,
          summary: `Restored version ${source.number}`,
          publish,
          baseRevisionId: document.latestRevisionId,
          restoredFromId: source.id,
        },
        { kind: "admin", admin },
        {},
        { restoredFrom: source.number },
      );
      return { visible: changed, kind: document.kind as CmsKind };
    });
    if (visible) await this.revalidate(kind);
    return this.get(id, admin);
  }

  /** Duplicate (p10): a new draft document with the newest revision's content, titled "… (copy)". */
  async duplicate(id: string, admin: AdminPrincipal): Promise<DocumentDto> {
    const newId = await this.db.transaction(async (tx) => {
      const source = await this.load(tx, id);
      if (source.kind !== "article") throw refused("home", "Home can't be duplicated.");
      const [latest] = await tx.select().from(cmsRevisions).where(eq(cmsRevisions.id, source.latestRevisionId!));
      const slug = await this.freeSlug(tx, `${latest!.slug}-copy`.slice(0, 100).replace(/-+$/, ""));
      const document = await this.insertDocument(tx, "article", source.displayOrder, { kind: "admin", admin }, null);
      const title = `${latest!.title} (copy)`.slice(0, 200);
      await this.insertRevision(
        tx,
        document,
        1,
        { title, slug, expertise: latest!.expertise, content: latest!.content, summary: null },
        { kind: "admin", admin },
      );
      await this.record(tx, document, title, actorFor(admin), "duplicated", [], {
        revision: 1,
        duplicatedFrom: { id: source.id, label: documentLabel(source, latest!.title) },
      });
      return document.id;
    });
    return this.get(newId, admin);
  }

  // ── Images ───────────────────────────────────────────────────────────────

  async uploadImage(file: { buffer: Buffer; size: number; originalname: string } | undefined, author: RevisionAuthor): Promise<CmsImageDto> {
    if (!file || file.size === 0) throw new ValidationFailedError([{ path: "file", message: "Choose an image." }]);
    if (file.size > CMS_IMAGE_MAX_BYTES) throw new ValidationFailedError([{ path: "file", message: "Images can be at most 5 MB." }]);
    // The real type, from the bytes; never SVG (it can carry script).
    const contentType = sniffImage(file.buffer);
    if (!contentType) throw new ValidationFailedError([{ path: "file", message: "Use a PNG, JPEG, WebP or GIF image." }]);
    const stored = await this.storage.put(file.buffer);
    const fileName =
      file.originalname
        .replace(/\\/g, "/")
        .split("/")
        .pop()!
        .replace(/[\u0000-\u001f\u007f"]/g, "")
        .trim()
        .slice(0, 255) || "image";
    await this.db
      .insert(cmsImages)
      .values({
        storageKey: stored.key,
        contentType,
        sizeBytes: file.size,
        sha256: stored.sha256,
        fileName,
        uploadedById: authorId(author),
        uploadedByLabel: authorLabel(author),
      })
      .onConflictDoNothing({ target: cmsImages.sha256 });
    const [row] = await this.db.select().from(cmsImages).where(eq(cmsImages.sha256, stored.sha256));
    return { id: row!.id, fileName: row!.fileName, contentType: row!.contentType, sizeBytes: row!.sizeBytes };
  }

  /** Any image, for the admins with cms.read (drafts included). */
  async adminImage(id: string): Promise<{ bytes: Buffer; contentType: string }> {
    const [row] = await this.db.select().from(cmsImages).where(eq(cmsImages.id, id));
    if (!row) throw new NotFoundError("Image not found.");
    return { bytes: await this.storage.get(row.storageKey), contentType: row.contentType };
  }

  /** An image visitors may see: one a published version of a page on the website uses. */
  async publicImage(id: string): Promise<{ bytes: Buffer; contentType: string }> {
    const [row] = await this.db.select().from(cmsImages).where(eq(cmsImages.id, id));
    if (!row) throw new NotFoundError("Image not found.");
    const [used] = await this.db
      .select({ id: cmsRevisions.id })
      .from(cmsRevisions)
      .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsRevisions.documentId))
      .where(
        and(
          eq(cmsRevisions.status, "published"),
          isNotNull(cmsDocuments.publishedRevisionId),
          isNull(cmsDocuments.archivedAt),
          sql`${cmsRevisions.content} @> ${JSON.stringify([{ kind: "image", imageId: id }])}::jsonb`,
        ),
      )
      .limit(1);
    if (!used) throw new NotFoundError("Image not found.");
    return { bytes: await this.storage.get(row.storageKey), contentType: row.contentType };
  }

  // ── Reading (public) ─────────────────────────────────────────────────────

  async publicHome(): Promise<PublicHomeDto | null> {
    const [row] = await this.db
      .select({ content: cmsRevisions.content, publishedAt: cmsRevisions.publishedAt })
      .from(cmsDocuments)
      .innerJoin(cmsRevisions, eq(cmsRevisions.id, cmsDocuments.publishedRevisionId))
      .where(and(eq(cmsDocuments.kind, "home"), isNull(cmsDocuments.archivedAt)));
    return row ? { content: row.content, publishedAt: row.publishedAt!.toISOString() } : null;
  }

  async publicArticles(): Promise<PublicArticleDto[]> {
    const rows = await this.db
      .select({ document: cmsDocuments, revision: cmsRevisions })
      .from(cmsDocuments)
      .innerJoin(cmsRevisions, eq(cmsRevisions.id, cmsDocuments.publishedRevisionId))
      .where(and(eq(cmsDocuments.kind, "article"), isNull(cmsDocuments.archivedAt)))
      .orderBy(asc(cmsDocuments.displayOrder), asc(cmsDocuments.documentNumber));
    return rows.map(({ document, revision }) => ({
      slug: revision.slug,
      title: revision.title,
      displayOrder: document.displayOrder,
      expertise: revision.expertise,
      publishedAt: (document.firstPublishedAt ?? revision.publishedAt!).toISOString(),
      // When the words shown were written (an imported page keeps its Notion edit date).
      updatedAt: revision.createdAt.toISOString(),
      content: revision.content,
    }));
  }

  /** Every version of an article that was published, newest first (the public "Document history"). */
  async publicVersions(slug: string): Promise<PublicVersionDto[] | null> {
    const document = await this.liveArticleBySlug(slug);
    if (!document) return null;
    const rows = await this.db
      .select()
      .from(cmsRevisions)
      .where(and(eq(cmsRevisions.documentId, document.id), eq(cmsRevisions.status, "published")))
      .orderBy(desc(cmsRevisions.number));
    return rows.map((row) => ({
      number: row.number,
      title: row.title,
      expertise: row.expertise,
      publishedAt: row.publishedAt!.toISOString(),
      content: row.content,
    }));
  }

  /** A slug an article on the website had before (shared links keep working): its current slug. */
  async currentSlug(oldSlug: string): Promise<string | null> {
    const live = aliasedTable(cmsRevisions, "live");
    const [row] = await this.db
      .select({ slug: live.slug })
      .from(cmsRevisions)
      .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsRevisions.documentId))
      .innerJoin(live, eq(live.id, cmsDocuments.publishedRevisionId))
      .where(and(eq(cmsDocuments.kind, "article"), isNull(cmsDocuments.archivedAt), eq(cmsRevisions.status, "published"), eq(cmsRevisions.slug, oldSlug)))
      .orderBy(desc(cmsRevisions.publishedAt))
      .limit(1);
    return row && row.slug !== oldSlug ? row.slug : null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async liveArticleBySlug(slug: string): Promise<Document | null> {
    const [row] = await this.db
      .select({ document: cmsDocuments })
      .from(cmsDocuments)
      .innerJoin(cmsRevisions, eq(cmsRevisions.id, cmsDocuments.publishedRevisionId))
      .where(and(eq(cmsDocuments.kind, "article"), isNull(cmsDocuments.archivedAt), eq(cmsRevisions.slug, slug)));
    return row?.document ?? null;
  }

  private assertCanPublish(admin: AdminPrincipal, publish: boolean) {
    if (publish && !admin.permissions.has("cms.publish")) throw new ForbiddenError("Your role can save drafts but not publish them.");
  }

  private async load(tx: Executor, id: string, { lock = false } = {}): Promise<Document> {
    const query = tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, id));
    const [document] = lock ? await query.for("update") : await query;
    if (!document) throw new NotFoundError("Document not found.");
    return document;
  }

  /** A slug no other article on the website, or being edited, uses. */
  private async checkArticle(tx: Executor, slug: string, exceptId: string | null): Promise<void> {
    const [taken] = await tx
      .select({ id: cmsDocuments.id })
      .from(cmsDocuments)
      .innerJoin(cmsRevisions, or(eq(cmsRevisions.id, cmsDocuments.latestRevisionId), eq(cmsRevisions.id, cmsDocuments.publishedRevisionId)))
      .where(
        and(
          eq(cmsDocuments.kind, "article"),
          isNull(cmsDocuments.archivedAt),
          eq(cmsRevisions.slug, slug),
          exceptId ? ne(cmsDocuments.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (taken) throw refused("slug_taken", "Another document already uses this slug.");
  }

  private async freeSlug(tx: Executor, base: string): Promise<string> {
    for (let n = 1; n < 100; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      try {
        await this.checkArticle(tx, slug, null);
        return slug;
      } catch {
        continue;
      }
    }
    throw refused("slug_taken", "Couldn't find a free slug for the copy.");
  }

  /** Every image a revision uses was uploaded here. */
  async checkImages(tx: Executor, content: ContentBlock[]): Promise<void> {
    const ids = imageIds(content);
    if (ids.length === 0) return;
    const rows = await tx.select({ id: cmsImages.id }).from(cmsImages).where(inArray(cmsImages.id, ids));
    if (rows.length !== ids.length) throw new ValidationFailedError([{ path: "content", message: "An image in this page wasn't uploaded. Add it again." }]);
  }

  async insertDocument(
    tx: Executor,
    kind: CmsKind,
    displayOrder: number,
    author: RevisionAuthor,
    sourceRef: string | null,
    at = this.clock(),
  ): Promise<Document> {
    const [document] = await tx
      .insert(cmsDocuments)
      .values({ kind, displayOrder, createdById: authorId(author), sourceRef, createdAt: at, updatedAt: at })
      .returning();
    return document!;
  }

  async insertRevision(tx: Executor, document: Document, number: number, input: RevisionInput, author: RevisionAuthor, at = this.clock()): Promise<Revision> {
    const [revision] = await tx
      .insert(cmsRevisions)
      .values({
        documentId: document.id,
        number,
        status: "draft",
        title: input.title,
        slug: input.slug,
        expertise: input.expertise,
        content: input.content,
        summary: input.summary,
        authorId: authorId(author),
        authorLabel: authorLabel(author),
        createdAt: at,
        restoredFromId: input.restoredFromId ?? null,
        contentHash: contentHash(input),
      })
      .returning();
    await tx.update(cmsDocuments).set({ latestRevisionId: revision!.id, updatedAt: at }).where(eq(cmsDocuments.id, document.id));
    document.latestRevisionId = revision!.id;
    return revision!;
  }

  /** Makes a revision the one visitors see, with its History event. */
  async publishIn(tx: Executor, document: Document, revision: Revision, author: RevisionAuthor, at = this.clock()): Promise<void> {
    const wasLive = document.publishedRevisionId !== null;
    await tx
      .update(cmsRevisions)
      .set({ status: "published", publishedAt: at, publishedById: authorId(author), publishedByLabel: authorLabel(author) })
      .where(eq(cmsRevisions.id, revision.id));
    await tx
      .update(cmsDocuments)
      .set({ publishedRevisionId: revision.id, firstPublishedAt: document.firstPublishedAt ?? at, unpublishedAt: null, updatedAt: at })
      .where(eq(cmsDocuments.id, document.id));
    document.publishedRevisionId = revision.id;
    document.firstPublishedAt ??= at;
    const from = wasLive ? "published" : document.unpublishedAt ? "unpublished" : "draft";
    document.unpublishedAt = null;
    await this.record(tx, document, revision.title, authorActor(author), "published", from === "published" ? [] : [statusChange(from, "published")], {
      revision: revision.number,
    });
  }

  /**
   * A save on an existing document: a new revision unless nothing changed,
   * then publication if asked. Returns whether the website changed.
   */
  private async saveIn(
    tx: Executor,
    document: Document,
    body: RevisionInput & { publish: boolean; baseRevisionId: string | null },
    author: RevisionAuthor,
    fields: { displayOrder?: number },
    meta: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (body.baseRevisionId !== document.latestRevisionId)
      throw refused("stale", "This page was changed by someone else since you opened it. Reload to see the current version.");
    await this.checkImages(tx, body.content);
    const [latest] = await tx.select().from(cmsRevisions).where(eq(cmsRevisions.id, document.latestRevisionId!));
    const now = this.clock();
    const changes: AuditChange[] = [];
    let visible = false;

    if (fields.displayOrder !== undefined && fields.displayOrder !== document.displayOrder) {
      changes.push({ field: "displayOrder", label: "Display order", kind: "number", before: document.displayOrder, after: fields.displayOrder });
      await tx.update(cmsDocuments).set({ displayOrder: fields.displayOrder, updatedAt: now }).where(eq(cmsDocuments.id, document.id));
      document.displayOrder = fields.displayOrder;
      visible ||= document.publishedRevisionId !== null && !document.archivedAt;
    }

    let current = latest!;
    if (contentHash(body) !== latest!.contentHash) {
      changes.push(...revisionChanges(latest!, body));
      current = await this.insertRevision(tx, document, latest!.number + 1, body, author, now);
    }
    if (changes.length > 0 || current !== latest)
      await this.record(tx, document, current.title, authorActor(author), "updated", changes, {
        revision: current.number,
        ...(current !== latest && body.summary ? { summary: body.summary } : {}),
        ...meta,
      });
    if (body.publish && current.id !== document.publishedRevisionId) {
      await this.publishIn(tx, document, current, author, now);
      visible = true;
    }
    return visible;
  }

  private async record(
    tx: Executor,
    document: Document,
    title: string,
    actor: AuditActor,
    action: "created" | "updated" | "published" | "unpublished" | "archived" | "restored" | "duplicated" | "imported",
    changes: AuditChange[] = [],
    meta: Record<string, unknown> = {},
  ) {
    await this.audit.record(tx, {
      entityType: "cms_document",
      entityId: document.id,
      action,
      actor,
      source: actor.type === "automation" ? "import" : "admin",
      changes,
      meta: { label: documentLabel(document, title), ...meta },
    });
  }

  private async toDto(document: Document, viewer: AdminPrincipal): Promise<DocumentDto> {
    const revisions = await this.db
      .select()
      .from(cmsRevisions)
      .where(inArray(cmsRevisions.id, [document.latestRevisionId!, ...(document.publishedRevisionId ? [document.publishedRevisionId] : [])]));
    const latest = revisions.find((row) => row.id === document.latestRevisionId)!;
    const live = revisions.find((row) => row.id === document.publishedRevisionId);
    const restored = latest.restoredFromId ? await this.db.select().from(cmsRevisions).where(eq(cmsRevisions.id, latest.restoredFromId)) : [];
    const [creator] = document.createdById
      ? await this.db
          .select({ name: sql<string>`coalesce(${adminUsers.displayName}, split_part(${adminUsers.email}, '@', 1))` })
          .from(adminUsers)
          .where(eq(adminUsers.id, document.createdById))
      : [];
    const [first] = await this.db
      .select({ authorLabel: cmsRevisions.authorLabel })
      .from(cmsRevisions)
      .where(and(eq(cmsRevisions.documentId, document.id), eq(cmsRevisions.number, 1)));
    return {
      id: document.id,
      number: document.documentNumber,
      kind: document.kind as CmsKind,
      displayOrder: document.displayOrder,
      state: stateOf(document),
      hasDraft: hasDraft(document),
      firstPublishedAt: document.firstPublishedAt?.toISOString() ?? null,
      unpublishedAt: document.unpublishedAt?.toISOString() ?? null,
      archivedAt: document.archivedAt?.toISOString() ?? null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      createdBy: creator?.name ?? first?.authorLabel ?? null,
      latest: toRevisionDto(latest, new Map(restored.map((row) => [row.id, row.number]))),
      live: live ? { id: live.id, number: live.number, publishedAt: live.publishedAt!.toISOString(), publishedBy: live.publishedByLabel } : null,
      permissions: { edit: viewer.permissions.has("cms.update"), publish: viewer.permissions.has("cms.publish") },
    };
  }

  private async revalidate(kind: CmsKind) {
    const tags: PublicCacheTag[] = [kind === "home" ? PUBLIC_CACHE_TAGS.home : PUBLIC_CACHE_TAGS.documentation];
    await this.revalidation.revalidate(tags);
  }
}

export function stateOf(document: Pick<Document, "archivedAt" | "publishedRevisionId" | "unpublishedAt">): DocumentState {
  if (document.archivedAt) return "archived";
  if (document.publishedRevisionId) return "published";
  return document.unpublishedAt ? "unpublished" : "draft";
}

const hasDraft = (document: Pick<Document, "latestRevisionId" | "publishedRevisionId">) =>
  document.publishedRevisionId !== null && document.latestRevisionId !== document.publishedRevisionId;

const STATUS_LABELS: Record<string, string> = { draft: "Draft", published: "Published", unpublished: "Unpublished" };
const statusChange = (from: string, to: string): AuditChange => ({
  field: "status",
  label: "Status",
  kind: "select",
  before: { key: from, label: STATUS_LABELS[from]! },
  after: { key: to, label: STATUS_LABELS[to]! },
});

/** The fields of a new revision that differ from the previous one (p10's history: Title, Slug, Expertise, Content). */
function revisionChanges(before: Revision, after: RevisionInput): AuditChange[] {
  const changes: AuditChange[] = [];
  if (before.title !== after.title) changes.push({ field: "title", label: "Title", kind: "text", before: before.title, after: after.title });
  if (before.slug !== after.slug) changes.push({ field: "slug", label: "Slug", kind: "text", before: before.slug, after: after.slug });
  const tags = (list: string[]) => list.map((tag) => ({ id: tag, label: tag }));
  if (JSON.stringify([...before.expertise].sort()) !== JSON.stringify([...after.expertise].sort()))
    changes.push({ field: "expertise", label: "Expertise", kind: "relation", before: tags(before.expertise), after: tags(after.expertise) });
  const { removed, added } = diffContent(before.content, after.content);
  if (removed.length > 0 || added.length > 0) changes.push({ field: "content", label: "Content", kind: "content", before: removed, after: added });
  return changes;
}

function toRevisionDto(row: Revision, numbers: Map<string, number>): RevisionDto {
  return {
    id: row.id,
    number: row.number,
    status: row.status as "draft" | "published",
    title: row.title,
    slug: row.slug,
    expertise: row.expertise,
    content: row.content,
    summary: row.summary,
    author: row.authorLabel,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedBy: row.publishedByLabel,
    restoredFrom: row.restoredFromId ? (numbers.get(row.restoredFromId) ?? null) : null,
  };
}
