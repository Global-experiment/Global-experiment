import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { Requires } from "../access-control/requires.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { ImportRunsService } from "./import-runs.service.js";

export const ONLY_DIRECTORY_IMPORTS = "Only People and Organizations can be imported, from a CSV file. Treasury and every other table are edited in the admin.";

const RunsQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * /api/admin/imports — the history of import runs (imports.read). The only
 * import is the CSV import of People and Organizations (csv/, OPS-154): no
 * Notion import, no other table, no export.
 */
@Controller("admin/imports")
export class ImportsController {
  constructor(private readonly imports: ImportRunsService) {}

  @Get("runs")
  @Requires("imports.read")
  runs(@Query(new ZodValidationPipe(RunsQuery)) query: z.output<typeof RunsQuery>) {
    return this.imports.runs(query.page, query.pageSize);
  }
}
