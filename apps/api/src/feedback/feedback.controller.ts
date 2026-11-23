import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { Requires } from "../access-control/requires.js";
import { actorFor } from "../audit/audit.service.js";
import type { AdminRequest } from "../auth/admin-area.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { SiteOriginGuard } from "../common/site-origin.guard.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { FeedbackListQuery, SubmitRequest, UpdateSubmissionRequest } from "./feedback.contracts.js";
import { FeedbackService } from "./feedback.service.js";

/** Per client IP: a person sends a few; a script is stopped. The IP is kept in memory only, for the window. */
export const SUBMIT_LIMIT = { default: { limit: 10, ttl: 15 * 60 * 1000 } };

/** /api/feedback — the public composers (no account). Nothing about submissions is ever read back here. */
@Controller("feedback")
export class FeedbackPublicController {
  constructor(private readonly feedback: FeedbackService) {}

  /** GET /api/feedback/config — the bot check's site key (public by design). */
  @Get("config")
  config() {
    return this.feedback.publicConfig();
  }

  /** POST /api/feedback/submissions — a feedback or an issue report; 201 { received: true }. */
  @Post("submissions")
  @HttpCode(201)
  @UseGuards(SiteOriginGuard)
  @Throttle(SUBMIT_LIMIT)
  submit(@Body(new ZodValidationPipe(SubmitRequest)) body: SubmitRequest) {
    return this.feedback.submit(body);
  }
}

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));
const principal = (request: AdminRequest) => {
  if (!request.admin) throw new UnauthenticatedError();
  return request.admin;
};

/**
 * /api/admin/feedback — Feedbacks and issues (Figma p8–p10): feedback.read to see, feedback.update to qualify,
 * archive and restore. Views, comments and the History are the shared /api/admin/history routes.
 */
@Controller("admin/feedback")
export class FeedbackAdminController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @Requires("feedback.read")
  list(@Query(new ZodValidationPipe(FeedbackListQuery)) query: FeedbackListQuery) {
    return this.feedback.list(query);
  }

  /** The kinds, types and statuses, for the tabs, filters and the record. */
  @Get("options")
  @Requires("feedback.read")
  options() {
    return this.feedback.options();
  }

  @Get(":id")
  @Requires("feedback.read")
  get(@Param("id", IdParam) id: string) {
    return this.feedback.get(id);
  }

  @Patch(":id")
  @Requires("feedback.update")
  update(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(UpdateSubmissionRequest)) body: UpdateSubmissionRequest, @Req() request: AdminRequest) {
    return this.feedback.update(id, body, actorFor(principal(request)));
  }

  @Post(":id/archive")
  @HttpCode(200)
  @Requires("feedback.update")
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.feedback.setArchived(id, true, actorFor(principal(request)));
  }

  @Post(":id/restore")
  @HttpCode(200)
  @Requires("feedback.update")
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.feedback.setArchived(id, false, actorFor(principal(request)));
  }
}
