import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import type { AdminRequest } from "../auth/admin-area.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  DeleteTreasuryEntryRequest,
  ReviewTreasuryEntryRequest,
  TreasuryListQuery,
  UpdateTreasuryEntryRequest,
} from "./treasury-admin.contracts.js";
import { TreasuryAdminService, type UploadedFile } from "./treasury-admin.service.js";
import { DOCUMENT_MAX_BYTES } from "./treasury-documents.schema.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

/**
 * /api/admin/treasury — behind the global admin guard; changes and documents
 * are owner-only (checked in the service). There is no create or delete of
 * entries: expenses come from Notion, donations from Stripe (data ownership).
 */
@Controller("admin/treasury")
export class TreasuryAdminController {
  constructor(private readonly treasury: TreasuryAdminService) {}

  @Get()
  list(@Query(new ZodValidationPipe(TreasuryListQuery)) query: TreasuryListQuery) {
    return this.treasury.list(query);
  }

  /** Expense types, review statuses, currencies and the Treasury settings, for filters and the record page. */
  @Get("options")
  options() {
    return this.treasury.options();
  }

  @Get("documents/:documentId")
  async download(@Param("documentId", IdParam) documentId: string, @Req() request: AdminRequest, @Res({ passthrough: true }) response: Response) {
    const file = await this.treasury.download(documentId, request.admin);
    response.set({
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.length),
      // Always a download, never rendered by the browser in the admin's origin.
      "Content-Disposition": contentDisposition(file.fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(file.bytes);
  }

  @Delete("documents/:documentId")
  @HttpCode(204)
  deleteDocument(@Param("documentId", IdParam) documentId: string, @Req() request: AdminRequest) {
    return this.treasury.deleteDocument(documentId, request.admin);
  }

  @Get(":id")
  get(@Param("id", IdParam) id: string) {
    return this.treasury.get(id);
  }

  /** Only the internal note, and only on native entries (Notion-managed → 409 managed_in_notion). */
  @Patch(":id")
  update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(UpdateTreasuryEntryRequest)) body: UpdateTreasuryEntryRequest,
    @Req() request: AdminRequest,
  ) {
    return this.treasury.update(id, body, request.admin);
  }

  @Post(":id/publish")
  @HttpCode(200)
  publish(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.publish(id, true, request.admin);
  }

  @Post(":id/unpublish")
  @HttpCode(200)
  unpublish(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.publish(id, false, request.admin);
  }

  @Post(":id/review")
  @HttpCode(200)
  review(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(ReviewTreasuryEntryRequest)) body: ReviewTreasuryEntryRequest,
    @Req() request: AdminRequest,
  ) {
    return this.treasury.review(id, body, request.admin);
  }

  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.setArchived(id, true, request.admin);
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.setArchived(id, false, request.admin);
  }

  /** Permanent delete: owner only, manual entries only, with the entry number typed in `confirm`. */
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(DeleteTreasuryEntryRequest)) body: DeleteTreasuryEntryRequest, @Req() request: AdminRequest) {
    return this.treasury.delete(id, body.confirm, request.admin);
  }

  @Get(":id/documents")
  documents(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.documents(id, request.admin);
  }

  /** multipart/form-data, one `file` field; held in memory (multer's default, ≤ 20 MB) and type-checked from its bytes. */
  @Post(":id/documents")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1, fields: 0, parts: 2 } }),
  )
  upload(@Param("id", IdParam) id: string, @UploadedFileParam() file: UploadedFile | undefined, @Req() request: AdminRequest) {
    return this.treasury.upload(id, file, request.admin);
  }
}

/** attachment; an ASCII fallback plus the exact UTF-8 name (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
