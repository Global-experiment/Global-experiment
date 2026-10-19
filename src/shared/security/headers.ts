export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * All security headers, including CSP, applied via next.config.ts.
 *
 * The CSP intentionally allows 'unsafe-inline' for scripts, per Next.js's
 * own documented "Without Nonces" approach — see
 * docs/architecture/decisions/010-nonce-based-csp.md for why: a
 * nonce-based CSP was tried first, but Next.js requires nonces to be
 * generated per-request in middleware/proxy, which in turn requires every
 * page using them to be dynamically rendered (confirmed in Next's own
 * CSP guide and by direct testing — it broke script loading on this
 * project's statically-generated pages in production). Forcing the whole
 * site dynamic to get nonce-strict-dynamic script-src wasn't worth it
 * given this codebase has zero `dangerouslySetInnerHTML` usage (verified)
 * and therefore no real inline-script-injection sink for a nonce to
 * protect against today. Revisit if that ever changes.
 */
/**
 * Stripe.js and its card iframe (the donate page's embedded card form,
 * decided 2026-10-19), as Stripe documents for the Payment Element. Added
 * on the donate pages only; every other page keeps the strict policy.
 */
const STRIPE_SOURCES = {
  script: "https://js.stripe.com https://*.js.stripe.com",
  frame: "https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
  connect: "https://api.stripe.com https://*.stripe.com",
  img: "https://*.stripe.com",
} as const;

export function getSecurityHeaders({ stripe = false }: { stripe?: boolean } = {}): SecurityHeader[] {
  const isDev = process.env.NODE_ENV !== "production";

  const headers: SecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${stripe ? ` ${STRIPE_SOURCES.script}` : ""}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data:${stripe ? ` ${STRIPE_SOURCES.img}` : ""}`,
        "font-src 'self'",
        `connect-src 'self'${stripe ? ` ${STRIPE_SOURCES.connect}` : ""}`,
        ...(stripe ? [`frame-src ${STRIPE_SOURCES.frame}`] : []),
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    },
  ];

  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
