import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";

/** Cache tags the public site uses (src/shared/config/publicApi.ts). */
export const PUBLIC_CACHE_TAGS = { treasury: "treasury" } as const;
export type PublicCacheTag = (typeof PUBLIC_CACHE_TAGS)[keyof typeof PUBLIC_CACHE_TAGS];

/**
 * On-demand revalidation of the public pages (docs/architecture/overview.md
 * §3.7): after a write the API tells the Next.js server which cache tags are
 * stale. Best-effort by design — a failure is logged and the pages' 5-minute
 * time-based revalidation still applies; it never fails the write.
 */
@Injectable()
export class RevalidationService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RevalidationService.name);
  }

  async revalidate(tags: readonly PublicCacheTag[]): Promise<boolean> {
    const { webUrl, secret } = this.config.revalidation;
    if (!secret) {
      this.logger.debug({ tags }, "Revalidation skipped: REVALIDATE_SECRET is not configured");
      return false;
    }
    try {
      const response = await fetch(`${webUrl}/api/revalidate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-revalidate-secret": secret },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        this.logger.warn({ tags, status: response.status }, "Revalidation refused by the web server");
        return false;
      }
      this.logger.info({ tags }, "Public pages revalidated");
      return true;
    } catch (error) {
      this.logger.warn({ tags, reason: error instanceof Error ? error.name : "unknown" }, "Revalidation failed; the time-based fallback applies");
      return false;
    }
  }
}

@Global()
@Module({ providers: [RevalidationService], exports: [RevalidationService] })
export class RevalidationModule {}
