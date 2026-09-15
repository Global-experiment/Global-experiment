# 004. Server-Side Secrets and Baseline Security Headers

## Status

Accepted

## Context

The Global Experiment repository is public. No credential (Notion token,
database connection string, future Stripe/Wise/AI/email keys) may ever
reach the browser or be committed to source control.

## Decision

- All secrets are read from environment variables, validated at first use
  through a single Zod schema (`src/shared/config/env.ts`), which fails
  fast with a descriptive error rather than allowing a partially-configured
  app to run.
- `.env.local` is gitignored; `.env.local.template` (committed) lists
  variable names only, with no real values.
- Any variable intentionally exposed to the browser must use Next.js's
  `NEXT_PUBLIC_` prefix and must be individually justified — none exist in
  v0.1 today (Documentation is server-rendered; no integration needs
  client-side exposure yet).
- A baseline set of security response headers
  (`src/shared/security/headers.ts`) is applied to every response via
  `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, a conservative
  `Content-Security-Policy` (`default-src 'self'`), and
  `Strict-Transport-Security` in production.
- Errors surfaced to end users go through `src/shared/errors/`
  (`AppError` and subclasses), which never expose stack traces or provider
  error bodies; `toSafeErrorResponse()` maps internal/provider failures to
  a generic user-facing message while the original error is still logged
  server-side.

## Why Chosen

- Fail-fast env validation catches misconfiguration in development/CI
  before it reaches production, rather than surfacing as a confusing
  runtime error mid-request.
- A single source of truth for parsed config prevents ad hoc
  `process.env` reads scattered through the codebase, which are easy to
  accidentally expose or forget to validate.
- The CSP/security headers give a meaningful baseline immediately, before
  any third-party script or analytics tool is introduced — those will
  require explicit, documented CSP source additions when they arrive (see
  "Open decisions" in `overview.md`).

## Alternatives Considered

- **Validate env vars ad hoc where used** — rejected: inconsistent, easy to
  miss a case, no single place to see the full configuration surface.
- **No CSP for v0.1, add later when third-party scripts arrive** —
  rejected: cheap to establish a strict baseline now and loosen it
  deliberately later; starting strict is safer than starting open.

## Trade-offs

- The current CSP allows `'unsafe-inline'` for styles, a pragmatic
  accommodation for Next.js/Tailwind's current output. Tightening this to a
  nonce-based policy is future work once it's clear which inline styles (if
  any) are actually required.
- Env validation is lazy (triggered on first use by the module that needs
  it, e.g. the future Notion client or DB client) rather than eager at
  process start, so that commands not touching those integrations (e.g.
  `next build` for pages with no external dependency yet) don't require
  every secret to be present. This trades a small amount of "fail fast at
  boot" guarantee for not blocking unrelated work during incremental
  development.

## Future Migration Implications

As Stripe, Wise, AI, and email integrations are added, each introduces its
own env vars validated through the same schema, and its own narrow CSP
additions. The pattern established here should be reused, not reinvented,
per integration.
