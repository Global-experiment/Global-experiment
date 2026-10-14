/**
 * Where the native NestJS API listens, as seen from the Next.js server.
 *
 * The browser only ever calls same-origin `/api/admin/*` (and the public
 * `/api/donations|stripe|treasury/*`, see publicApi.ts): Next.js rewrites
 * those requests to this origin (next.config.ts), so the API's
 * SameSite=Strict session cookie and its Origin checks work unchanged and
 * no CORS is needed. The production server sets ADMIN_API_ORIGIN (the
 * Next.js server proxies; docs/operations/stripe.md); without it in
 * production, nothing is proxied and the donate page reports donations as
 * unavailable. Development defaults to the API's own default
 * (`npm run api:dev`, 127.0.0.1:4000).
 */
export function adminApiOrigin(): string | undefined {
  const explicit = process.env.ADMIN_API_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? undefined : "http://127.0.0.1:4000";
}
