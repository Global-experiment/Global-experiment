import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, exists, ilike, inArray, isNotNull, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import type { Page, Sort } from "../common/listing/list-query.js";
import { expertiseItems } from "../expertise/expertise.schema.js";
import type {
  FeedbackListQuery,
  FeedbackOptionsDto,
  FeedbackSortField,
  SubmissionDto,
  SubmissionExpertiseDto,
  SubmissionTypeEntry,
  VocabularyEntry,
} from "./feedback.contracts.js";
import { submissionExpertise, submissions, submissionStatuses, submissionTypeLinks, submissionTypes, type SubmissionKind } from "./feedback.schema.js";

export type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;
type Row = typeof submissions.$inferSelect;

const contains = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
const iso = (value: Date | null) => value?.toISOString() ?? null;

export const KIND_LABELS: Record<SubmissionKind, string> = { feedback: "Feedback", issue: "Issue" };

/** Submissions and their links (data-model §6). Reads and writes; the rules live in FeedbackService. */
@Injectable()
export class FeedbackRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async options(db: Executor = this.db): Promise<FeedbackOptionsDto> {
    const [types, statuses] = await Promise.all([
      db
        .select({ key: submissionTypes.key, kind: submissionTypes.kind, label: submissionTypes.label, description: submissionTypes.description })
        .from(submissionTypes)
        .orderBy(asc(submissionTypes.kind), asc(submissionTypes.sortOrder)),
      db.select({ key: submissionStatuses.key, label: submissionStatuses.label }).from(submissionStatuses).orderBy(asc(submissionStatuses.sortOrder)),
    ]);
    return {
      kinds: Object.entries(KIND_LABELS).map(([key, label]) => ({ key, label })),
      types: types as SubmissionTypeEntry[],
      statuses,
    };
  }

  /** A new submission and the visitor's picks (in the caller's transaction). */
  async create(
    tx: Executor,
    input: { kind: SubmissionKind; body: string; types: string[]; sourcePage: string | null; locale: string | null; at: Date },
  ): Promise<Row> {
    const [row] = await tx
      .insert(submissions)
      .values({
        kind: input.kind,
        submittedKind: input.kind,
        body: input.body,
        sourcePage: input.sourcePage,
        locale: input.locale,
        submittedAt: input.at,
        createdAt: input.at,
        updatedAt: input.at,
      })
      .returning();
    if (input.types.length > 0) {
      await tx.insert(submissionTypeLinks).values(input.types.map((typeKey) => ({ submissionId: row!.id, kind: input.kind, typeKey })));
    }
    return row!;
  }

  async row(id: string, db: Executor = this.db): Promise<Row | undefined> {
    const [row] = await db.select().from(submissions).where(eq(submissions.id, id));
    return row;
  }

  async find(id: string, db: Executor = this.db): Promise<SubmissionDto | undefined> {
    const row = await this.row(id, db);
    return row ? (await this.hydrate([row], db))[0] : undefined;
  }

  async list(query: FeedbackListQuery): Promise<Page<SubmissionDto>> {
    const where = this.where(query);
    const expression: Record<FeedbackSortField, SQL> = {
      submitted: sql`${submissions.submittedAt}`,
      significance: sql`${submissions.significanceScore}`,
    };
    const order = (query.sort as Sort<FeedbackSortField>[]).map(({ field, direction }) => sql`${expression[field]} ${sql.raw(direction)} nulls last`);
    const [rows, [count]] = await Promise.all([
      this.db
        .select()
        .from(submissions)
        .where(where)
        .orderBy(...order, sql`${submissions.submissionNumber} desc`)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(submissions)
        .where(where),
    ]);
    return { items: await this.hydrate(rows), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }

  private where(query: FeedbackListQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];
    const archived = query.filters.find((filter) => filter.field === "archived");
    conditions.push(archived?.value === true ? isNotNull(submissions.archivedAt) : isNull(submissions.archivedAt));
    const search = query.search?.trim();
    if (search) {
      const pattern = contains(search);
      conditions.push(
        or(
          ilike(submissions.body, pattern),
          ilike(submissions.translation, pattern),
          ilike(submissions.externalSubmissionId, pattern),
          sql`${submissions.submissionNumber}::text = ${search.replace(/^#/, "")}`,
        ),
      );
    }
    const column = { status: submissions.statusKey, type: submissions.typeKey } as const;
    for (const filter of query.filters) {
      const value = typeof filter.value === "string" ? filter.value : "";
      if (filter.field === "kind") conditions.push(eq(submissions.kind, value));
      else if (filter.field === "expertise") {
        conditions.push(
          exists(
            this.db
              .select({ one: sql`1` })
              .from(submissionExpertise)
              .where(and(eq(submissionExpertise.submissionId, submissions.id), eq(submissionExpertise.expertiseId, value))),
          ),
        );
      } else if (filter.field === "status" || filter.field === "type") {
        const target = column[filter.field];
        if (filter.operator === "is") conditions.push(eq(target, value));
        else if (filter.operator === "is_not") conditions.push(or(isNull(target), not(eq(target, value))));
        else if (filter.operator === "is_empty") conditions.push(isNull(target));
      }
    }
    return and(...conditions);
  }

  /** The labels and links of a page of rows: three queries per page, never one per row. */
  private async hydrate(rows: Row[], db: Executor = this.db): Promise<SubmissionDto[]> {
    const ids = rows.map((row) => row.id);
    const [options, picks, expertise] = await Promise.all([
      this.options(db),
      ids.length === 0
        ? []
        : db
            .select({ submissionId: submissionTypeLinks.submissionId, key: submissionTypes.key, label: submissionTypes.label })
            .from(submissionTypeLinks)
            .innerJoin(submissionTypes, eq(submissionTypes.key, submissionTypeLinks.typeKey))
            .where(inArray(submissionTypeLinks.submissionId, ids))
            .orderBy(asc(submissionTypes.sortOrder)),
      ids.length === 0
        ? []
        : db
            .select({ submissionId: submissionExpertise.submissionId, id: expertiseItems.id, name: expertiseItems.name })
            .from(submissionExpertise)
            .innerJoin(expertiseItems, eq(expertiseItems.id, submissionExpertise.expertiseId))
            .where(inArray(submissionExpertise.submissionId, ids))
            .orderBy(asc(submissionExpertise.position), asc(sql`lower(${expertiseItems.name})`)),
    ]);
    const group = <Item>(list: (Item & { submissionId: string })[]) => {
      const map = new Map<string, Item[]>();
      for (const { submissionId, ...item } of list) map.set(submissionId, [...(map.get(submissionId) ?? []), item as Item]);
      return map;
    };
    const picked = group<VocabularyEntry>(picks);
    const routed = group<SubmissionExpertiseDto>(expertise);
    const label = (list: VocabularyEntry[], key: string | null) => (key ? { key, label: list.find((item) => item.key === key)?.label ?? key } : null);
    return rows.map((row) => ({
      id: row.id,
      number: row.submissionNumber,
      kind: row.kind as SubmissionKind,
      submittedKind: row.submittedKind as SubmissionKind,
      body: row.body,
      pickedTypes: picked.get(row.id) ?? [],
      sourcePage: row.sourcePage,
      locale: row.locale,
      submittedAt: row.submittedAt.toISOString(),
      externalSubmissionId: row.externalSubmissionId,
      translation: row.translation,
      botScore: row.botScore,
      aiSignificanceScore: row.aiSignificanceScore,
      aiComment: row.aiComment,
      aiNote: row.aiNote,
      type: label(options.types, row.typeKey),
      status: label(options.statuses, row.statusKey),
      expertise: routed.get(row.id) ?? [],
      significanceScore: row.significanceScore,
      decisionComment: row.decisionComment,
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: iso(row.archivedAt),
    }));
  }

  async setExpertise(tx: Executor, id: string, expertiseIds: readonly string[]): Promise<void> {
    await tx.delete(submissionExpertise).where(eq(submissionExpertise.submissionId, id));
    if (expertiseIds.length > 0) {
      await tx.insert(submissionExpertise).values(expertiseIds.map((expertiseId, position) => ({ submissionId: id, expertiseId, position })));
    }
  }
}
