import { Controller, Get, Module, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { TreasuryLedgerRepository } from "./treasury-ledger.repository.js";
import { TREASURY_CURRENCIES } from "./treasury.schema.js";

const SummaryQuery = z.strictObject({ currency: z.enum(TREASURY_CURRENCIES) });
type SummaryQuery = z.infer<typeof SummaryQuery>;

/**
 * Public, read-only Treasury figures (no personal data, published entries
 * only, through the public view). Cached by the web server and revalidated
 * on demand after every ledger write.
 */
@Controller("treasury")
export class TreasuryPublicController {
  constructor(private readonly ledger: TreasuryLedgerRepository) {}

  /** GET /api/treasury/summary?currency=EUR — the donate page's stats. */
  @Get("summary")
  summary(@Query(new ZodValidationPipe(SummaryQuery)) query: SummaryQuery) {
    return this.ledger.donationSummary(query.currency);
  }
}

@Module({
  controllers: [TreasuryPublicController],
  providers: [TreasuryLedgerRepository],
  exports: [TreasuryLedgerRepository],
})
export class TreasuryModule {}
