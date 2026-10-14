import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { organizations } from "../organizations/organizations.schema.js";
import { people } from "../people/people.schema.js";
import { SettingsService } from "../settings/settings.service.js";
import type { PublicEntriesQuery, PublicTreasuryEntry, PublicTreasuryOverview } from "./treasury-public.contracts.js";
import { publicStripeLivemode, TreasuryLedgerRepository } from "./treasury-ledger.repository.js";
import {
  treasuryEntries,
  treasuryEntryExpenseTypes,
  treasuryExpenseTypes,
  treasuryPublicEntries,
  type TreasuryCurrency,
} from "./treasury.schema.js";

const REVIEWED = ["qualified", "not_required"];
/** Refunds and disputes adjust donations: the public "Donations" type covers them. */
const DONATION_TYPES = ["donation", "refund", "dispute"];

interface Visibility {
  publishUnqualified: boolean;
  publicRecipientNames: boolean;
}

/**
 * The public Treasury (roadmap 1b): only the `treasury_public_entries` view
 * (published entries, public columns), and on top of it:
 *
 * - Stripe entries of the public mode only (production: live only);
 * - while `treasury.publish_unqualified` is off, only Qualified / Not
 *   required entries — even one published while the setting was on;
 * - a recipient's name only while `treasury.public_recipient_names` is on.
 *
 * Amounts are per currency and never converted.
 */
