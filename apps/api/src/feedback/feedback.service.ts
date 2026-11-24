import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor, AuditChange } from "../audit/audit.types.js";
import { submissionLabel } from "../audit/entity-labels.js";
import { diffRecord, type FieldSpec } from "../audit/record-fields.js";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ForbiddenError, NotFoundError, ServiceUnavailableError, ValidationFailedError } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import { countExistingExpertise } from "../expertise/expertise-refs.js";
import type { FeedbackListQuery, FeedbackOptionsDto, SubmissionDto, SubmitRequest, UpdateSubmissionRequest } from "./feedback.contracts.js";
import { FeedbackRepository, KIND_LABELS } from "./feedback.repository.js";
import { submissions, type SubmissionKind } from "./feedback.schema.js";
import { TurnstileService } from "./turnstile.service.js";

/** Public submissions have no account: their History events are the form's. */
const PUBLIC_FORM: AuditActor = { type: "automation", label: "Public form" };

/** The fields the History records on "Submit changes", in the record's order (Figma p9–p10). */
export const SUBMISSION_FIELDS: readonly FieldSpec<SubmissionDto>[] = [
  { field: "kind", label: "Type", kind: "select", get: (s) => ({ key: s.kind, label: KIND_LABELS[s.kind] }) },
  { field: "type", label: "Feedback or issue type", kind: "select", get: (s) => s.type },
  { field: "expertise", label: "Expertise", kind: "relation", ordered: true, get: (s) => s.expertise.map((item) => ({ id: item.id, label: item.name })) },
  { field: "status", label: "Status", kind: "select", get: (s) => s.status },
  { field: "significanceScore", label: "Significance score", kind: "number", get: (s) => s.significanceScore },
  { field: "decisionComment", label: "Decision comment", kind: "text", get: (s) => s.decisionComment },
];

/**
 * Feedbacks and issues (roadmap §2 item 1): the public composers' submissions, and their qualification by the
 * admins. Nothing is public (client, 2026-11-23). Every write is one transaction with its History event; nothing
 * is deleted (ADR 017): submissions are archived and restored.
 */
@Injectable()
export class FeedbackService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly repository: FeedbackRepository,
    private readonly audit: AuditService,
    private readonly turnstile: TurnstileService,
  ) {}

  /** What the composer needs before it sends: the bot check's site key (null: sending is unavailable). */
  publicConfig(): { siteKey: string | null } {
    return { siteKey: this.turnstile.siteKey() };
  }

  async submit(input: SubmitRequest): Promise<{ received: true }> {
    const { types } = await this.repository.options();
    const ofKind = new Set(types.filter((type) => type.kind === input.kind).map((type) => type.key));
    if (input.types.some((key) => !ofKind.has(key))) throw new ValidationFailedError([{ path: "types", message: "Choose types from the list." }]);

    const check = await this.turnstile.verify(input.token, input.kind);
    if (check === "unavailable") throw new ServiceUnavailableError("Sending isn't available right now. Please try again later.");
    if (check === "failed") throw new ForbiddenError("We couldn't confirm you're a person. Please try again.");

    const now = this.clock();
    await this.db.transaction(async (tx) => {
      const row = await this.repository.create(tx, {
        kind: input.kind,
        body: input.message,
        types: input.types,
        sourcePage: input.sourcePage,
        locale: input.locale,
        at: now,
      });
      await this.audit.record(tx, {
        entityType: "submission",
        entityId: row.id,
        action: "created",
        actor: PUBLIC_FORM,
        source: "system",
        meta: { label: submissionLabel({ submissionNumber: row.submissionNumber, kind: input.kind }) },
      });
    });
    return { received: true };
  }

  options(): Promise<FeedbackOptionsDto> {
    return this.repository.options();
  }

  list(query: FeedbackListQuery): Promise<Page<SubmissionDto>> {
    return this.repository.list(query);
  }

  async get(id: string): Promise<SubmissionDto> {
    const submission = await this.repository.find(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    return submission;
  }

  async update(id: string, input: UpdateSubmissionRequest, actor: AuditActor): Promise<SubmissionDto> {
    const before = await this.get(id);
    const { types, statuses } = await this.repository.options();
    const kind: SubmissionKind = input.kind ?? before.kind;
    // A new kind drops a type of the other kind, unless a type of the new kind comes with it.
    const typeKey = input.typeKey !== undefined ? input.typeKey : before.type && kind !== before.kind ? null : undefined;
    if (typeKey && !types.some((type) => type.key === typeKey && type.kind === kind)) {
      throw new ValidationFailedError([{ path: "typeKey", message: kind === "feedback" ? "Choose a feedback type." : "Choose an issue type." }]);
    }
    if (input.statusKey && !statuses.some((status) => status.key === input.statusKey)) {
      throw new ValidationFailedError([{ path: "statusKey", message: "Unknown status." }]);
    }
    if (input.expertiseIds?.length && (await countExistingExpertise(this.db, input.expertiseIds)) !== input.expertiseIds.length) {
      throw new ValidationFailedError([{ path: "expertiseIds", message: "Unknown expertise." }]);
    }

    return this.db.transaction(async (tx) => {
      const values: Partial<typeof submissions.$inferInsert> = {};
      if (input.kind !== undefined) values.kind = input.kind;
      if (typeKey !== undefined) values.typeKey = typeKey;
      if (input.statusKey !== undefined) values.statusKey = input.statusKey;
      if (input.significanceScore !== undefined) values.significanceScore = input.significanceScore;
      if (input.decisionComment !== undefined) values.decisionComment = input.decisionComment;
      if (Object.keys(values).length > 0) await tx.update(submissions).set(values).where(eq(submissions.id, id));
      if (input.expertiseIds !== undefined) await this.repository.setExpertise(tx, id, input.expertiseIds);
      const after = (await this.repository.find(id, tx))!;
      const changes = diffRecord(SUBMISSION_FIELDS, before, after);
      if (changes.length === 0) return after;
      // "Last edited at" moves only when something changed.
      const now = this.clock();
      await tx.update(submissions).set({ updatedAt: now }).where(eq(submissions.id, id));
      await this.record(tx, after, "updated", actor, changes);
      return { ...after, updatedAt: now.toISOString() };
    });
  }

  async setArchived(id: string, archived: boolean, actor: AuditActor): Promise<SubmissionDto> {
    const before = await this.get(id);
    if ((before.archivedAt !== null) === archived) return before;
    return this.db.transaction(async (tx) => {
      const now = this.clock();
      await tx
        .update(submissions)
        .set(
          archived
            ? { archivedAt: now, archivedById: actor.type === "admin" ? actor.id : null, updatedAt: now }
            : { archivedAt: null, archivedById: null, updatedAt: now },
        )
        .where(eq(submissions.id, id));
      const after = (await this.repository.find(id, tx))!;
      await this.record(tx, after, archived ? "archived" : "restored", actor);
      return after;
    });
  }

  private async record(tx: Executor, submission: SubmissionDto, action: "updated" | "archived" | "restored", actor: AuditActor, changes: AuditChange[] = []) {
    await this.audit.record(tx, {
      entityType: "submission",
      entityId: submission.id,
      action,
      actor,
      source: "admin",
      changes,
      meta: { label: submissionLabel({ submissionNumber: submission.number, kind: submission.kind }) },
    });
  }
}
