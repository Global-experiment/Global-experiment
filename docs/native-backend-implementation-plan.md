# Native backend implementation plan

Status: living document, started 2026-10-03. Owner: lead engineer.
Scope: evolve Global Experiment v0.1 from "Next.js + live Notion" into
"Next.js frontend + NestJS native API + PostgreSQL", without breaking the
deployed public site at any point.

## 1. Current architecture (audited 2026-10-03)

- One Next.js 16.3.5 app at the repo root (`src/`), App Router, React 19,
  TypeScript strict, Tailwind v4, Inter via `next/font`. Modular monolith
  (ADR 001): `src/modules/{home,documentation}` with
  domain/application/infrastructure/ui layers.
- **Live Notion** for Home and Documentation, isolated in
  `src/integrations/notion` behind `HomeRepository` /
  `DocumentationRepository`; Documentation dataset cached 60 s
  (`unstable_cache`). This stays the production source until Phase 5/11.
- Treasury and Donate render clearly-labelled illustrative data
  (`src/shared/treasury/presentationData.ts`). Waitlist, Feedback, Issue and
  Contribute are UI shells that persist nothing.
- PostgreSQL/Drizzle: dependencies and `drizzle.config.ts` exist, but no
  schema, no migrations, and `src/db/client.ts` has no callers.
- Shared foundations worth keeping: Zod env validation, `AppError` +
  `toSafeErrorResponse`, JSON logger, security headers/CSP, Notion
  `resilientFetch`, design tokens and Figma-extracted UI components.
- Tests: Vitest (unit), Playwright (E2E), live Notion smoke suite; CI runs
  lint → typecheck → test → build.

## 2. Target architecture

```
Next.js (src/)  public site + /admin (desktop, client Figma)
      │  typed API client, DTOs only (never raw tables)
      ▼
NestJS (apps/api)  /api/health · /api/public/* · /api/admin/* (owner only)
      │  Drizzle ORM
      ▼
PostgreSQL  people · organizations · expertise · documentation · waitlist ·
            submissions · treasury · imports · jobs · admin auth
      ▲
Integration services (backend only): Notion (import source), OpenAI,
Stripe, Wise, email (Stalwart or approved stack)
```

Provider payloads never become the domain model: each integration maps
into native types at its boundary.

## 3. Repository layout

```
/                       existing Next.js app (unchanged location)
  src/  public/  e2e/  docs/
  apps/api/             NestJS app (npm workspace "@global-experiment/api")
    src/
      main.ts  app.module.ts
      common/{config,database,errors,logging,security,validation,pagination,jobs}
      auth/  health/
      people/ organizations/ expertise/        (Phase 2)
      imports/                                  (Phase 4)
      documentation/                            (Phase 5)
      waitlist/ submissions/                    (Phase 6)
      email/                                    (Phase 7)
      ai/                                       (Phase 8)
      treasury/                                 (Phase 9–10)
    drizzle/            versioned SQL migrations
  packages/contracts/   shared Zod request/response schemas (Phase 2–3)
  drizzle.config.ts     single migration config → apps/api schema
```

Folders are created only when a phase puts real code in them (ADR 005).

## 4. Module map

| Module | Owns | Phase |
| --- | --- | --- |
| auth | owner admin, sessions, guards | 1 |
| health | liveness + DB readiness | 1 |
| people | people, contacts, people↔orgs, people↔expertise | 2 |
| organizations | organizations, org↔expertise | 2 |
| expertise | domains → fields → items (closed taxonomy) | 2 |
| imports | import_runs, import_items, Notion People/Org import | 4 |
| documentation | native articles, revisions (real only), public API | 5 |
| waitlist | encrypted waitlist entries, opt-out | 6 |
| submissions | feedback, issues, contributions (raw + qualified) | 6 |
| email | EmailService, outbound + inbound reply ingestion | 7 |
| ai | AiQualificationService (strict schemas, no direct writes) | 8 |
| treasury | transactions, expenses (Person XOR Org), donations | 9–10 |
| access | access grants / services (Figma "Monitoring") | after 2, scoped with client |

## 5. Database model (first cut; validated per phase)

Conventions: `uuid` PKs (`gen_random_uuid()`), `created_at`/`updated_at`
`timestamptz`, snake_case, FKs with explicit `on delete`, CHECK/UNIQUE
constraints for invariants, no hard delete where retention matters
(`archived_at` instead).

- **Phase 1:** `admin_users` (role, unique email, scrypt hash; at most one
  `owner` via partial unique index), `admin_sessions` (hash of opaque token,
  expiry, revocation).
