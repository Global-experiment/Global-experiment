import type { INestApplication } from "@nestjs/common";
import { ExpressAdapter, type NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import type { AppConfig } from "./common/config/env.js";

export const API_PREFIX = "api";
export const JSON_BODY_LIMIT = "100kb";

/**
 * The Express instance is created here, before Nest registers any route,
 * because Express fixes its router options on first use: routing must be
 * case-sensitive so "/API/ADMIN" never reaches an "/api/admin" handler
 * (defence in depth — the admin guard decides from route metadata anyway).
 */
export function createHttpAdapter(): ExpressAdapter {
  const instance = express();
  instance.set("case sensitive routing", true);
  instance.disable("x-powered-by");
  return new ExpressAdapter(instance);
}

/**
 * HTTP-level hardening shared by the real server (main.ts) and the test
 * harness, so tests exercise exactly the production middleware stack.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const server = app as NestExpressApplication;

  server.useLogger(server.get(Logger));
  server.setGlobalPrefix(API_PREFIX);
  // Client IPs (rate limiting) come from X-Forwarded-For only for trusted proxy hops.
  server.set("trust proxy", config.trustProxyHops);

  server.use(
    helmet({
      // JSON-only API: nothing may be framed, scripted or embedded. No
      // helmet defaults merged in — those are for HTML pages.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "same-origin" },
      hsts: config.nodeEnv === "production",
    }),
  );
  server.use(cookieParser());
  server.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  // Same-origin API behind the site's reverse proxy: no CORS is enabled.

  server.enableShutdownHooks();
}

/**
 * Must run after `app.init()` (routes registered): anything no route
 * matched — including paths outside the /api prefix, which Nest's own
 * not-found handler doesn't cover — gets the uniform JSON 404 instead of
 * Express's HTML "Cannot GET" page.
 */
export function finalizeApp(app: INestApplication): void {
  const instance = (app as NestExpressApplication).getHttpAdapter().getInstance() as express.Express;
  const notFound: express.RequestHandler = (req, res) => {
    const requestId = (req as express.Request & { id?: string }).id;
    res.status(404).json({ error: { code: "not_found", message: "Not found.", requestId } });
  };
  instance.use(notFound);
}
