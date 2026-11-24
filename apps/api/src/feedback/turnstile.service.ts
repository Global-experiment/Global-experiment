import { Inject, Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { APP_CONFIG } from "../common/config/config.module.js";
import { TURNSTILE_TEST_KEYS, type AppConfig } from "../common/config/env.js";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** In test mode (TURNSTILE_FIXTURE, NODE_ENV=test only), the one token that passes. */
export const FIXTURE_PASS_TOKEN = "fixture-pass";
/** In test mode, the site key the page receives (the browser tests stand in for Cloudflare's script). */
export const FIXTURE_SITE_KEY = "fixture-site-key";

/** passed: a person; failed: Cloudflare refused the token; unavailable: no check could be made (never a pass). */
export type BotCheck = "passed" | "failed" | "unavailable";

interface SiteverifyResponse {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  "error-codes"?: unknown;
}

/**
 * The bot check of the public feedback and issue forms (ADR 023): Cloudflare Turnstile, verified here on the
 * server for every submission. Fail-closed: without a secret, or when Cloudflare can't be reached, nothing is
 * accepted. The visitor's IP address isn't sent; Cloudflare already sees the browser that solved the check.
 */
@Injectable()
export class TurnstileService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TurnstileService.name);
    if (!config.turnstile.fixture && !config.turnstile.secretKey) {
      this.logger.warn("TURNSTILE_SECRET_KEY is not set: feedback and issue submissions are refused");
    }
  }

  /** The site key the page shows the check with (public by design), or null when submissions can't be checked. */
  siteKey(): string | null {
    const { fixture, siteKey, secretKey } = this.config.turnstile;
    if (fixture) return siteKey ?? FIXTURE_SITE_KEY;
    return secretKey && siteKey ? siteKey : null;
  }

  /** `action`: the form ("feedback" or "issue"), which the page names when it runs the check. */
  async verify(token: string, action: string): Promise<BotCheck> {
    const { fixture, secretKey } = this.config.turnstile;
    if (fixture) return token === FIXTURE_PASS_TOKEN ? "passed" : "failed";
    if (!secretKey) {
      this.logger.error("Feedback submission refused: TURNSTILE_SECRET_KEY is not set");
      return "unavailable";
    }

    let result: SiteverifyResponse;
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: secretKey, response: token }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.error({ status: response.status }, "Turnstile verification failed: Cloudflare answered with an error");
        return "unavailable";
      }
      result = (await response.json()) as SiteverifyResponse;
    } catch (error) {
      this.logger.error({ err: error }, "Turnstile verification failed: Cloudflare could not be reached");
      return "unavailable";
    }

    const codes = Array.isArray(result["error-codes"]) ? result["error-codes"].filter((code): code is string => typeof code === "string") : [];
    if (result.success !== true) {
      // Cloudflare's own failure, or a secret it doesn't accept: our side, not the visitor's.
      if (codes.some((code) => code === "internal-error" || code.includes("input-secret"))) {
        this.logger.error({ codes }, "Turnstile verification failed on Cloudflare's side");
        return "unavailable";
      }
      return "failed";
    }
    // Cloudflare's test secret answers for any page and action; real keys must match this site and this form.
    // Development only: production refuses Cloudflare's test keys at start-up (env.ts).
    if (secretKey === TURNSTILE_TEST_KEYS.secretKey) return "passed";
    if (result.hostname !== new URL(this.config.publicSiteUrl).hostname || result.action !== action) return "failed";
    return "passed";
  }
}
