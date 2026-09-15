# 007. Streaming Suspense Boundaries Break notFound()'s HTTP Status

## Status

Accepted

## Context

While verifying the Documentation feature's 404 behavior against a
production build (`next start`, the self-hosted mode this project will
actually run in on Hetzner), a request to a nonexistent article slug
returned HTTP 200 instead of 404, even though the correct not-found content
rendered in the response body. This was root-caused by direct, isolated
testing (not assumed from documentation), narrowing it down through several
minimal reproductions:

1. A bare route calling `notFound()` with no sibling `loading.tsx` or
   `error.tsx` → correctly returns 404.
2. Adding a route-segment `error.tsx` → breaks it (200), because
   `notFound()` is implemented as a thrown error with a special digest
   (`NEXT_HTTP_ERROR_FALLBACK;404`), and an `error.tsx` boundary intercepts
   that like any other error unless it explicitly re-throws it.
3. Fixing (2) by re-throwing on digest match restores 404 — **but only
   when there is no `loading.tsx` on the same segment.**
4. Adding a route-segment `loading.tsx` back breaks it again (200), **even
   with the error.tsx fix applied.** This is the deeper cause: `loading.tsx`
   wraps the segment in a React Suspense boundary, which makes Next.js
   stream the response — the initial HTTP response (status + shell HTML) is
   flushed to the client before the suspended async page resolves. Once
   that 200 status is flushed, it cannot be changed to 404 no matter what
   the page later throws.

Since `documentation/loading.tsx` (a single file at the parent segment)
wrapped both `/documentation` (index, never 404s) and
`/documentation/[slug]` (article, can 404), the article route inherited a
streaming boundary it never needed and lost its ability to report 404
correctly.

## Decision

- Every route segment's `error.tsx` re-throws when `error.digest ===
  "NEXT_HTTP_ERROR_FALLBACK;404"`, via a shared
  `rethrowNotFoundInErrorBoundary()` helper in `src/shared/ui/`.
- No route segment that can call `notFound()` may have a `loading.tsx`
  (or any ancestor Suspense boundary) wrapping it. Concretely: the
  Documentation index page wraps only its own async list-fetching component
  in an explicit `<Suspense>` (since the index never 404s, streaming it is
  safe); the `[slug]` article page has no Suspense boundary at all and
  fetches synchronously within the page's own async function, so its
  eventual `notFound()` is decided before any response bytes are sent.

## Why Chosen

- This is exactly the kind of gotcha that silently breaks 404 semantics for
  crawlers, monitoring, and any client relying on HTTP status — worth
  fixing at the root and recording, not working around per-route.
- Scoping the Suspense boundary to only the sub-tree that's actually safe to
  stream (can't 404) is a general, reusable pattern for any future dynamic
  route that can call `notFound()`.

## Alternatives Considered

- **Accept HTTP 200 for not-found pages** — rejected: this is a public,
  transparency-oriented site; wrong status codes affect SEO, uptime
  monitoring, and any tooling that checks status rather than parsing HTML.
- **Remove error.tsx/loading.tsx entirely** — rejected: loses genuinely
  useful UX (a friendly message for provider errors, a loading skeleton for
  the index) for a problem that has a targeted fix.

## Trade-offs

- The `[slug]` article page shows no loading skeleton while its Notion
  fetch resolves — acceptable given a single article fetch is fast,
  especially once the 5-minute revalidation cache is warm; a real
  regression if that fetch ever becomes slow, worth revisiting then.
- Every future dynamic route that can 404 (none exist yet beyond
  Documentation) must apply the same two rules — mitigated by this ADR and
  the shared helper being the canonical reference.

## Future Migration Implications

None specific to Notion/v1 — this is a general Next.js App Router streaming
behavior that applies regardless of what backs a given route's data.
