# Global Experiment — Architecture Overview

This document is the entry point into the technical architecture of Global
Experiment. It is written for transparency: the source repository is public,
and the project's philosophy (transparency, neutrality, auditability, FOSS
where practical, long-term technical independence) applies to how the system
is built, not only to what it does.

Individual decisions with real trade-offs are recorded as Architecture
Decision Records (ADRs) under [`decisions/`](./decisions/). This overview
explains how the pieces fit together; the ADRs explain why each piece was
chosen.

## Current scope: v0.1

v0.1 is a public information and operational foundation release: Home,
Documentation, and (in later milestones of the same release line) Treasury,
Donations, Waitlist, Feedback, Issue reporting, and Contribution. It has no
participant accounts, voting, governance engine, or admin platform — see
"v1 boundaries" below for why that is a deliberate choice, not an omission.

All of Home's destinations are navigable now (real routes, not disabled
buttons), even though most of their backend behavior is a later milestone —
see [008-route-shells](./decisions/008-route-shells.md) for the "navigation
scaffold vs. feature completion" distinction this relies on. The UI
reproduces the client's Figma frames measured from the vector export — see
[design-fidelity.md](./design-fidelity.md) — and shares one responsive
sheet/dialog primitive, see
[011-responsive-sheet-and-inline-articles](./decisions/011-responsive-sheet-and-inline-articles.md).

## Style: modular monolith

Global Experiment is one deployable Next.js (App Router, TypeScript)
application, internally divided into modules with clear boundaries rather
than split into separate services. See
[001-modular-monolith](./decisions/001-modular-monolith.md).

```
src/
  app/            Routes (App Router) — thin, delegate to modules
  modules/        Domain features, layered domain/application/infrastructure/ui
  integrations/   Third-party SDK isolation (Notion, and later Stripe, Wise, ...)
  db/             Postgres connection, schema, migrations
  shared/         Cross-cutting foundations: config, errors, logging, security
```

A module or integration folder only exists once it has real code in it —
the tree above is illustrative of the pattern, not a checklist of folders to
pre-create. See
[005-v0-to-v1-evolution](./decisions/005-v0-to-v1-evolution.md).

**Layering rule:** domain and application code never import a third-party
SDK (Notion, Stripe, Wise, Supabase, an AI provider, an email provider)
directly. Provider-specific code lives in `integrations/*` or a module's
`infrastructure/` folder, behind an interface the rest of the codebase
depends on instead.

## Data

PostgreSQL (currently Supabase-hosted, accessed only via a standard
connection string and Drizzle ORM) is the long-term system of record for
application state. Notion is a temporary editorial/review tool for v0.1 and
is never the sole copy of technically important state. See
[002-postgresql-supabase-infrastructure](./decisions/002-postgresql-supabase-infrastructure.md)
and
[003-notion-temporary-adapter](./decisions/003-notion-temporary-adapter.md).
The running application serves only live Notion content (Home and
Documentation) — there is no fixture or placeholder fallback in any
environment, and content is never cached, so Notion edits appear on refresh.
See
[009-live-notion-content-only](./decisions/009-live-notion-content-only.md)
and, for a related Next.js streaming/status-code gotcha this surfaced,
[007-error-boundary-not-found-status](./decisions/007-error-boundary-not-found-status.md).

## Security & configuration

All secrets are server-side, validated at first use through a single typed
schema, and never committed. See
[004-server-side-secrets](./decisions/004-server-side-secrets.md). The
Content-Security-Policy allows `'unsafe-inline'` for scripts rather than
using a nonce — see
[010-nonce-based-csp](./decisions/010-nonce-based-csp.md) for why (a
nonce-based CSP was tried first and found to require dynamic rendering on
every page, breaking static generation site-wide).

## Design tokens

The visual system (grayscale palette, spacing, radius) is derived from a
pixel-level audit of the approved Figma file, implemented as Tailwind theme
tokens in `src/app/globals.css`. One color is intentionally adjusted from
the observed value for WCAG AA contrast, and the font family is a
placeholder pending confirmation. See
[006-design-tokens](./decisions/006-design-tokens.md) and
[visual-open-items](./visual-open-items.md) for the full list of
approximated (not final) values.

## v1 boundaries

v1 is a much larger participant/governance/UGC platform (accounts, teams,
proposals, peer review, quorum, bills, constitution, coefficients). None of
this is implemented in v0.1. Every feature and structural decision is
classified as:

- **A — implement now** (a real v0.1 requirement)
- **B — establish the boundary now** (the seam v1 will need, no more code
  than current requirements justify)
- **C — document only** (named and described so intent isn't lost, not
  built)

See [005-v0-to-v1-evolution](./decisions/005-v0-to-v1-evolution.md) for the
full reasoning and examples.

## Open decisions (not yet settled — do not assume an answer)

These are tracked here rather than as ADRs because they are not yet decided;
an ADR will be written once each is resolved.

- **Analytics provider**: Matomo vs. self-hosted Plausible. Deferred to M4
  by client decision, regardless of implementation readiness; the
  `integrations/analytics/` boundary will be created when this is resolved
  and the feature is actually built. (Note: the Notion documentation content
  itself states self-hosted Plausible is used, while a Contributors-database
  record separately references Matomo access — a real conflict in the
  source material, not yet reconciled. See the Notion export audit.)
- **Multi-currency FX policy** for Treasury normalization (which rate,
  which date/source, how historical amounts are preserved). Must be
  confirmed before full Treasury implementation (M3).
- **Coefficient formulas** (diversity, expertise, alignment, and any
  future coefficients). Not needed until governance work begins; must be
  deterministic, versioned, explainable, and auditable once defined.
- **Governance/voting/quorum rules**, including the "roundabout" workflow's
  exact requirements per team/expertise. v1 concern, intentionally
  undefined today.
- **Treasury publication eligibility rules** beyond "not solely
  `Publication status == Published`" — exact data-quality, sync-state, and
  allowed-public-field criteria need product/business input before M3
  design.
- **Documentation "history" view**: the Figma design includes a version
  history screen (Published/Previous/Initial versions), but neither the
  Notion export nor the public Notion API exposes real page-revision data.
  `/documentation/history` is intentionally not implemented until a real
  data source exists (e.g. a Postgres snapshot taken on each Notion sync) —
  see [003-notion-temporary-adapter](./decisions/003-notion-temporary-adapter.md)
  for the adapter boundary this would extend. Not faked, not stubbed with
  speculative data.
