import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lte, not, notInArray, or, sql, type SQL } from "drizzle-orm";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { containsPattern, groupFilters, type Page } from "../common/listing/list-query.js";
import { adminUsers } from "../auth/auth.schema.js";
import { organizations } from "../organizations/organizations.schema.js";
import { people } from "../people/people.schema.js";
import type { TreasuryDocumentDto, TreasuryEntryRowDto, TreasuryListQuery, VocabularyEntry } from "./treasury-admin.contracts.js";
import { treasuryDocuments } from "./treasury-documents.schema.js";
import { treasuryEntries, treasuryEntryExpenseTypes, treasuryExpenseTypes, treasuryReviewStatuses } from "./treasury.schema.js";

type Filter = TreasuryListQuery["filters"][number];

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** Queries of the admin Treasury (list, record, vocabularies); rules live in TreasuryAdminService. */
@Injectable()
export class TreasuryAdminRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async vocabularies(): Promise<{ expenseTypes: VocabularyEntry[]; reviewStatuses: VocabularyEntry[] }> {
    const [expenseTypes, reviewStatuses] = await Promise.all([
      this.db.select({ key: treasuryExpenseTypes.key, label: treasuryExpenseTypes.label }).from(treasuryExpenseTypes).orderBy(asc(treasuryExpenseTypes.sortOrder)),
      this.db.select({ key: treasuryReviewStatuses.key, label: treasuryReviewStatuses.label }).from(treasuryReviewStatuses).orderBy(asc(treasuryReviewStatuses.sortOrder)),
    ]);
    return { expenseTypes, reviewStatuses };
  }

  private where(query: TreasuryListQuery): SQL | undefined {
    const conditions: SQL[] = [];
    // Archived entries are only in the "Archived" view (decision 12).
    const archived = query.filters.find((filter) => filter.field === "archived");
    conditions.push(archived?.value === true ? isNotNull(treasuryEntries.archivedAt) : isNull(treasuryEntries.archivedAt));
    const { anyOf, all } = groupFilters<Filter["field"]>(query.filters.filter((filter) => filter.field !== "archived"));
    const values = (field: Filter["field"]) => (anyOf.get(field) ?? []).map(String);
    const column = {
      type: treasuryEntries.entryType,
      currency: treasuryEntries.currency,
      review: treasuryEntries.reviewStatusKey,
      publication: treasuryEntries.publicationStatus,
      source: treasuryEntries.source,
    } as const;
    for (const field of ["type", "currency", "review", "publication", "source"] as const) {
      if (values(field).length > 0) conditions.push(inArray(column[field], values(field)));
    }
    if (values("mode").length > 0) {
      const modes = values("mode");
      if (!(modes.includes("live") && modes.includes("test"))) conditions.push(eq(treasuryEntries.livemode, modes.includes("live")));
    }
    const typeLink = (keys?: string[]) =>
      exists(
        this.db
          .select({ one: sql`1` })
          .from(treasuryEntryExpenseTypes)
          .where(and(eq(treasuryEntryExpenseTypes.entryId, treasuryEntries.id), keys ? inArray(treasuryEntryExpenseTypes.typeKey, keys) : undefined)),
      );
    if (values("expense_type").length > 0) conditions.push(typeLink(values("expense_type")));
    for (const value of values("occurred_from")) conditions.push(gte(treasuryEntries.occurredOn, value));
    for (const value of values("occurred_to")) conditions.push(lte(treasuryEntries.occurredOn, value));
    const documents = exists(this.db.select({ one: sql`1` }).from(treasuryDocuments).where(eq(treasuryDocuments.entryId, treasuryEntries.id)));

    for (const filter of all) {
      const empty = filter.operator === "is_empty";
      switch (filter.field) {
        case "type":
        case "currency":
        case "review":
        case "source":
          if (filter.operator === "is_not") conditions.push(notInArray(column[filter.field], [String(filter.value)]));
          break;
        case "expense_type":
          conditions.push(empty ? not(typeLink()) : typeLink());
          break;
        case "recipient": {
          const none = and(isNull(treasuryEntries.recipientPersonId), isNull(treasuryEntries.recipientOrganizationId))!;
          conditions.push(empty ? none : not(none));
          break;
        }
        case "documents":
          conditions.push(empty ? not(documents) : documents);
          break;
      }
    }

    if (query.search) {
      const pattern = containsPattern(query.search);
      const number = /^(exp-)?(\d{1,9})$/i.exec(query.search.trim());
      conditions.push(
        or(
          ilike(treasuryEntries.name, pattern),
          ilike(treasuryEntries.publicDescription, pattern),
          ilike(treasuryEntries.internalNote, pattern),
          ilike(treasuryEntries.externalTransactionId, pattern),
          // Recipient names, without joining (the count query shares this condition).
          sql`exists (select 1 from ${people} where ${people.id} = ${treasuryEntries.recipientPersonId} and ${people.name} ilike ${pattern})`,
          sql`exists (select 1 from ${organizations} where ${organizations.id} = ${treasuryEntries.recipientOrganizationId} and ${organizations.name} ilike ${pattern})`,
          ...(number ? [eq(treasuryEntries.entryNumber, Number(number[2]))] : []),
        )!,
      );
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private order(query: TreasuryListQuery): SQL[] {
    const columns = {
      number: [treasuryEntries.entryNumber],
      occurred: [treasuryEntries.occurredOn, treasuryEntries.occurredAt],
      amount: [treasuryEntries.grossAmount],
      created: [treasuryEntries.createdAt],
      updated: [treasuryEntries.updatedAt],
    } as const;
    const order: SQL[] = [];
    for (const sort of query.sort) {
      for (const column of columns[sort.field]) order.push(sort.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`);
    }
    order.push(desc(treasuryEntries.entryNumber));
    return order;
  }

  private rowSelect() {
    return {
      id: treasuryEntries.id,
      number: treasuryEntries.entryNumber,
      type: treasuryEntries.entryType,
      name: treasuryEntries.name,
      occurredOn: treasuryEntries.occurredOn,
      occurredAt: treasuryEntries.occurredAt,
      currency: treasuryEntries.currency,
      grossAmount: treasuryEntries.grossAmount,
      feeAmount: treasuryEntries.feeAmount,
      netAmount: treasuryEntries.netAmount,
      settlementCurrency: treasuryEntries.settlementCurrency,
      settlementGrossAmount: treasuryEntries.settlementGrossAmount,
      settlementFeeAmount: treasuryEntries.settlementFeeAmount,
      settlementNetAmount: treasuryEntries.settlementNetAmount,
      exchangeRate: treasuryEntries.exchangeRate,
      cadence: treasuryEntries.cadence,
      recipientPersonId: treasuryEntries.recipientPersonId,
      recipientPersonName: people.name,
      recipientOrganizationId: treasuryEntries.recipientOrganizationId,
      recipientOrganizationName: organizations.name,
      reviewKey: treasuryEntries.reviewStatusKey,
      reviewLabel: treasuryReviewStatuses.label,
      publication: treasuryEntries.publicationStatus,
      publishedAt: treasuryEntries.publishedAt,
      source: treasuryEntries.source,
      livemode: treasuryEntries.livemode,
      sample: treasuryEntries.sample,
      createdAt: treasuryEntries.createdAt,
      updatedAt: treasuryEntries.updatedAt,
      archivedAt: treasuryEntries.archivedAt,
      documents: sql<number>`(select count(*)::int from ${treasuryDocuments} where ${treasuryDocuments.entryId} = ${treasuryEntries.id})`,
    };
  }

  private async expenseTypesOf(ids: string[]): Promise<Map<string, VocabularyEntry[]>> {
    const byEntry = new Map<string, VocabularyEntry[]>();
    if (ids.length === 0) return byEntry;
    const links = await this.db
      .select({ entryId: treasuryEntryExpenseTypes.entryId, key: treasuryExpenseTypes.key, label: treasuryExpenseTypes.label })
      .from(treasuryEntryExpenseTypes)
      .innerJoin(treasuryExpenseTypes, eq(treasuryExpenseTypes.key, treasuryEntryExpenseTypes.typeKey))
      .where(inArray(treasuryEntryExpenseTypes.entryId, ids))
      .orderBy(asc(treasuryExpenseTypes.sortOrder));
    for (const link of links) byEntry.set(link.entryId, [...(byEntry.get(link.entryId) ?? []), { key: link.key, label: link.label }]);
    return byEntry;
  }

  private toRow(row: Awaited<ReturnType<TreasuryAdminRepository["listRows"]>>[number], types: Map<string, VocabularyEntry[]>): TreasuryEntryRowDto {
    return {
      id: row.id,
      number: row.number,
      type: row.type as TreasuryEntryRowDto["type"],
      name: row.name,
      occurredOn: row.occurredOn,
      occurredAt: iso(row.occurredAt),
      currency: row.currency,
      grossAmount: row.grossAmount,
      feeAmount: row.feeAmount,
      netAmount: row.netAmount,
      settlement: row.settlementCurrency
        ? {
            currency: row.settlementCurrency,
            grossAmount: row.settlementGrossAmount!,
            feeAmount: row.settlementFeeAmount!,
            netAmount: row.settlementNetAmount!,
            exchangeRate: row.exchangeRate!,
          }
        : null,
      cadence: row.cadence,
      recipient: row.recipientPersonId
        ? { kind: "person", id: row.recipientPersonId, name: row.recipientPersonName ?? "" }
        : row.recipientOrganizationId
          ? { kind: "organization", id: row.recipientOrganizationId, name: row.recipientOrganizationName ?? "" }
          : null,
      expenseTypes: types.get(row.id) ?? [],
      review: { key: row.reviewKey, label: row.reviewLabel },
      publication: row.publication as TreasuryEntryRowDto["publication"],
      publishedAt: iso(row.publishedAt),
      // Set by the service, which knows the settings (TreasuryAdminService.withPublicNow).
      publicNow: false,
      source: row.source as TreasuryEntryRowDto["source"],
      livemode: row.livemode,
      sample: row.sample,
      documents: row.documents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: iso(row.archivedAt),
    };
  }

  private listRows(where: SQL | undefined, order: SQL[], limit: number, offset: number) {
    return this.db
      .select(this.rowSelect())
      .from(treasuryEntries)
      .innerJoin(treasuryReviewStatuses, eq(treasuryReviewStatuses.key, treasuryEntries.reviewStatusKey))
      .leftJoin(people, eq(people.id, treasuryEntries.recipientPersonId))
      .leftJoin(organizations, eq(organizations.id, treasuryEntries.recipientOrganizationId))
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset(offset);
  }

  async list(query: TreasuryListQuery): Promise<Page<TreasuryEntryRowDto>> {
    const where = this.where(query);
    const [rows, [count]] = await Promise.all([
      this.listRows(where, this.order(query), query.pageSize, (query.page - 1) * query.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(treasuryEntries).where(where),
    ]);
    const types = await this.expenseTypesOf(rows.map((row) => row.id));
    return { items: rows.map((row) => this.toRow(row, types)), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }

  async row(id: string): Promise<TreasuryEntryRowDto | null> {
    const [row] = await this.listRows(eq(treasuryEntries.id, id), [], 1, 0);
    return row ? this.toRow(row, await this.expenseTypesOf([row.id])) : null;
  }

  async details(id: string) {
    const [entry] = await this.db.select().from(treasuryEntries).where(eq(treasuryEntries.id, id));
    if (!entry) return null;
    const [adjusts, adjustments, documents] = await Promise.all([
      entry.adjustsEntryId
        ? this.db.select({ id: treasuryEntries.id, number: treasuryEntries.entryNumber }).from(treasuryEntries).where(eq(treasuryEntries.id, entry.adjustsEntryId))
        : Promise.resolve([]),
      this.db
        .select({ id: treasuryEntries.id, number: treasuryEntries.entryNumber, type: treasuryEntries.entryType, grossAmount: treasuryEntries.grossAmount })
        .from(treasuryEntries)
        .where(eq(treasuryEntries.adjustsEntryId, id))
        .orderBy(asc(treasuryEntries.entryNumber)),
      this.documents(id),
    ]);
    return { entry, adjusts: adjusts[0] ?? null, adjustments, documents };
  }

  async documents(entryId: string): Promise<TreasuryDocumentDto[]> {
    const rows = await this.db
      .select({
        id: treasuryDocuments.id,
        fileName: treasuryDocuments.fileName,
        contentType: treasuryDocuments.contentType,
        sizeBytes: treasuryDocuments.sizeBytes,
        uploadedAt: treasuryDocuments.uploadedAt,
        uploadedBy: sql<string | null>`coalesce(${adminUsers.displayName}, ${adminUsers.email})`,
      })
      .from(treasuryDocuments)
      .leftJoin(adminUsers, eq(adminUsers.id, treasuryDocuments.uploadedByAdminId))
      .where(eq(treasuryDocuments.entryId, entryId))
      .orderBy(desc(treasuryDocuments.uploadedAt));
    return rows.map((row) => ({ ...row, uploadedAt: row.uploadedAt.toISOString() }));
  }
}
