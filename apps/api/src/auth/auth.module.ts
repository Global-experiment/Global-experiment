import { Module } from "@nestjs/common";
import { AdminSessionGuard } from "./admin-session.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { CsrfOriginGuard } from "./csrf-origin.guard.js";
import { PermissionGuard } from "../access-control/permission.guard.js";

/** Admin authentication and access control. Its guards are registered globally, in order, by AppModule. */
@Module({
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, CsrfOriginGuard, AdminSessionGuard, PermissionGuard],
  exports: [AuthService, AuthRepository, CsrfOriginGuard, AdminSessionGuard, PermissionGuard],
})
export class AuthModule {}
