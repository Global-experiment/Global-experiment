# 002. PostgreSQL via Supabase, Accessed Through Drizzle

## Status

Accepted

## Context

The project needs a durable relational system of record for application
state that must outlive any temporary tool (Notion) — starting with an
audit trail, and later covering waitlist, submission, financial, and
governance state. The association wants low operating cost now and full
technical independence later (self-hosting on Hetzner is the long-term
hosting direction).

## Decision

Use Supabase-hosted PostgreSQL as infrastructure, accessed exclusively
through a standard Postgres connection string (`DATABASE_URL`) and Drizzle
ORM with versioned SQL migrations. No Supabase client SDK and no Supabase
Auth are introduced in v0.1, since v0.1 has no participant accounts and no
other concrete requirement for Supabase-specific APIs.

## Why Chosen

- Supabase provides a managed, low-maintenance Postgres instance quickly,
  without asking the association to run its own database infrastructure
  before it is ready to.
- Using only the standard Postgres wire protocol (via Drizzle) instead of
  Supabase's SDKs means the same codebase can point at any other Postgres
  instance (self-hosted on Hetzner, another managed provider) later by
  changing `DATABASE_URL` — no application code changes required.
- Drizzle gives typed queries and versioned, reviewable SQL migrations
  without a heavyweight ORM abstraction.

## Alternatives Considered

- **Supabase JS SDK + Supabase Auth** — rejected for v0.1: would couple the
  app to Supabase-specific APIs and introduce authentication infrastructure
  for a release that has no participant accounts. Revisit only if/when a
  concrete v1 requirement needs a Supabase-specific feature (e.g. Realtime)
  that plain Postgres access cannot provide.
- **Prisma** — a viable alternative ORM; Drizzle was chosen for its thinner
  runtime, SQL-first query style, and straightforward migration files, per
  the client's stated preference.
- **Self-hosted Postgres from day one** — rejected for now: adds hosting/ops
  burden before the association has its own infrastructure in place;
  Supabase is a stepping stone, not a permanent dependency.

## Trade-offs

- Supabase-specific dashboard conveniences (built-in auth UI, storage) are
  unused by design; the team gets a "plain Postgres" experience and loses
  none of the portability, but also gains none of the platform's
  higher-level features unless deliberately adopted later.
- Migrating away from Supabase hosting later is expected to be a
  connection-string change plus a data export/import, not a rewrite — but
  this has not yet been tested end-to-end.

## Future Migration Implications

This decision is what makes "migrate Supabase-hosted Postgres → self-hosted
Postgres on Hetzner" a low-risk operational change rather than an
architectural one, directly supporting the project's long-term technical
independence goal.