@Injectable()
export class TreasuryPublicRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly ledger: TreasuryLedgerRepository,
  ) {}

  private async visibility(): Promise<Visibility> {
    const values = await this.settings.getMany(["treasury.publish_unqualified", "treasury.public_recipient_names"]);
    return { publishUnqualified: values["treasury.publish_unqualified"], publicRecipientNames: values["treasury.public_recipient_names"] };
  }

  /** The one rule for what the public sees (list, detail, totals). */
  private visible(visibility: Visibility): SQL {
    const view = treasuryPublicEntries;
    return and(
      or(ne(view.source, "stripe"), eq(view.livemode, publicStripeLivemode(this.config))),
      visibility.publishUnqualified ? undefined : inArray(view.reviewStatusKey, REVIEWED),
    )!;
  }

  private filters(query: PublicEntriesQuery): (SQL | undefined)[] {
    const view = treasuryPublicEntries;
    return [
      query.type ? inArray(view.entryType, query.type === "expense" ? ["expense"] : DONATION_TYPES) : undefined,
      query.currency.length > 0 ? inArray(view.currency, query.currency) : undefined,
      query.from ? gte(view.occurredOn, query.from) : undefined,
      query.to ? lte(view.occurredOn, query.to) : undefined,
      query.expenseType.length > 0
        ? sql`exists (select 1 from ${treasuryEntryExpenseTypes} where ${treasuryEntryExpenseTypes.entryId} = ${view.id} and ${inArray(treasuryEntryExpenseTypes.typeKey, query.expenseType)})`
        : undefined,
    ];
  }

  private order(sort: PublicEntriesQuery["sort"]): SQL[] {
    const view = treasuryPublicEntries;
    const when = sql`coalesce(${view.occurredAt}, ${view.occurredOn}::timestamptz)`;
    const amount = sql`abs(${view.grossAmount})`;
    switch (sort) {
      case "date_asc":
        return [asc(when), asc(view.entryNumber)];
      case "amount_desc":
        return [desc(amount), desc(when), desc(view.entryNumber)];
      case "amount_asc":
        return [asc(amount), desc(when), desc(view.entryNumber)];
      default:
        return [desc(when), desc(view.entryNumber)];
    }
  }

  private selectEntries(visibility: Visibility) {
    const view = treasuryPublicEntries;
    const adjusted = alias(treasuryPublicEntries, "adjusted");
    return this.db
      .select({
        id: view.id,
        number: view.entryNumber,
        type: view.entryType,
        currency: view.currency,
        amount: view.grossAmount,
        cadence: view.cadence,
        occurredOn: view.occurredOn,
        occurredAt: view.occurredAt,
        publishedAt: view.publishedAt,
        reviewStatusKey: view.reviewStatusKey,
        description: view.publicDescription,
        adjustsNumber: adjusted.entryNumber,
        // Names are read only while the setting allows them (else not even selected).
        personName: visibility.publicRecipientNames ? people.name : sql<null>`null`,
        organizationName: visibility.publicRecipientNames ? organizations.name : sql<null>`null`,
      })
      .from(view)
      .innerJoin(treasuryEntries, eq(treasuryEntries.id, view.id))
      .leftJoin(people, eq(people.id, treasuryEntries.recipientPersonId))
      .leftJoin(organizations, eq(organizations.id, treasuryEntries.recipientOrganizationId))
      .leftJoin(adjusted, eq(adjusted.id, view.adjustsEntryId));
  }

  private async withExpenseTypes(rows: Awaited<ReturnType<ReturnType<TreasuryPublicRepository["selectEntries"]>["execute"]>>): Promise<PublicTreasuryEntry[]> {
    const ids = rows.filter((row) => row.type === "expense").map((row) => row.id);
    const links =
      ids.length === 0
        ? []
        : await this.db
            .select({ entryId: treasuryEntryExpenseTypes.entryId, key: treasuryExpenseTypes.key, label: treasuryExpenseTypes.label })
            .from(treasuryEntryExpenseTypes)
            .innerJoin(treasuryExpenseTypes, eq(treasuryExpenseTypes.key, treasuryEntryExpenseTypes.typeKey))
            .where(inArray(treasuryEntryExpenseTypes.entryId, ids))
            .orderBy(asc(treasuryExpenseTypes.sortOrder));
    return rows.map((row) => ({
      number: row.number,
      type: row.type as PublicTreasuryEntry["type"],
      currency: row.currency,
      amount: Number(row.amount),
      cadence: row.cadence,
      occurredOn: row.occurredOn,
      occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : null,
      publishedAt: new Date(row.publishedAt).toISOString(),
      qualified: REVIEWED.includes(row.reviewStatusKey),
      description: row.description,
      expenseTypes: links.filter((link) => link.entryId === row.id).map(({ key, label }) => ({ key, label })),
      recipient: row.organizationName
        ? { kind: "organization", name: row.organizationName }
        : row.personName
          ? { kind: "person", name: row.personName }
          : null,
      adjustsNumber: row.adjustsNumber ?? null,
    }));
  }

  async entries(query: PublicEntriesQuery): Promise<{ items: PublicTreasuryEntry[]; total: number; page: number; pageSize: number }> {
    const visibility = await this.visibility();
    const where = and(this.visible(visibility), ...this.filters(query));
    const view = treasuryPublicEntries;
    const [rows, [count]] = await Promise.all([
      this.selectEntries(visibility)
        .where(where)
        .orderBy(...this.order(query.sort))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ n: sql<number>`count(*)::int` }).from(view).where(where),
    ]);
    return { items: await this.withExpenseTypes(rows), total: count?.n ?? 0, page: query.page, pageSize: query.pageSize };
  }

  async entry(number: number): Promise<PublicTreasuryEntry | null> {
    const visibility = await this.visibility();
    const rows = await this.selectEntries(visibility)
      .where(and(this.visible(visibility), eq(treasuryPublicEntries.entryNumber, number)))
      .limit(1);
    if (rows.length === 0) return null;
    return (await this.withExpenseTypes(rows))[0]!;
  }

  async overview(currency: TreasuryCurrency): Promise<PublicTreasuryOverview> {
    const visibility = await this.visibility();
    const view = treasuryPublicEntries;
    const visible = this.visible(visibility);
    const [settings, donations, [expenses], [range], expenseTypes, [updated]] = await Promise.all([
      this.settings.getMany(["treasury.wise_connected", "treasury.donation_appeal"]),
      this.ledger.donationSummary(currency),
      this.db
        .select({ total: sql<string>`coalesce(sum(-${view.grossAmount}), 0)`, count: sql<number>`count(*)::int` })
        .from(view)
        .where(and(visible, eq(view.entryType, "expense"), eq(view.currency, currency))),
      this.db
        .select({
          first: sql<string | null>`min(${view.occurredOn})::text`,
          last: sql<string | null>`max(${view.occurredOn})::text`,
          currencies: sql<string[] | null>`array_agg(distinct ${view.currency}::text order by ${view.currency}::text)`,
        })
        .from(view)
        .where(visible),
      this.db
        .selectDistinct({ key: treasuryExpenseTypes.key, label: treasuryExpenseTypes.label, sortOrder: treasuryExpenseTypes.sortOrder })
        .from(view)
        .innerJoin(treasuryEntryExpenseTypes, eq(treasuryEntryExpenseTypes.entryId, view.id))
        .innerJoin(treasuryExpenseTypes, eq(treasuryExpenseTypes.key, treasuryEntryExpenseTypes.typeKey))
        .where(visible)
        .orderBy(asc(treasuryExpenseTypes.sortOrder)),
      // The last change the public can see: a publication, or an update of a published entry (a Notion re-import).
      this.db
        .select({ at: sql<Date | string | null>`max(greatest(${view.publishedAt}, ${treasuryEntries.updatedAt}))` })
        .from(view)
        .innerJoin(treasuryEntries, eq(treasuryEntries.id, view.id))
        .where(visible),
    ]);
    const wiseConnected = settings["treasury.wise_connected"];
    const lastUpdated = updated?.at ?? null;
    return {
      currency,
      // Hidden until Wise is connected (Q22): no figure is invented before then.
      wiseConnected,
      balance: null,
      sustainability: null,
      medianDonation: donations.medianDonation,
      donationCount: donations.donationCount,
      expensesTotal: Number(expenses?.total ?? 0),
      expenseCount: expenses?.count ?? 0,
      donationAppeal: settings["treasury.donation_appeal"],
      lastUpdatedAt: lastUpdated === null ? null : new Date(lastUpdated).toISOString(),
      filters: {
        currencies: range?.currencies ?? [],
        expenseTypes: expenseTypes.map(({ key, label }) => ({ key, label })),
        firstDate: range?.first ?? null,
        lastDate: range?.last ?? null,
      },
    };
  }
}
