/**
 * Where the native NestJS API listens, as seen from the Next.js server.
 *
 * The browser only ever calls same-origin `/api/admin/*`: Next.js rewrites
 * those requests to this origin (next.config.ts), so the API's
 * SameSite=Strict session cookie and its CSRF Origin check work unchanged
 * and no CORS is needed. In production the reverse proxy is expected to
 * route /api/admin to the API directly; set ADMIN_API_ORIGIN only if the
 * Next.js server should proxy instead. Development defaults to the API's
 * own default (`npm run api:dev`, 127.0.0.1:4000).
 */
export function adminApiOrigin(): string | undefined {
  const explicit = process.env.ADMIN_API_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? undefined : "http://127.0.0.1:4000";
}
