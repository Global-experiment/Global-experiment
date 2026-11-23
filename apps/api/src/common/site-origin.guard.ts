import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { APP_CONFIG } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";
import { ForbiddenError } from "./errors/api-error.js";

/**
 * Only the public site may call a public write route (donations, feedback): the request's Origin must be the
 * site (PUBLIC_SITE_URL; outside production also the local dev origins). Refuses requests with no Origin —
 * browsers always send it on a cross-origin-capable POST.
 */
@Injectable()
export class SiteOriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    const allowed = new Set([this.config.publicSiteUrl, ...(this.config.nodeEnv === "production" ? [] : this.config.adminAllowedOrigins)]);
    if (typeof origin !== "string" || !allowed.has(origin)) throw new ForbiddenError("Cross-site request refused.");
    return true;
  }
}
