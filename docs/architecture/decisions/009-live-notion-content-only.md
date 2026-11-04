# 009. The Running Application Uses Live Notion Content Only

## Status

Amended 2026-11-04 (Delivery 6, ADR 020): Home and Documentation are native.
The rule stays — the running website shows only real, published content,
never a fixture or a fallback copy — but its source is now the native API's
published revisions, not Notion. See "Amendment (2026-11-04)" below.

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

## Amendment (2026-11-04): native content, no Notion at run time

- Home and Documentation are read from the native API (`/api/cms`): the
  published revision of each page (ADR 020). The website no longer calls
  Notion; the Notion client, its settings (`NOTION_API_KEY`,
  `NOTION_HOME_PAGE_ID`, `NOTION_DOCUMENTATION_DB_ID`) and the local
  "Notion isn't connected" notice described below are removed.
- Still no fixture in the running application: when the API can't answer,
  the page fails with an error status (ADR 007). A guard test scans the
  website's source for fixture repositories and for any Notion runtime.
- Sample pages exist for tests and local setup only (the API's
  `testing/fixtures`, never built, never loaded into production).
- Caching: the pages' API requests are cached under the `home` and
  `documentation` tags and revalidated on every publication, with a
  5-minute fallback. The Caching section below describes the Notion era.

## Amendment (2026-11-03): contributors without Notion (superseded 2026-11-04)

Contributors work locally without any production secret (Delivery 5a,
client decision of 2026-11-03). On their machine, when the Notion values
are missing and `NODE_ENV` isn't `production`, Home and Documentation (and
an article and its history) render a plain "Notion isn't connected in this
local setup" notice (`notionMissingLocally` in `src/shared/config/env.ts`,
`src/shared/ui/NotionNotConnected.tsx`) instead of the error page.

- It shows **no content**: no stand-in text, no fixture repository. The
  rest of this decision is unchanged, and the guard test still forbids
  fixture/mock repositories and checks that the notice can't appear in
  production.
- In production (`NODE_ENV=production`, which includes `next start`), a
  missing value is still a loud error.
- A contributor who has Notion read access adds the three values to
  `.env.local` and sees the real pages.

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
