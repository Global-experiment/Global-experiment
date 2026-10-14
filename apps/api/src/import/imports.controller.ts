import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import type { AdminRequest } from "../auth/admin-area.js";
import { ForbiddenError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { ImportJobsService } from "./import-jobs.service.js";
import { IMPORT_KINDS, type ImportKind } from "./import-source.js";

const KindParam = new ZodValidationPipe(z.enum(IMPORT_KINDS as [ImportKind, ...ImportKind[]], "Unknown import kind."));
const JobIdParam = new ZodValidationPipe(z.uuid("Invalid id."));
const RunsQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const ApplyRequest = z.strictObject({ dryRunId: z.uuid("Invalid dry run id.") });

/**
 * /api/admin/imports — the admin import page: run history, dry runs and
 * applies from Notion (as background jobs), job status. The Notion token
 * stays on the server; responses carry reports and counts only. Starting a
 * run needs the owner role (the global guard already requires a session).
 */
@Controller("admin/imports")
export class ImportsController {
  constructor(private readonly imports: ImportJobsService) {}

  @Get("status")
  status() {
    return this.imports.status();
  }

  @Get("runs")
  runs(@Query(new ZodValidationPipe(RunsQuery)) query: z.output<typeof RunsQuery>) {
    return this.imports.runs(query.page, query.pageSize);
  }

  @Get("jobs/:id")
  job(@Param("id", JobIdParam) id: string) {
    return this.imports.job(id);
  }

  @Post(":kind/dry-run")
  @HttpCode(202)
  dryRun(@Param("kind", KindParam) kind: ImportKind, @Req() request: AdminRequest) {
    return this.imports.startDryRun(kind, ownerTrigger(request));
  }

  @Post(":kind/apply")
  @HttpCode(202)
  apply(@Param("kind", KindParam) kind: ImportKind, @Body(new ZodValidationPipe(ApplyRequest)) body: z.output<typeof ApplyRequest>, @Req() request: AdminRequest) {
    return this.imports.startApply(kind, body.dryRunId, ownerTrigger(request));
  }
}

/** Only the owner may run imports; the run records who did. */
function ownerTrigger(request: AdminRequest): string {
  if (request.admin?.role !== "owner") throw new ForbiddenError("Only the owner can run imports.");
  return `admin:${request.admin.email}`;
}
