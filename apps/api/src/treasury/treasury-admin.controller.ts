import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import type { AdminRequest } from "../auth/admin-area.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { ReviewTreasuryEntryRequest, TreasuryListQuery, UpdateTreasuryEntryRequest } from "./treasury-admin.contracts.js";
import { TreasuryAdminService } from "./treasury-admin.service.js";
import { Requires, RequiresAny } from "../access-control/requires.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

/**
 * /api/admin/treasury — each route requires its `treasury.*` permission
 * (PermissionGuard; the service also checks treasury.update,
 * treasury.review and treasury.manage per field). There is no create or
 * delete of entries, and no supporting documents any more (OPS-155, ADR 021:
 * accountants keep them outside the platform).
 */
@Controller("admin/treasury")
export class TreasuryAdminController {
  constructor(private readonly treasury: TreasuryAdminService) {}

  @Get()
  @Requires("treasury.read")
  list(@Query(new ZodValidationPipe(TreasuryListQuery)) query: TreasuryListQuery) {
    return this.treasury.list(query);
  }

  /** Expense types, review statuses, currencies and the Treasury settings, for filters and the record page. */
  @Get("options")
  @Requires("treasury.read")
  options() {
    return this.treasury.options();
  }

  @Get(":id")
  @Requires("treasury.read")
  get(@Param("id", IdParam) id: string) {
    return this.treasury.get(id);
  }

  /** The internal note (treasury.update), the review status (treasury.review) and an expense's business fields (treasury.manage). */
  @Patch(":id")
  @RequiresAny("treasury.update", "treasury.review", "treasury.manage")
  update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(UpdateTreasuryEntryRequest)) body: UpdateTreasuryEntryRequest,
    @Req() request: AdminRequest,
  ) {
    return this.treasury.update(id, body, request.admin);
  }

  @Post(":id/publish")
  @Requires("treasury.publish")
  @HttpCode(200)
  publish(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.publish(id, true, request.admin);
  }

  @Post(":id/unpublish")
  @Requires("treasury.publish")
  @HttpCode(200)
  unpublish(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.publish(id, false, request.admin);
  }

  @Post(":id/review")
  @Requires("treasury.review")
  @HttpCode(200)
  review(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(ReviewTreasuryEntryRequest)) body: ReviewTreasuryEntryRequest,
    @Req() request: AdminRequest,
  ) {
    return this.treasury.review(id, body, request.admin);
  }

  @Post(":id/archive")
  @Requires("treasury.update")
  @HttpCode(200)
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.setArchived(id, true, request.admin);
  }

  @Post(":id/restore")
  @Requires("treasury.update")
  @HttpCode(200)
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.treasury.setArchived(id, false, request.admin);
  }
}