- **Phase 2:** `expertise_domains` → `expertise_fields` → `expertise_items`
  (unique names per parent); `people` (display number, names, state, source,
  personal note, do_not_contact, last_followup_at, Wise recipient ref,
  `duplicate_of`/duplicate flag); `person_contacts` (kind ∈ email, phone,
  website, linkedin, x, other; value); `organizations`;
  `people_organizations`, `people_expertise`, `organization_expertise` (join
  tables, composite PKs). Figma People columns map: Name, State, Source,
  Expertise, Personal note, Organization, Do not contact, Access grant,
  Expenses, Email, Phone, Website, Linkedin, X, Other contact, Created,
  Updated, Last followup, Number.
- **Phase 4:** `import_runs`, `import_items` (source system, source record
  id, payload hash, resulting entity, outcome) — makes reruns idempotent per
  source record without merging by name.
- **Phase 6:** `waitlist_entries` (AES-256-GCM encrypted email + HMAC blind
  index for uniqueness/opt-out, no plaintext), `submissions`.
- **Phase 9:** `expenses` with `CHECK ((person_id IS NULL) <> (organization_id IS NULL))`.
- Jobs: pg-boss (its own schema in the same Postgres) when Phase 4 needs
  background work — no Redis.

## 6. API plan

- Prefixes: `/api/health`, `/api/public/*` (no auth), `/api/admin/*`
  (owner session required — enforced by a global guard keyed on the path,
  so a new admin controller cannot be accidentally public).
- Validation: Zod schemas through one `ZodValidationPipe` (the project
  already standardises on Zod; schemas move to `packages/contracts` so the
  Next.js client reuses them).
- Errors: one JSON shape
  `{ "error": { "code", "message", "requestId", "details"? } }` with
  400 validation · 401 unauthenticated · 403 forbidden (incl. CSRF) · 404 ·
  409 conflict · 429 · 502 provider · 500 internal. No stack traces, no
  provider bodies.
- Lists: one shared query contract — `page`, `pageSize` (≤ 100), `search`,
  `sort` (whitelisted per resource), `direction`, typed `filters`
  (whitelisted field × operator × value) compiled to Drizzle expressions; the
  client never sends SQL fragments.
- Every request gets `x-request-id` (accepted if well-formed, else
  generated), echoed in responses and every log line.

## 7. Auth plan (assumption — see open questions)

No authentication method is specified in the project files, so Phase 1
implements the simplest secure option, isolated in `auth/` so it can be
replaced:

- One owner account (Candide). No signup endpoint; the owner is created or
  re-keyed with a local CLI (`npm run admin:set-owner -w @global-experiment/api`).
- Password hashed with Node's built-in scrypt (no native dependency).
- Opaque 256-bit session token in an `HttpOnly; Secure; SameSite=Strict`
  cookie; only its SHA-256 is stored; sliding expiry with absolute cap;
  logout revokes server-side.
- CSRF: SameSite=Strict plus an Origin check on every state-changing admin
  request (allow-list from config).
- Login rate-limited per IP and per account; uniform error message.
- Nothing about the session lives in `localStorage`.

## 8. Admin / Figma plan

- Source of truth: `figma.pdf` pages 40–44 (People list, filters, sort,
  column menu, Notion import states, toasts) plus the IA FigJam.
- Sidebar (exact order from Figma): Content (Home, Documentation) · Admin
  (Feedbacks and issues, Treasury, People, Organizations) · Monitoring
  (Services, Access grants, Technical dashboard, Analytics) · Other
  (Expertise, Fields, Domains, Profile). Only implemented modules link.
- People view tabs from Figma: All, Sourcing, Discussions, Contributors,
  Collaborators, +3 — implemented as saved views (server-stored filters).
- Shared admin table: server pagination/search/filter/sort, column
  visibility/order/pinning (Figma "Freeze column"/"Hide column"), saved
  views; state in the URL so returning from a record restores it. Hidden
  columns stay listed in the column menu.
- "Notion import" is one control with idle/loading/done states.
- Measured with the same PDF tooling used for the public site; reuses the
  public design tokens only where Figma matches; public styling untouched.
- Missing in Figma (record pages, Organizations, Expertise screens): build
  from the People list's components and confirm with the client.

## 9. Testing strategy

- API unit/use-case tests: Vitest + SWC (decorator metadata).
- Repository, constraint, migration and HTTP tests: real Postgres via
  PGlite (in-process; no Docker needed), migrations applied exactly as in
  production, supertest against the Nest app.
- Must-have relational tests: People↔Organizations M:N, expertise
  hierarchy, duplicate import visibility, Expense recipient XOR, waitlist
  never creates a Person, admin routes reject anonymous/CSRF requests,
  unique slugs.
