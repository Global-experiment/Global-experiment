import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { isAdminArea, isAnonymousAllowed, type AdminRequest } from "./admin-area.js";
import { AuthService } from "./auth.service.js";
import { sessionCookieName } from "./session-cookie.js";

/** Global guard: every /api/admin handler requires a live owner session. */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isAdminArea(context, this.reflector) || isAnonymousAllowed(context, this.reflector)) return true;

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const principal = await this.auth.authenticate(request.cookies?.[sessionCookieName(this.config)]);
    if (!principal) throw new UnauthenticatedError();
    request.admin = principal;
    return true;
  }
}
