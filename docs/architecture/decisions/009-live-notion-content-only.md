# 009. The Running Application Uses Live Notion Content Only

## Status

Accepted (supersedes the earlier "production fixture safety" decision, which
kept a development-only fixture fallback).

## Context

The first M1 build shipped a `FixtureDocumentationRepository` and a
hard-coded Home content module so the UI could be built before Notion
credentials existed. Fixtures were selected whenever Notion was unconfigured
(later: only outside production). That is the wrong shape for a public,
transparency-oriented site under client review: a reviewer or visitor could
be shown placeholder text as if it were published material, and "it works on
my machine" depended on which mode the machine was in.

## Decision

- Neither the running application nor its build contains fixture, mock,
  placeholder, demo or hard-coded CMS content. Home and Documentation are read
  from the real Notion API in development, production and test-server runs.
- Missing or invalid configuration (`NOTION_API_KEY`,
  `NOTION_DOCUMENTATION_DB_ID`, `NOTION_HOME_PAGE_ID`) is a clear runtime
  error in every environment. There is no "is Notion configured?" switch.
  Each variable is validated lazily by its own scope in
  `src/shared/config/env.ts`, so a missing one names itself and leaks no
  other value.
- Only unit tests may mock Notion, and only inside test files. A guard test
  (`noRuntimeCmsFixtures.test.ts`) fails if fixture-named files or the old
  fixture/selection identifiers reappear in non-test source.
- Layering is unchanged: Notion API → `integrations/notion` (the only place
  importing the SDK) → mapper → app-owned domain types →
  `HomeRepository` / `DocumentationRepository` → application service → UI.
- Figma owns layout and chrome (wordmark, action labels, spacing); Notion owns
  editorial text (headings, paragraphs, inline links). The Home mapper maps
  Notion blocks onto a fixed structure (tagline, optional section label,
  sections of heading + paragraphs) so arbitrary Notion formatting cannot
  redesign the page. Only headings, paragraphs and links are honoured; any
  other block type is skipped, logged by type, and never crashes a page.
- `https://globalexperiment.org/documentation/<slug>` links in Notion are
  normalised to internal routes; other external links stay external
  (`target=_blank`, `rel=noopener noreferrer`); `mailto:` stays a plain link.

## Caching

All Notion-backed routes (`/`, `/documentation`, `/documentation/[slug]`) use
`export const dynamic = "force-dynamic"`: no Full Route Cache, no Data Cache,
no build-time snapshot, no `revalidate` window. Every request reads Notion, so
an edit in Notion appears on the next refresh with no redeploy. The only
memoisation is React `cache()` within a single request (so `generateMetadata`
and the page share one article read). The cost is one Notion round trip
(several for long pages) per request and Notion's rate limit (~3 req/s); a
short-TTL cache is a reasonable future addition if traffic warrants, at the
price of edits lagging by that TTL.

## Errors

- Unknown slug → real HTTP 404 (`notFound()`), no Suspense/loading boundary on
  these routes so the status is not committed early (see
  [007](./007-error-boundary-not-found-status.md)).
- Notion/infrastructure failure → server error and a neutral error UI
  (`src/app/(public)/error.tsx`); never a fake 404, and no tokens, payloads,
  stack traces or SDK details are shown.

## Alternatives Considered

- **Keep fixtures for development only** — rejected: reviewers cannot tell
  which mode they are seeing, and it keeps a second source of "truth" alive.
- **Build-time static generation from Notion** — rejected: content would need
  a redeploy to change, and it makes CI depend on Notion and secrets.
- **Time-based revalidation (ISR)** — rejected for M1 because the client wants
  edits visible on refresh; also see
  [010](./010-nonce-based-csp.md) for the rendering constraints.

## Future Migration Implications

When Postgres becomes the system of record, only the repository
implementations change; the domain types, application services and UI stay.
Any future integration-backed route should likewise fail loudly rather than
serve stand-in content.
