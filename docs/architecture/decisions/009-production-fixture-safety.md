# 009. Documentation Must Fail Loudly in Production Without Notion

## Status

Accepted

## Context

`FixtureDocumentationRepository` exists so the Documentation feature can be
built and browsed before live Notion credentials are configured.
`getDocumentationRepository()` originally chose it whenever
`isNotionConfigured()` was false, regardless of environment — meaning a
misconfigured production deployment (missing `NOTION_API_KEY` or
`NOTION_DOCUMENTATION_DB_ID`) would silently serve placeholder content to
real visitors instead of failing visibly.

Fixing this surfaced a second, related bug: the Documentation index route
was statically prerendered at `next build` time. Building without Notion
credentials configured (the normal case in most CI/build environments,
where secrets are injected at deploy/runtime rather than build time) would
have baked whatever the repository returned *at build time* into a static
page served for up to a year — silently locking in either fixture data or
a build failure, neither of which is the intended runtime behavior. See
[007](./007-error-boundary-not-found-status.md) for the related streaming
fix this required.

## Decision

`getDocumentationRepository()` throws an `InternalError` when Notion isn't
configured and `NODE_ENV === "production"`, instead of falling back to
`FixtureDocumentationRepository`. Both Documentation routes render with
`export const dynamic = "force-dynamic"` so this check runs per-request at
runtime, not once at build time.

## Why Chosen

- A public, transparency-oriented site showing placeholder content as if
  it were real published material is a worse failure mode than a visible
  error — visible failures get fixed; silent ones don't.
- Deciding this at request time (not build time) matches how production
  secrets actually reach this app in the target deployment (Hetzner,
  environment variables injected into a running container) — the build
  artifact itself shouldn't need secrets to exist.

## Alternatives Considered

- **Warn but still serve fixtures in production** — rejected: a warning
  nobody is watching for is equivalent to no warning; the client explicitly
  asked for this to fail clearly.
- **Statically generate the index at build time with `generateStaticParams`
  fed from build-time Notion access** — rejected for now: adds a hard
  build-time dependency on Notion being reachable at build/CI time, which
  isn't guaranteed and isn't how this project's secrets are provisioned;
  revisit if build-time SSG becomes desirable for performance later.

## Trade-offs

- The Documentation index and article pages are never statically cached by
  Next's Full Route Cache; every request re-runs the page function. Given
  content volume (≤10 articles) and update frequency (manual publishing),
  this is an acceptable cost for M1 — a fetch-level cache (e.g.
  `unstable_cache` around the repository call) is a reasonable future
  addition if request volume ever makes it worth it.

## Future Migration Implications

This pattern — fail loudly in production when a required integration
isn't configured, decided at request time — should be the default for any
future integration-backed route (Treasury, Waitlist, etc.) once they're
built, not just Documentation.
