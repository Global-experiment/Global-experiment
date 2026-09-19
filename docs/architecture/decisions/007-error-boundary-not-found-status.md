# 007. Streaming Suspense Boundaries Break Response Status Codes

## Status

Accepted

## Context

While verifying the Documentation feature's behavior against a production
build (`next start`, the self-hosted mode this project will actually run
in on Hetzner), two related bugs were found by direct, isolated testing
(not assumed from documentation):

1. A request to a nonexistent article slug (`/documentation/[slug]`)
   returned HTTP 200 instead of 404, even though the correct not-found
   content rendered in the response body.
2. After making the runtime Notion-only (the repository throws if
   Notion isn't configured — see
   [009-live-notion-content-only](./009-live-notion-content-only.md)),
   the Documentation index returned HTTP 200 with the generic error UI
   instead of a real error status, even though the thrown error was
   correctly logged server-side.

Both trace to the same root cause, isolated through minimal reproductions:

- `notFound()` is implemented as a thrown error with a special digest
  (`NEXT_HTTP_ERROR_FALLBACK;404`); a route segment's `error.tsx` boundary
  intercepts that like any other error unless it explicitly re-throws it
  (fixed separately, see Decision).
- More fundamentally: **any Suspense boundary** on a segment — from a
  `loading.tsx` file, or an explicit `<Suspense>` wrapping an async
  Server Component — makes Next.js stream the response. The initial HTTP
  response (status + shell HTML) is flushed to the client before the
  suspended async work resolves. Once that status is flushed, it cannot
  be changed no matter what the suspended component later throws —
  whether that's `notFound()`'s special error or an ordinary one.

This was found twice: first with a shared `documentation/loading.tsx`
wrapping both the index and `[slug]` (breaking `[slug]`'s 404s), and again
after "fixing" that by giving the index page its own local `<Suspense>`
for a loading skeleton (which then broke the index's own error
status for a Notion/config failure the same way).

## Decision

- Every route segment's `error.tsx` re-throws when `error.digest ===
  "NEXT_HTTP_ERROR_FALLBACK;404"`, via a shared
  `rethrowNotFoundInErrorBoundary()` helper in `src/shared/ui/`.
- **No route whose data-fetch can produce a non-200 outcome (a 404 via
  `notFound()`, or a thrown error) may have any Suspense boundary —
  `loading.tsx` or an explicit `<Suspense>` — wrapping that fetch.**
  Concretely, both Documentation routes fetch synchronously within the
  page's own async function with no Suspense boundary at all, so their
  eventual status is decided before any response bytes are sent. Neither
  page currently has a loading skeleton as a result.

## Why Chosen

- This silently breaks correctness for crawlers, uptime monitoring, and
  any tooling that checks HTTP status rather than parsing HTML — worth
  fixing at the root and recording as a general rule, not working around
  per-route.
- The rule ("no Suspense on a route that can produce a non-200 status") is
  simple enough to apply consistently to future routes without
  re-discovering the underlying streaming behavior each time.

## Alternatives Considered

- **Accept the wrong status code** — rejected: this is a public,
  transparency-oriented site; status-code correctness is a real
  requirement, not a nice-to-have.
- **Keep a loading skeleton via Suspense and accept the status-code loss
  for the index specifically** (reasoned initially, since the index can't
  404) — rejected once the Notion-only runtime gave the index page a
  real way to error too. Generalizing the rule to "no Suspense on any
  route that can produce a non-200 status" avoids re-litigating this per
  future route.
- **Remove error.tsx entirely** — rejected: loses a genuinely useful
  friendly message for provider errors, for a problem that has a targeted
  fix.

## Trade-offs

- Neither Documentation route shows a loading skeleton while its Notion
  fetch resolves — acceptable given both fetches are small (≤10 articles,
  or one article's blocks), especially once caught by any future
  fetch-level caching; a real regression if that fetch ever becomes slow,
  worth revisiting then (e.g. with a skeleton rendered client-side after
  the initial correct-status response, rather than via server Suspense).
- Every future route that can 404 or error must apply the same rule —
  mitigated by this ADR and the shared helper being the canonical
  reference.

## Future Migration Implications

None specific to Notion/v1 — this is a general Next.js App Router
streaming behavior that applies regardless of what backs a given route's
data.
