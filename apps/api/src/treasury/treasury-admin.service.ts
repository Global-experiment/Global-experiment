import { basename } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ne, sql } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { actorFor, AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditChange } from "../audit/audit.types.js";
import { entryLabel } from "../audit/entity-labels.js";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import { FILE_STORAGE, sniffContentType, type FileStorage } from "../files/file-storage.js";
import { PUBLIC_CACHE_TAGS, RevalidationService } from "../revalidation/revalidation.service.js";
import { SettingsService } from "../settings/settings.service.js";
import type {
  ReviewTreasuryEntryRequest,
  TreasuryDocumentDto,
  TreasuryEntryDto,
  TreasuryEntryRowDto,
  TreasuryListQuery,
  TreasuryOptionsDto,
  UpdateTreasuryEntryRequest,
} from "./treasury-admin.contracts.js";
import { TreasuryAdminRepository } from "./treasury-admin.repository.js";
import { readPublicStripeModes } from "./treasury-ledger.repository.js";
import { DOCUMENT_MAX_BYTES, treasuryDocuments } from "./treasury-documents.schema.js";
import { TREASURY_CURRENCIES, treasuryEntries } from "./treasury.schema.js";

/** An upload as multer hands it over (memory storage). */
export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const REVIEWED = new Set(["qualified", "not_required"]);

type Entry = typeof treasuryEntries.$inferSelect;

/** 409 with a stable reason code (the page and tests read it). */
const refused = (reason: string, message: string) => new ConflictError(message, { reason });

/**
 * The admin Treasury (roadmap 1b): list, record, review and publication
 * actions, supporting documents. Data ownership (overview §2.1):
 *
 * - Notion-managed expenses: every synced field is read-only here (409
 *   `managed_in_notion`) — they're edited in Notion and re-imported. Only
 *   their supporting documents (native data) are managed here.
 * - Native Stripe entries (donations, refunds, disputes): their amounts and
 *   dates come from Stripe and are read-only; the internal note and the
 *   publication can be changed.
 * - Publishing follows the rules and settings: never a test-mode entry; a
 *   reviewed entry needs a public description; an unqualified one only
 *   while `treasury.publish_unqualified` is on.
 *
 * Only the owner role manages the Treasury in v0.1 (Q8: more roles later,
 * `treasury.*` permissions).
 */
