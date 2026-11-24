import { Module } from "@nestjs/common";
import { SiteOriginGuard } from "../common/site-origin.guard.js";
import { FeedbackAdminController, FeedbackPublicController } from "./feedback.controller.js";
import { FeedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";
import { TurnstileService } from "./turnstile.service.js";

/** Feedbacks and issues (roadmap §2 item 1): the public composers' intake and the admin's qualification. */
@Module({
  controllers: [FeedbackPublicController, FeedbackAdminController],
  providers: [FeedbackRepository, FeedbackService, TurnstileService, SiteOriginGuard],
})
export class FeedbackModule {}