- Frontend: existing Vitest + Playwright stay green every phase; admin E2E
  added when admin screens become functional.
- CI: the `build` job runs the API typecheck, PGlite suite and build; the
  `api-postgres` job runs `drizzle-kit migrate` twice (apply, then no-op)
  and the same API suites against a PostgreSQL 17 service container.
- Real-PostgreSQL suite locally: `npm run api:test:pg` reads
  `TEST_DATABASE_URL` from `.env.local`; it wipes that database on every run
  and refuses any database whose name does not end in `_test`.

### Local development database

- PostgreSQL 17 on `localhost:5433` (a separate PostgreSQL 9.1 on 5432 is
  unrelated to this project and must not be touched).
- Databases `global_experiment_dev` (application) and
  `global_experiment_test` (real-PostgreSQL tests), both owned by the
  non-superuser role `ge_dev` (no SUPERUSER, CREATEDB, CREATEROLE,
  REPLICATION or BYPASSRLS). The application never uses `postgres`.
- `DATABASE_URL` / `TEST_DATABASE_URL` live only in the gitignored
  `.env.local`; the superuser credential lives only in the developer's
  `%APPDATA%\postgresql\pgpass.conf`.
- Setup: `npm run db:migrate`, `npm run api:build`,
  `npm run admin:set-owner -w @global-experiment/api -- --email=…`,
  `npm run api:dev`.

## 10. Migration / cutover strategy

Per feature: native source exists → data imported → parity verified →
tests pass → frontend adapter switches behind the existing repository
interface → old provider kept for rollback for one release → then removed.
Never fixture/mock content in place of real content. Backups and a tested
restore precede any destructive migration; production migrations are run
manually by the owner, never automatically by this work.

## 11. Phases

1. Foundation — NestJS app, config/env validation, Drizzle + migrations,
   health, validation pipe, error filter, structured logs + request IDs,
   security headers, owner auth + admin guard + CSRF, test harness, CI.
2. Core directory — People, Organizations, Expertise + APIs + list contract.
3. Figma admin — /admin shell, People list/record, Organizations, Expertise.
4. Notion import — runs/items, People + Organizations, states, duplicates.
5. Native Documentation — schema, admin, public API, import, parity.
6. Waitlist + submissions.
7. Email.
8. AI qualification.
9. Treasury model.
10. Stripe / Wise.
11. Migration / cutover.

Each phase ends with the checkpoint in the brief (lint, typecheck, unit,
integration, E2E, both builds, diff + secret review, public site check).

## 12. Decisions taken (2026-10-03)

- **Admin auth**: keep password + server-side session (ADR 014). No 2FA and
  no third-party auth provider for v0.1; the `auth/` module stays isolated
  so either can be added on explicit request.
- **Development database**: native PostgreSQL 17 (see §9), not Supabase.
- **People / Organizations**: native, independent concepts with a
  many-to-many relationship. Legacy Notion "Contributors" / "Contractors"
  are import sources only; their mapping is decided in the Notion-import
  phase after inspecting real records. The native model never refers to
  legacy table names.
- **Person State**: Figma evidences Sourced, Contacted, Collaborating — known
  examples, not a confirmed lifecycle. Stored extensibly (no PostgreSQL
  enum), so client-approved states can be added without a destructive
  migration. Phase 3 UI shows only Figma/spec-supported values.
- **Person Source**: provenance (manual/Candide, AI, contribution email,
  waitlist, Notion import, …). Stored extensibly; labels not final.
- **`/api` routing**: NestJS owns `/api/*` including `/api/health`
  long-term. The Next.js `/api/health` route stays until the reverse-proxy
  cutover, then is renamed or retired. No production proxy change yet.

## 13. Unresolved requirements (do not decide silently)

1. **"Number" column** (Figma People table): meaning undefined — not phone,
   row number, rank or ID by assumption. Does not block the People schema;
   revisit with the exact Figma/property context in Phase 3.
2. **"+3" saved views**: names/configuration unspecified. The table
   infrastructure supports saved views generically (filters, search, sort,
   visible columns, order, pinning); no client views are invented.
3. Notion re-import matching policy and the legacy → native field mapping
   (Phase 4).
4. Exact Person State lifecycle and Source label list.
5. Deployment cutover of `/api/*` to NestJS and retirement of the Next.js
   health route.
6. Service-level PostgreSQL restart reconnect: not yet observed live (the
   database-level outage/reconnect test passes).
7. Waitlist reply → existing Person matching policy.
8. Final inbound/outbound email addresses and provider (Stalwart?).
9. Analytics, Services, Technical dashboard scope (Figma Monitoring group).
10. Retention periods for waitlist and submission personal data.
11. Any automation that moves, charges or refunds money.
