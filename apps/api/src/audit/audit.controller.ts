import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import type { AdminRequest } from "../auth/admin-area.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { NotFoundError, UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { AUDITED_ENTITIES } from "./audit.schema.js";
import { AuditService, COMMENTABLE } from "./audit.service.js";
import { entityLabel } from "./entity-labels.js";

const RecordType = new ZodValidationPipe(z.enum(COMMENTABLE, "Unknown record type."));
const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));
const CommentBody = z.strictObject({ body: z.string().trim().min(1, "Write a comment first.").max(5000) });
type CommentBody = z.output<typeof CommentBody>;

const HistoryListQuery = z.object({
  entityType: z.enum(AUDITED_ENTITIES).optional(),
  actor: z.union([z.literal("automation"), z.uuid()]).optional(),
  source: z.enum(["admin", "import", "stripe", "system"]).optional(),
  /**
   * The date range: whole UTC days (yyyy-mm-dd, `to` included), or the
   * instants the History page sends for the viewer's own days (from
   * included, to excluded).
   */
  from: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  to: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
type HistoryListQuery = z.output<typeof HistoryListQuery>;

const signedIn = (request: AdminRequest) => {
  if (!request.admin) throw new UnauthenticatedError();
  return request.admin;
};

/**
 * /api/admin/history — record histories (feed, views, comments) and the
 * Monitoring → History page. Owner session required (global admin guard).
 */
@Controller("admin")
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get("history")
  list(@Query(new ZodValidationPipe(HistoryListQuery)) query: HistoryListQuery, @Req() request: AdminRequest) {
    return this.audit.list(query, signedIn(request));
  }

  @Get("history/actors")
  actors() {
    return this.audit.actors();
  }

  @Get("history/:type/:id")
  async feed(@Param("type", RecordType) type: string, @Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    await this.label(type, id);
    return this.audit.feed(type, id, signedIn(request));
  }

  /** One opening of the record page (every opening counts). */
  @Post("history/:type/:id/views")
  async view(@Param("type", RecordType) type: string, @Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    await this.label(type, id);
    return this.audit.recordView(type, id, signedIn(request));
  }

  @Post("history/:type/:id/comments")
  @HttpCode(204)
  async comment(
    @Param("type", RecordType) type: string,
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CommentBody)) body: CommentBody,
    @Req() request: AdminRequest,
  ) {
    await this.audit.addComment(type, id, await this.label(type, id), signedIn(request), body.body);
  }

  @Patch("comments/:id")
  @HttpCode(204)
  async editComment(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(CommentBody)) body: CommentBody, @Req() request: AdminRequest) {
    await this.audit.editComment(id, signedIn(request), body.body);
  }

  @Delete("comments/:id")
  @HttpCode(204)
  async deleteComment(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    await this.audit.deleteComment(id, signedIn(request));
  }

  private async label(type: string, id: string): Promise<string> {
    const label = await entityLabel(this.db, type, id);
    if (!label) throw new NotFoundError("Record not found.");
    return label;
  }
}
