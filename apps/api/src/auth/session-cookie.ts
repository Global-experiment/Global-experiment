import type { CookieOptions } from "express";
import type { AppConfig } from "../common/config/env.js";

/**
 * `__Host-` prefix (browser-enforced: Secure, Path=/, no Domain) whenever
 * cookies are secure; plain name only for http://localhost development.
 */
export function sessionCookieName(config: AppConfig): string {
  return config.cookieSecure ? "__Host-ge_admin_session" : "ge_admin_session";
}

export function sessionCookieOptions(config: AppConfig, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/",
    ...(expires ? { expires } : {}),
  };
}
