import { Controller, Get, Module, Param, Query } from "@nestjs/common";
import { z } from "zod";
import { NotFoundError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { TreasuryAdminController } from "./treasury-admin.controller.js";
import { TreasuryAdminRepository } from "./treasury-admin.repository.js";
import { TreasuryAdminService } from "./treasury-admin.service.js";
import { TreasuryLedgerRepository } from "./treasury-ledger.repository.js";
import { PublicEntriesQuery, PublicOverviewQuery } from "./treasury-public.contracts.js";
import { TreasuryPublicRepository } from "./treasury-public.repository.js";
import { TREASURY_CURRENCIES } from "./treasury.schema.js";

const SummaryQuery = z.strictObject({ currency: z.enum(TREASURY_CURRENCIES) });
type SummaryQuery = z.infer<typeof SummaryQuery>;
const NumberParam = new ZodValidationPipe(z.coerce.number().int().min(1).max(2_147_483_647));

/**
 * Public, read-only Treasury figures (no personal data, published entries
 * only, through the public view). Cached by the web server and revalidated
 * on demand after every ledger write.
 */
@Controller("treasury")
export class TreasuryPublicController {
  constructor(
    private readonly ledger: TreasuryLedgerRepository,
    private readonly treasury: TreasuryPublicRepository,
  ) {}

  /** GET /api/treasury/summary?currency=EUR — the donate page's stats. */
  @Get("summary")
  summary(@Query(new ZodValidationPipe(SummaryQuery)) query: SummaryQuery) {
    return this.ledger.donationSummary(query.currency);
  }

  /** GET /api/treasury/overview?currency=USD — the Treasury page's stats, banner, filter values, last update. */
  @Get("overview")
  overview(@Query(new ZodValidationPipe(PublicOverviewQuery)) query: PublicOverviewQuery) {
    return this.treasury.overview(query.currency);
  }

  /** GET /api/treasury/entries?type&currency&from&to&expenseType&sort&page&pageSize — the history. */
  @Get("entries")
  entries(@Query(new ZodValidationPipe(PublicEntriesQuery)) query: PublicEntriesQuery) {
    return this.treasury.entries(query);
  }

  /** GET /api/treasury/entries/:number — one public entry (404 when it isn't public). */
  @Get("entries/:number")
  async entry(@Param("number", NumberParam) number: number) {
    const entry = await this.treasury.entry(number);
    if (!entry) throw new NotFoundError("Treasury entry not found.");
    return entry;
  }
}

@Module({
  controllers: [TreasuryPublicController, TreasuryAdminController],
  providers: [TreasuryLedgerRepository, TreasuryPublicRepository, TreasuryAdminRepository, TreasuryAdminService],
  exports: [TreasuryLedgerRepository],
})
export class TreasuryModule {}
