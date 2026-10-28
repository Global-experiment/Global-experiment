import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import type { AdminRequest } from "../auth/admin-area.js";
import { ForbiddenError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { ImportJobsService } from "./import-jobs.service.js";
import { IMPORT_KINDS, type ImportKind } from "./import-source.js";
import { Requires, RequiresForParam } from "../access-control/requires.js";
import { IMPORT_MODULES } from "../access-control/permissions.js";

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
 * stays on the server; responses carry reports and counts only. Seeing the
 * page is imports.read; starting a run, the kind's `<module>.import`.
 */
@Controller("admin/imports")
export class ImportsController {
  constructor(private readonly imports: ImportJobsService) {}

  @Get("status")
  @Requires("imports.read")
  status() {
    return this.imports.status();
  }

  @Get("runs")
  @Requires("imports.read")
  runs(@Query(new ZodValidationPipe(RunsQuery)) query: z.output<typeof RunsQuery>) {
    return this.imports.runs(query.page, query.pageSize);
  }

  @Get("jobs/:id")
  @Requires("imports.read")
  job(@Param("id", JobIdParam) id: string) {
    return this.imports.job(id);
  }

  @Post(":kind/dry-run")
  @RequiresForParam("kind", IMPORT_MODULES, "import")
  @HttpCode(202)
  dryRun(@Param("kind", KindParam) kind: ImportKind, @Req() request: AdminRequest) {
    return this.imports.startDryRun(kind, ownerTrigger(request));
  }

  @Post(":kind/apply")
  @RequiresForParam("kind", IMPORT_MODULES, "import")
  @HttpCode(202)
  apply(@Param("kind", KindParam) kind: ImportKind, @Body(new ZodValidationPipe(ApplyRequest)) body: z.output<typeof ApplyRequest>, @Req() request: AdminRequest) {
    return this.imports.startApply(kind, body.dryRunId, ownerTrigger(request));
  }
}

/** Who started the run (`<module>.import` is checked by the permission guard). */
function ownerTrigger(request: AdminRequest): string {
  if (!request.admin) throw new ForbiddenError("Sign in to run imports.");
  return `admin:${request.admin.email}`;
}
