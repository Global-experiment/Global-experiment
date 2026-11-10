import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { actorFor, AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditChange } from "../audit/audit.types.js";
import { entryLabel, moneyLabel } from "../audit/entity-labels.js";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import { organizations } from "../organizations/organizations.schema.js";
import { people } from "../people/people.schema.js";
import { PUBLIC_CACHE_TAGS, RevalidationService } from "../revalidation/revalidation.service.js";
import { SettingsService } from "../settings/settings.service.js";
import {
  EXPENSE_FIELDS,
  type ReviewTreasuryEntryRequest,
  type TreasuryEntryDto,
  type TreasuryEntryRowDto,
  type TreasuryListQuery,
  type TreasuryOptionsDto,
  type UpdateTreasuryEntryRequest,
  type VocabularyEntry,
} from "./treasury-admin.contracts.js";
import { TreasuryAdminRepository } from "./treasury-admin.repository.js";
import { readPublicStripeModes } from "./treasury-ledger.repository.js";
import { TREASURY_CURRENCIES, treasuryEntries, treasuryEntryExpenseTypes } from "./treasury.schema.js";

const REVIEWED = new Set(["qualified", "not_required"]);
const CADENCE_LABEL: Record<string, string> = { one_off: "One-off", monthly: "Monthly", yearly: "Yearly" };

type Entry = typeof treasuryEntries.$inferSelect;
type Relation = { id: string; label: string };

/** 409 with a stable reason code (the page and tests read it). */
const refused = (reason: string, message: string) => new ConflictError(message, { reason });

/** Minor units as the History shows them ("−USD 1,200.50"; the page formats its own fields). */
const money = (minor: number | null, currency: string) => (minor === null ? null : moneyLabel(minor, currency));

/**
 * The admin Treasury (roadmap 1b): list, record, review and publication
 * actions. Data ownership (overview §2.1):
 *
 * - Expenses copied from Notion before the Treasury became in-app only
 *   (decision of 2026-10-23, no import or export) are ordinary entries
 *   now: reviewed, published and annotated here like any other.
 * - An expense's business fields — recipient, expense types, name, public
 *   description, date, amount, fee, cadence — are edited by the Rootadmin
 *   (treasury.manage; OPS-155, 2026-11-10).
 * - Native Stripe entries (donations, refunds, disputes): their amounts and
 *   dates come from Stripe and are read-only; the internal note and the
 *   publication can be changed.
 * - Publishing follows the rules and settings: never a test-mode entry; a
 *   reviewed entry needs a public description; an unqualified one only
 *   while `treasury.publish_unqualified` is on.
 *
 * Supporting documents left the platform (OPS-155, ADR 021): accountants keep
 * them outside it. The table stays for the one-time deletion and the History.
 */
