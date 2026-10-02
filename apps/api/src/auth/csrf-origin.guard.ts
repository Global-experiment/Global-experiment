import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { ForbiddenError } from "../common/errors/api-error.js";
import { isAdminArea } from "./admin-area.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(request: Request): string | undefined {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin !== "null") return origin;
  const referer = request.headers.referer;
  if (typeof referer !== "string") return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF defence for the admin API, layered on top of SameSite=Strict
 * cookies: every state-changing admin request (login included) must come
 * from an allow-listed origin. Requests with no Origin/Referer are refused.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method) || !isAdminArea(context, this.reflector)) return true;
    const origin = requestOrigin(request);
    if (!origin || !this.config.adminAllowedOrigins.includes(origin)) {
      throw new ForbiddenError("Cross-site request refused.");
    }
    return true;
  }
}