@Injectable()
export class TreasuryAdminService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly repository: TreasuryAdminRepository,
    private readonly settings: SettingsService,
    private readonly revalidation: RevalidationService,
    private readonly logger: PinoLogger,
    private readonly audit: AuditService,
  ) {
    this.logger.setContext(TreasuryAdminService.name);
  }

  /** The route's permission (treasury.*) is checked by the permission guard; here only the session. */
  private assertTreasuryAdmin(admin: AdminPrincipal | undefined): AdminPrincipal {
    if (!admin) throw new ForbiddenError("Sign in to manage the Treasury.");
    return admin;
  }

  async options(): Promise<TreasuryOptionsDto> {
    const [vocabularies, values] = await Promise.all([
      this.repository.vocabularies(),
      this.settings.getMany(["treasury.publish_unqualified", "treasury.public_recipient_names", "treasury.wise_connected"]),
    ]);
    return {
      ...vocabularies,
      currencies: TREASURY_CURRENCIES,
      settings: {
        publishUnqualified: values["treasury.publish_unqualified"],
        publicRecipientNames: values["treasury.public_recipient_names"],
        wiseConnected: values["treasury.wise_connected"],
      },
    };
  }

  async list(query: TreasuryListQuery) {
    const page = await this.repository.list(query);
    return { ...page, items: await this.withPublicNow(page.items) };
  }

  /** Whether visitors see each entry now: the public Treasury's rule (TreasuryPublicRepository.visible). */
  private async withPublicNow<Row extends TreasuryEntryRowDto>(rows: Row[]): Promise<Row[]> {
    const [modes, publishUnqualified] = await Promise.all([readPublicStripeModes(this.config, this.settings), this.settings.get("treasury.publish_unqualified")]);
    return rows.map((row) => ({
      ...row,
      publicNow:
        row.publication === "published" &&
        (row.source !== "stripe" || modes.includes(row.livemode)) &&
        (publishUnqualified || REVIEWED.has(row.review.key)),
    }));
  }

  private async load(id: string): Promise<Entry> {
    const [entry] = await this.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, id));
    if (!entry) throw new NotFoundError("Treasury entry not found.");
    return entry;
  }

  /** What this entry allows: one rule set for the API and the page. */
  private async permissions(entry: Entry): Promise<TreasuryEntryDto["permissions"]> {
    const publishUnqualified = await this.settings.get("treasury.publish_unqualified");
    const { reviewStatuses } = await this.repository.vocabularies();
    const notion = entry.managedBy === "notion";
    const publishReason = notion
      ? "Managed in Notion: publish it there."
      : entry.publicationStatus === "published"
        ? "Already published."
        : entry.source === "stripe" && !(await readPublicStripeModes(this.config, this.settings)).includes(entry.livemode)
          ? entry.livemode
            ? "Live Stripe entries aren't public on this test server."
            : "Stripe test-mode entries are public in production only before go-live, while treasury.show_test_donations is on."
          : !REVIEWED.has(entry.reviewStatusKey) && !publishUnqualified
            ? "Only Qualified or Not required entries can be published (treasury.publish_unqualified is off)."
            : REVIEWED.has(entry.reviewStatusKey) && !entry.publicDescription?.trim()
              ? "A reviewed entry needs a public description before it's published."
              : null;
    const unpublishReason = notion ? "Managed in Notion: unpublish it there." : entry.publicationStatus !== "published" ? "Not published." : null;
    const reviewReason = notion
      ? "Managed in Notion: review it there."
      : entry.entryType !== "expense"
        ? "Donations, refunds and disputes need no review."
        : null;
    const hasRecipient = Boolean(entry.recipientPersonId || entry.recipientOrganizationId);
    return {
      editInternalNote: !notion,
      publish: { allowed: publishReason === null, reason: publishReason },
      unpublish: { allowed: unpublishReason === null, reason: unpublishReason },
      review: {
        allowed: reviewReason === null,
        reason: reviewReason,
        // Qualified / Not required need exactly one recipient (a database rule).
        options: reviewReason === null ? reviewStatuses.filter((status) => hasRecipient || !REVIEWED.has(status.key)) : [],
      },
      documents: true,
    };
  }

  async get(id: string): Promise<TreasuryEntryDto> {
    const [row, details] = await Promise.all([this.repository.row(id), this.repository.details(id)]);
    if (!row || !details) throw new NotFoundError("Treasury entry not found.");
    const { entry } = details;
    const [withPublic] = await this.withPublicNow([row]);
    return {
      ...withPublic!,
      notionPageId: entry.notionPageId,
      notionUrl: entry.notionPageId ? `https://www.notion.so/${entry.notionPageId.replace(/-/g, "")}` : null,
      externalTransactionId: entry.externalTransactionId,
      sourceAccountId: entry.sourceAccountId,
      reviewedAt: entry.reviewedAt?.toISOString() ?? null,
      publicDescription: entry.publicDescription,
      internalNote: entry.internalNote,
      importedAt: entry.importedAt?.toISOString() ?? null,
      adjusts: details.adjusts,
      adjustments: details.adjustments,
      documentsList: details.documents,
      permissions: await this.permissions(entry),
    };
  }

  /** One audit event for an entry, in the write's transaction (the entry's label as it is now). */
  private async recordEntry(tx: Executor, entry: Entry, admin: AdminPrincipal, action: "updated" | "archived" | "restored" | "deleted", changes: AuditChange[] = []) {
    if (action === "updated" && changes.length === 0) return;
    await this.audit.record(tx, { entityType: "treasury_entry", entityId: entry.id, action, actor: actorFor(admin), source: "admin", changes, meta: { label: entryLabel(entry) } });
  }

  async update(id: string, body: UpdateTreasuryEntryRequest, admin: AdminPrincipal | undefined): Promise<TreasuryEntryDto> {
    const editor = this.assertTreasuryAdmin(admin);
    // Field by field (overview §3.1): the internal note is treasury.update, the review status treasury.review.
    if (body.internalNote !== undefined && !editor.permissions.has("treasury.update")) throw new ForbiddenError("Your role doesn't allow editing the internal note.");
    if (body.reviewStatus !== undefined && !editor.permissions.has("treasury.review")) throw new ForbiddenError("Your role doesn't allow reviewing expenses.");
    const entry = await this.load(id);
    if (entry.managedBy === "notion") throw refused("managed_in_notion", "Managed in Notion: edit this entry there; the importer updates it here.");
    const review = body.reviewStatus === undefined ? null : await this.checkReview(entry, body.reviewStatus);
    const now = this.clock();
    const changes: AuditChange[] = [];
    if (body.internalNote !== undefined && (entry.internalNote ?? null) !== (body.internalNote ?? null)) {
      changes.push({ field: "internalNote", label: "Internal note", kind: "text", before: entry.internalNote, after: body.internalNote ?? null });
    }
    if (review && entry.reviewStatusKey !== body.reviewStatus) {
      changes.push({ field: "reviewStatus", label: "Review status", kind: "select", before: review.before, after: review.after });
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(treasuryEntries)
        .set({
          ...(body.internalNote !== undefined ? { internalNote: body.internalNote } : {}),
          // Choosing a status (even the same one) counts as a review.
          ...(body.reviewStatus !== undefined ? { reviewStatusKey: body.reviewStatus, reviewedAt: now, reviewedByAdminId: editor.id } : {}),
          updatedAt: now,
        })
        .where(eq(treasuryEntries.id, id));
      if (changes.length > 0) await this.recordEntry(tx, entry, editor, "updated", changes);
    });
    if (review && entry.publicationStatus === "published") await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
    return this.get(id);
  }

  /** Archive (decision 12): out of the default admin views and off the public pages; restorable. */
  async setArchived(id: string, archived: boolean, admin: AdminPrincipal | undefined): Promise<TreasuryEntryDto> {
    const editor = this.assertTreasuryAdmin(admin);
    const entry = await this.load(id);
    if ((entry.archivedAt !== null) === archived) return this.get(id);
    const now = this.clock();
    await this.db.transaction(async (tx) => {
      await tx
        .update(treasuryEntries)
        .set(archived ? { archivedAt: now, archivedById: editor.id, updatedAt: now } : { archivedAt: null, archivedById: null, updatedAt: now })
        .where(eq(treasuryEntries.id, id));
      await this.recordEntry(tx, entry, editor, archived ? "archived" : "restored");
    });
    if (entry.publicationStatus === "published") await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
    return this.get(id);
  }

  /**
   * Permanent delete (decision 12): owner only, the entry number typed
   * exactly, logged. Only manual entries: Stripe and Notion entries are the
   * ledger's and the importer's — archive them instead.
   */
  async delete(id: string, confirm: string, admin: AdminPrincipal | undefined): Promise<void> {
    const editor = this.assertTreasuryAdmin(admin);
    const entry = await this.load(id);
    if (entry.source !== "manual" || entry.managedBy === "notion") throw refused("cannot_delete", "Only manual entries can be deleted; archive Stripe and Notion entries instead.");
    if (confirm.trim() !== `EXP-${entry.entryNumber}`) throw new ValidationFailedError([{ path: "confirm", message: `Type EXP-${entry.entryNumber} to confirm.` }]);
    await this.db.transaction(async (tx) => {
      await this.recordEntry(tx, entry, editor, "deleted");
      await tx.delete(treasuryDocuments).where(eq(treasuryDocuments.entryId, id));
      await tx.delete(treasuryEntries).where(eq(treasuryEntries.id, id));
    });
    if (entry.publicationStatus === "published") await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
  }

  async publish(id: string, publish: boolean, admin: AdminPrincipal | undefined): Promise<TreasuryEntryDto> {
    this.assertTreasuryAdmin(admin);
    const entry = await this.load(id);
    const { publish: canPublish, unpublish: canUnpublish } = await this.permissions(entry);
    const rule = publish ? canPublish : canUnpublish;
    if (!rule.allowed) throw refused(entry.managedBy === "notion" ? "managed_in_notion" : publish ? "cannot_publish" : "cannot_unpublish", rule.reason!);
    const now = this.clock();
    const editor = this.assertTreasuryAdmin(admin);
    const status = (key: string) => ({ key, label: key === "published" ? "Published" : "Unpublished" });
    await this.db.transaction(async (tx) => {
      await tx
        .update(treasuryEntries)
        .set(publish ? { publicationStatus: "published", publishedAt: now, updatedAt: now } : { publicationStatus: "unpublished", publishedAt: null, updatedAt: now })
        .where(eq(treasuryEntries.id, id));
      await this.recordEntry(tx, entry, editor, "updated", [
        { field: "publication", label: "Publication", kind: "select", before: status(entry.publicationStatus), after: status(publish ? "published" : "unpublished") },
      ]);
    });
    this.logger.info({ entryId: id, action: publish ? "publish" : "unpublish" }, "Treasury publication changed");
    await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
    return this.get(id);
  }

  /** The review on its own (kept for API clients); the record page sends it with "Submit changes" (update). */
  review(id: string, body: ReviewTreasuryEntryRequest, admin: AdminPrincipal | undefined): Promise<TreasuryEntryDto> {
    return this.update(id, { reviewStatus: body.reviewStatus }, admin);
  }

  /** The review rules (overview §2.1): refuses a status the entry can't take; returns the history's before/after. */
  private async checkReview(entry: Entry, reviewStatus: string) {
    const { review } = await this.permissions(entry);
    if (!review.allowed) throw refused(entry.managedBy === "notion" ? "managed_in_notion" : "cannot_review", review.reason!);
    if (!review.options.some((option) => option.key === reviewStatus)) {
      throw new ValidationFailedError([{ path: "reviewStatus", message: "Qualified and Not required need exactly one recipient." }]);
    }
    const publishUnqualified = await this.settings.get("treasury.publish_unqualified");
    if (entry.publicationStatus === "published" && !REVIEWED.has(reviewStatus) && !publishUnqualified) {
      throw refused("cannot_review", "Unpublish it first: an unqualified entry can't stay public (treasury.publish_unqualified is off).");
    }
    if (entry.publicationStatus === "published" && REVIEWED.has(reviewStatus) && !entry.publicDescription?.trim()) {
      throw refused("cannot_review", "A published, reviewed entry needs a public description.");
    }
    const { reviewStatuses } = await this.repository.vocabularies();
    const label = (key: string) => ({ key, label: reviewStatuses.find((status) => status.key === key)?.label ?? key });
    return { before: entry.reviewStatusKey ? label(entry.reviewStatusKey) : null, after: label(reviewStatus) };
  }

  // ---- Supporting documents (private: admins only, never public) ----

  documents(entryId: string, admin: AdminPrincipal | undefined): Promise<TreasuryDocumentDto[]> {
    this.assertTreasuryAdmin(admin);
    return this.repository.documents(entryId);
  }

  async upload(entryId: string, file: UploadedFile | undefined, admin: AdminPrincipal | undefined): Promise<TreasuryDocumentDto> {
    const uploader = this.assertTreasuryAdmin(admin);
    await this.load(entryId);
    if (!file || file.size === 0) throw new ValidationFailedError([{ path: "file", message: "Choose a file to upload." }]);
    if (file.size > DOCUMENT_MAX_BYTES) throw new ValidationFailedError([{ path: "file", message: "Files can be at most 20 MB." }]);
    // The real type, from the bytes: the name and the browser's Content-Type are never trusted.
    const contentType = sniffContentType(file.buffer);
    if (!contentType) throw new ValidationFailedError([{ path: "file", message: "Only PDF, PNG or JPEG files can be uploaded." }]);
    const fileName = cleanFileName(file.originalname, contentType);

    const stored = await this.storage.put(file.buffer);
    const entry = await this.load(entryId);
    try {
      const row = await this.db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(treasuryDocuments)
          .values({ entryId, fileName, contentType, sizeBytes: file.size, sha256: stored.sha256, storageKey: stored.key, uploadedByAdminId: uploader.id })
          .onConflictDoNothing({ target: [treasuryDocuments.entryId, treasuryDocuments.sha256] })
          .returning({ id: treasuryDocuments.id });
        if (!inserted) throw refused("duplicate_document", "This file is already attached to this entry.");
        await this.recordEntry(tx, entry, uploader, "updated", [{ field: "documents", label: "Documents", kind: "relation", before: [], after: [{ id: inserted.id, label: fileName }] }]);
        return inserted;
      });
      this.logger.info({ entryId, documentId: row.id, contentType, sizeBytes: file.size }, "Treasury document uploaded");
      return (await this.repository.documents(entryId)).find((document) => document.id === row.id)!;
    } catch (error) {
      await this.removeIfUnused(stored.key);
      throw error;
    }
  }

  async download(documentId: string, admin: AdminPrincipal | undefined): Promise<{ fileName: string; contentType: string; bytes: Buffer }> {
    this.assertTreasuryAdmin(admin);
    const [document] = await this.db.select().from(treasuryDocuments).where(eq(treasuryDocuments.id, documentId));
    if (!document) throw new NotFoundError("Document not found.");
    try {
      return { fileName: document.fileName, contentType: document.contentType, bytes: await this.storage.get(document.storageKey) };
    } catch {
      this.logger.error({ documentId }, "A Treasury document's file is missing from the storage");
      throw new NotFoundError("The document's file is missing from the storage.");
    }
  }

  async deleteDocument(documentId: string, admin: AdminPrincipal | undefined): Promise<void> {
    const editor = this.assertTreasuryAdmin(admin);
    const deleted = await this.db.transaction(async (tx) => {
      const [row] = await tx.delete(treasuryDocuments).where(eq(treasuryDocuments.id, documentId)).returning();
      if (!row) throw new NotFoundError("Document not found.");
      const [entry] = await tx.select().from(treasuryEntries).where(eq(treasuryEntries.id, row.entryId));
      if (entry) await this.recordEntry(tx, entry, editor, "updated", [{ field: "documents", label: "Documents", kind: "relation", before: [{ id: row.id, label: row.fileName }], after: [] }]);
      return row;
    });
    await this.removeIfUnused(deleted.storageKey);
    this.logger.info({ entryId: deleted.entryId, documentId }, "Treasury document deleted");
  }

  /** Content-addressed files are shared: delete the bytes only when no document uses them any more. */
  private async removeIfUnused(storageKey: string, exceptId?: string): Promise<void> {
    const [user] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(treasuryDocuments)
      .where(and(eq(treasuryDocuments.storageKey, storageKey), exceptId ? ne(treasuryDocuments.id, exceptId) : undefined));
    if ((user?.n ?? 0) === 0) await this.storage.delete(storageKey);
  }
}

const EXTENSION: Record<string, string> = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };

/** The uploaded name, made safe to show and to send back: no path, no control characters, ≤ 255, the right extension. */
export function cleanFileName(original: string, contentType: string): string {
  let name = basename(original.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  if (!name || name === "." || name === "..") name = "document";
  const extension = EXTENSION[contentType]!;
  if (!/\.(pdf|png|jpe?g)$/i.test(name)) name += extension;
  return name.length > 255 ? name.slice(0, 255 - extension.length) + extension : name;
}
