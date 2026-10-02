# 013. NestJS Native API Alongside the Next.js Site

## Status

Accepted (2026-10-03). Amends [001](./001-modular-monolith.md): the
system becomes two deployables. Builds on [002](./002-postgresql-supabase-infrastructure.md)
(plain Postgres via `DATABASE_URL` + Drizzle) and [005](./005-v0-to-v1-evolution.md)
(folders and tables only when a phase needs them).

## Context

The agreed target architecture moves operational data (People,
Organizations, Expertise, Documentation, Waitlist, submissions, Treasury,
imports) out of Notion into a native PostgreSQL system with an owner-only
admin, background jobs, and backend-only integrations (Notion import,
OpenAI, Stripe, Wise, email). The public site must keep working — and keep
reading live Notion for Home/Documentation — throughout the migration.

## Decision

- Add a **NestJS** API in `apps/api` (npm workspace
  `@global-experiment/api`). The Next.js site stays at the repository root,
  unchanged in location and behaviour.
- The API is the **only owner of the database**. Schema lives next to each
  API module (`apps/api/src/**/*.schema.ts`); versioned SQL migrations in
  `apps/api/drizzle`; the single `drizzle.config.ts` at the root points
  there. The unused Next.js `src/db/client.ts` was removed, and the Next.js
  env no longer knows `DATABASE_URL`.
- Stack: NestJS 12 (ES modules), Express, Drizzle (postgres-js in
  production), Zod for request validation (one validation library across
  the repo; schemas will move to a shared `packages/contracts` workspace
  for the typed frontend client), pino logs with request ids.
- Routes: `/api/health`, `/api/public/*`, `/api/admin/*` (owner session
  required by a global guard; see 014).
- Tests: Vitest with SWC (decorator metadata) and real PostgreSQL
  in-process via PGlite, migrations applied exactly as in production.

## Why chosen

- The client-agreed target architecture specifies NestJS; a separate
  process gives clean boundaries for jobs, provider integrations and admin
  APIs without loading them into the public site's rendering path.
- Keeping one database owner prevents two competing data-access layers.
- PGlite gives database-level tests (constraints, indexes, transactions)
  without Docker, which this development machine and CI do not need.

## Alternatives considered

- **Admin API inside Next.js route handlers** — rejected: contradicts the
  agreed architecture and would mix long-running jobs and provider
  integrations into the web deployable.
- **Moving the site to `apps/web`** — deferred: an unrequested, risky
  refactor of a deployed site; revisit only with explicit approval.
- **class-validator DTOs (Nest default)** — rejected in favour of Zod,
  already used by the site, which allows shared request/response contracts.
- **Testcontainers / Docker Postgres for tests** — not available locally;
  PGlite is real Postgres compiled to WASM. A later CI job may add a
  service-container run as an extra check.

## Trade-offs

- Two deployables to build, run and monitor. The reverse proxy must route
  `/api/*` to the API; Next.js's own `/api/health` would then be shadowed
  (rename or retire it at deployment — open question in the plan).
- NestJS 12 is ESM-only: imports use `.js` suffixes; Vitest needs SWC.
- PGlite and postgres-js are different drivers; repositories depend only
  on Drizzle's driver-agnostic `PgDatabase` type.

## Future migration implications

Each later phase (People, imports, Documentation, Waitlist, email, AI,
Treasury) adds a module under `apps/api/src`, its tables, and its own ADR
where a decision is non-obvious. Public features switch from Notion to the
API only after native parity is verified, behind the existing frontend
repository interfaces, with rollback possible.
