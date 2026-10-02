import { Module } from "@nestjs/common";
import { AdminSessionGuard } from "./admin-session.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { CsrfOriginGuard } from "./csrf-origin.guard.js";

/** Owner-admin authentication. Its guards are registered globally, in order, by AppModule. */
@Module({
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, CsrfOriginGuard, AdminSessionGuard],
  exports: [AuthService, AuthRepository, CsrfOriginGuard, AdminSessionGuard],
})
export class AuthModule {}