@Injectable()
export class TreasuryAdminService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
    const [modes, publishUnqualified] = await Promise.all([
      readPublicStripeModes(this.config, this.settings),
      this.settings.get("treasury.publish_unqualified"),
    ]);
    return rows.map((row) => ({
      ...row,
      publicNow:
        row.publication === "published" && (row.source !== "stripe" || modes.includes(row.livemode)) && (publishUnqualified || REVIEWED.has(row.review.key)),
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
    const publishReason =
      entry.publicationStatus === "published"
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
    const unpublishReason = entry.publicationStatus !== "published" ? "Not published." : null;
    const reviewReason = entry.entryType !== "expense" ? "Donations, refunds and disputes need no review." : null;
    return {
      editInternalNote: true,
      editExpense: entry.entryType === "expense",
      publish: { allowed: publishReason === null, reason: publishReason },
      unpublish: { allowed: unpublishReason === null, reason: unpublishReason },
      review: { allowed: reviewReason === null, reason: reviewReason, options: reviewReason === null ? reviewStatuses : [] },
    };
  }

  async get(id: string): Promise<TreasuryEntryDto> {
    const [row, details] = await Promise.all([this.repository.row(id), this.repository.details(id)]);
    if (!row || !details) throw new NotFoundError("Treasury entry not found.");
    const { entry } = details;
    const [withPublic] = await this.withPublicNow([row]);
    return {
      ...withPublic!,
      externalTransactionId: entry.externalTransactionId,
      sourceAccountId: entry.sourceAccountId,
      reviewedAt: entry.reviewedAt?.toISOString() ?? null,
      publicDescription: entry.publicDescription,
      internalNote: entry.internalNote,
      importedAt: entry.importedAt?.toISOString() ?? null,
      adjusts: details.adjusts,
      adjustments: details.adjustments,
      permissions: await this.permissions(entry),
    };
  }

  /** One audit event for an entry, in the write's transaction (the entry's label as it is now). */
  private async recordEntry(tx: Executor, entry: Entry, admin: AdminPrincipal, action: "updated" | "archived" | "restored", changes: AuditChange[] = []) {
    if (action === "updated" && changes.length === 0) return;
    await this.audit.record(tx, {
      entityType: "treasury_entry",
      entityId: entry.id,
      action,
      actor: actorFor(admin),
      source: "admin",
      changes,
      meta: { label: entryLabel(entry) },
    });
  }

  async update(id: string, body: UpdateTreasuryEntryRequest, admin: AdminPrincipal | undefined): Promise<TreasuryEntryDto> {
    const editor = this.assertTreasuryAdmin(admin);
    // Field by field (overview §3.1): the internal note is treasury.update, the review status treasury.review,
    // an expense's business fields treasury.manage (the Rootadmin).
    if (body.internalNote !== undefined && !editor.permissions.has("treasury.update"))
      throw new ForbiddenError("Your role doesn't allow editing the internal note.");
    if (body.reviewStatus !== undefined && !editor.permissions.has("treasury.review")) throw new ForbiddenError("Your role doesn't allow reviewing expenses.");
    const expenseEdit = EXPENSE_FIELDS.some((field) => body[field] !== undefined);
    if (expenseEdit && !editor.permissions.has("treasury.manage")) throw new ForbiddenError("Only a Rootadmin can edit an expense's details.");
    const entry = await this.load(id);
    if (expenseEdit && entry.entryType !== "expense") throw refused("not_an_expense", "Only an expense's details can be edited.");

    const changes: AuditChange[] = [];
    const after = await this.expenseAfter(entry, body, changes);
    const review = await this.checkReview(entry, body.reviewStatus, after);
    if (body.internalNote !== undefined && (entry.internalNote ?? null) !== (body.internalNote ?? null)) {
      changes.push({ field: "internalNote", label: "Internal note", kind: "text", before: entry.internalNote, after: body.internalNote ?? null });
    }
    if (review && entry.reviewStatusKey !== body.reviewStatus) {
      changes.push({ field: "reviewStatus", label: "Review status", kind: "select", before: review.before, after: review.after });
    }

    const now = this.clock();
    await this.db.transaction(async (tx) => {
      await tx
        .update(treasuryEntries)
        .set({
          ...after.columns,
          ...(body.internalNote !== undefined ? { internalNote: body.internalNote } : {}),
          // Choosing a status (even the same one) counts as a review.
          ...(body.reviewStatus !== undefined ? { reviewStatusKey: body.reviewStatus, reviewedAt: now, reviewedByAdminId: editor.id } : {}),
          updatedAt: now,
        })
        .where(eq(treasuryEntries.id, id));
      if (after.expenseTypes) {
        await tx.delete(treasuryEntryExpenseTypes).where(eq(treasuryEntryExpenseTypes.entryId, id));
        if (after.expenseTypes.length > 0) await tx.insert(treasuryEntryExpenseTypes).values(after.expenseTypes.map((typeKey) => ({ entryId: id, typeKey })));
      }
      if (changes.length > 0) await this.recordEntry(tx, entry, editor, "updated", changes);
    });
    if (changes.length > 0 && entry.publicationStatus === "published") await this.revalidation.revalidate([PUBLIC_CACHE_TAGS.treasury]);
    return this.get(id);
  }

  /**
   * An expense's business fields after this save (OPS-155): the columns to write, the expense types (when they
   * change), and the History's before/after for each field that changes. Checks what the database would refuse,
   * so the admin gets a field message instead of a constraint error.
   */
  private async expenseAfter(entry: Entry, body: UpdateTreasuryEntryRequest, changes: AuditChange[]) {
    const columns: Partial<Entry> = {};
    const text = (field: "name" | "publicDescription", label: string) => {
      const value = body[field];
      if (value === undefined || (entry[field] ?? null) === (value ?? null)) return;
      columns[field] = value as never;
      changes.push({ field, label, kind: "text", before: entry[field], after: value ?? null });
    };

    if (body.recipient !== undefined) {
      const before = await this.recipientOf(entry.recipientPersonId, entry.recipientOrganizationId);
      const next = body.recipient;
      if ((before?.id ?? null) !== (next?.id ?? null)) {
        const found = next ? await this.recipientOf(next.kind === "person" ? next.id : null, next.kind === "organization" ? next.id : null) : null;
        if (next && !found) throw new ValidationFailedError([{ path: "recipient", message: "This recipient doesn't exist or is archived." }]);
        columns.recipientPersonId = next?.kind === "person" ? next.id : null;
        columns.recipientOrganizationId = next?.kind === "organization" ? next.id : null;
        changes.push({ field: "recipient", label: "Recipient", kind: "relation", before: before ? [before] : [], after: found ? [found] : [] });
      }
    }

    let expenseTypes: string[] | null = null;
    if (body.expenseTypes !== undefined) {
      const { expenseTypes: vocabulary } = await this.repository.vocabularies();
      const known = new Map(vocabulary.map((type) => [type.key, type.label]));
      const unknown = body.expenseTypes.find((key) => !known.has(key));
      if (unknown) throw new ValidationFailedError([{ path: "expenseTypes", message: "Unknown expense type." }]);
      const current = (await this.repository.row(entry.id))?.expenseTypes ?? [];
      const sameSet = current.length === body.expenseTypes.length && current.every((type) => body.expenseTypes!.includes(type.key));
      if (!sameSet) {
        expenseTypes = body.expenseTypes;
        const relation = (keys: string[]): Relation[] =>
          vocabulary.filter((type) => keys.includes(type.key)).map((type) => ({ id: type.key, label: type.label }));
        changes.push({
          field: "expenseTypes",
          label: "Expense types",
          kind: "relation",
          before: relation(current.map((type) => type.key)),
          after: relation(body.expenseTypes),
        });
      }
    }

    text("name", "Name");
    text("publicDescription", "Public description");
    if (body.occurredOn !== undefined && body.occurredOn !== entry.occurredOn) {
      // The day is what the admin chose; a time from an import no longer matches it.
      columns.occurredOn = body.occurredOn;
      columns.occurredAt = null;
      changes.push({ field: "occurredOn", label: "Date", kind: "date", before: entry.occurredOn, after: body.occurredOn });
    }
    const gross = body.grossAmount ?? entry.grossAmount;
    const fee = body.feeAmount === undefined ? entry.feeAmount : body.feeAmount;
    if (gross !== entry.grossAmount) {
      columns.grossAmount = gross;
      changes.push({
        field: "grossAmount",
        label: "Amount",
        kind: "text",
        before: money(entry.grossAmount, entry.currency),
        after: money(gross, entry.currency),
      });
    }
    if (fee !== entry.feeAmount) {
      columns.feeAmount = fee;
      changes.push({ field: "feeAmount", label: "Fee", kind: "text", before: money(entry.feeAmount, entry.currency), after: money(fee, entry.currency) });
    }
    // The net is never typed: amount − fee, or none without a fee (database rules).
    if (gross !== entry.grossAmount || fee !== entry.feeAmount) columns.netAmount = fee === null ? null : gross - fee;
    if (body.cadence !== undefined && body.cadence !== entry.cadence) {
      columns.cadence = body.cadence;
      const option = (key: string) => ({ key, label: CADENCE_LABEL[key] ?? key });
      changes.push({ field: "cadence", label: "Cadence", kind: "select", before: option(entry.cadence), after: option(body.cadence) });
    }

    return {
      columns,
      expenseTypes,
      hasRecipient: Boolean(
        (columns.recipientPersonId !== undefined ? columns.recipientPersonId : entry.recipientPersonId) ||
        (columns.recipientOrganizationId !== undefined ? columns.recipientOrganizationId : entry.recipientOrganizationId),
      ),
      publicDescription: (columns.publicDescription !== undefined ? columns.publicDescription : entry.publicDescription) ?? null,
    };
  }

  /** A live (not archived) person or organization, as a History relation. */
  private async recipientOf(personId: string | null, organizationId: string | null): Promise<Relation | null> {
    if (personId) {
      const [person] = await this.db
        .select({ id: people.id, label: people.name })
        .from(people)
        .where(and(eq(people.id, personId), isNull(people.archivedAt)));
      return person ?? null;
    }
    if (organizationId) {
      const [organization] = await this.db
        .select({ id: organizations.id, label: organizations.name })
        .from(organizations)
        .where(and(eq(organizations.id, organizationId), isNull(organizations.archivedAt)));
      return organization ?? null;
    }
    return null;
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

  async publish(id: string, publish: boolean, admin: AdminPrincipal | undefined): Promise<TreasuryEntryDto> {
    this.assertTreasuryAdmin(admin);
    const entry = await this.load(id);
    const { publish: canPublish, unpublish: canUnpublish } = await this.permissions(entry);
    const rule = publish ? canPublish : canUnpublish;
    if (!rule.allowed) throw refused(publish ? "cannot_publish" : "cannot_unpublish", rule.reason!);
    const now = this.clock();
    const editor = this.assertTreasuryAdmin(admin);
    const status = (key: string) => ({ key, label: key === "published" ? "Published" : "Unpublished" });
    await this.db.transaction(async (tx) => {
      await tx
        .update(treasuryEntries)
        .set(
          publish
            ? { publicationStatus: "published", publishedAt: now, updatedAt: now }
            : { publicationStatus: "unpublished", publishedAt: null, updatedAt: now },
        )
        .where(eq(treasuryEntries.id, id));
      await this.recordEntry(tx, entry, editor, "updated", [
        {
          field: "publication",
          label: "Publication",
          kind: "select",
          before: status(entry.publicationStatus),
          after: status(publish ? "published" : "unpublished"),
        },
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

  /**
   * The review rules (overview §2.1), on the entry as it will be after this save (a new recipient or public
   * description counts): refuses a state the entry can't take; returns the History's before/after when the
   * status is set.
   */
  private async checkReview(entry: Entry, reviewStatus: string | undefined, after: { hasRecipient: boolean; publicDescription: string | null }) {
    const status = reviewStatus ?? entry.reviewStatusKey;
    if (reviewStatus !== undefined) {
      const { review } = await this.permissions(entry);
      if (!review.allowed) throw refused("cannot_review", review.reason!);
      if (!review.options.some((option) => option.key === reviewStatus))
        throw new ValidationFailedError([{ path: "reviewStatus", message: "Unknown review status." }]);
    }
    if (entry.entryType === "expense" && REVIEWED.has(status) && !after.hasRecipient) {
      throw new ValidationFailedError([
        { path: reviewStatus !== undefined ? "reviewStatus" : "recipient", message: "Qualified and Not required need exactly one recipient." },
      ]);
    }
    const publishUnqualified = await this.settings.get("treasury.publish_unqualified");
    if (reviewStatus !== undefined && entry.publicationStatus === "published" && !REVIEWED.has(reviewStatus) && !publishUnqualified) {
      throw refused("cannot_review", "Unpublish it first: an unqualified entry can't stay public (treasury.publish_unqualified is off).");
    }
    if (entry.publicationStatus === "published" && REVIEWED.has(status) && !after.publicDescription?.trim()) {
      throw refused("cannot_review", "A published, reviewed entry needs a public description.");
    }
    if (reviewStatus === undefined) return null;
    const { reviewStatuses } = await this.repository.vocabularies();
    const label = (key: string): VocabularyEntry => ({ key, label: reviewStatuses.find((option) => option.key === key)?.label ?? key });
    return { before: entry.reviewStatusKey ? label(entry.reviewStatusKey) : null, after: label(reviewStatus) };
  }
}
