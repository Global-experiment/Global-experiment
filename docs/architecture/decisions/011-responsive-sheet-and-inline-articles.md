# 011. Responsive Sheet/Dialog Primitive and On-Demand Article Bodies

## Status

Accepted

## Context

The Figma v0.1 design (figma.pdf) establishes two presentation patterns
that recur across pages:

1. Secondary content opens as a **bottom sheet on mobile** (Treasury
   details p3–p6, Documentation page actions p16, Feedback/Issue type
   pickers p23/p27) and as a **centered dialog over the underlying page on
   desktop** (Treasury p34). It is the same content in both cases.
2. The **Documentation index expands an article in place** (p15): the row
   opens to show metadata, tags, the full body and the feedback/issue
   actions, with the remaining rows continuing below.

The first M1 pass rendered the index accordion with metadata and a "Read
full article" link only, to avoid fetching ten article bodies from Notion
on every index request.

## Decision

- A single `Sheet` primitive (`src/shared/ui/Sheet.tsx`) built on the
  native `<dialog>` element implements the pattern: fixed to the bottom
  with a drag handle and rounded top below the `md` breakpoint, a 400px
  centered dialog with a 1px border above it. `PageActionsMenu` composes
  it for the `more_vert` overflow control. Native `showModal()` provides
  focus trapping, Escape handling, an inert background and the dialog
  role without a dependency.
- The Documentation index expands articles inline as designed. Bodies are
  loaded **on demand** through `GET /api/documentation/[slug]`, which
  calls the same `getArticleBySlug` application service as the article
  route (live Notion, `Cache-Control: no-store`, `force-dynamic`). The index
  request itself still fetches only the ten summaries. The article route
  `/documentation/[slug]` remains the permanent page and is linked from the
  expanded row's "Published" label and its share control.
- The endpoint returns the application-owned article shape only, answers
  404 for unknown or malformed slugs and 500 for provider failures, and
  never includes an error message, payload, stack or SDK detail.

## Why Chosen

- The client's acceptance criterion is fidelity to figma.pdf, including
  the expanded-row layout; a link-out accordion was a visible deviation.
- Lazy loading keeps the index at one Notion query per request and stays
  inside Notion's rate limit even when a visitor opens several rows.
- Reusing the application service keeps the Notion → mapper → repository
  → application → UI boundary intact; the route handler is a thin
  transport adapter, exactly like the page.

## Alternatives Considered

- **Fetch all bodies server-side on the index** — rejected: ten extra
  block-tree reads per request, slow first paint, needless rate-limit
  pressure.
- **Server Action instead of a route handler** — rejected for now: the GET
  handler is directly testable with a browser or `curl`, and the payload
  is a plain read.
- **A third-party dialog/sheet library** — rejected: the native element
  covers the accessibility requirements and adds no bundle weight.

## Trade-offs

- Expanded bodies are not part of the server-rendered index HTML (they are
  not indexed from the index page; the article routes are).
- A short "Loading…" state exists on expansion; a failed load shows an
  inline retry rather than the page error boundary.

## Future Migration Implications

Treasury detail dialogs, the feedback/issue submission flows and any later
overlay reuse `Sheet` unchanged. When Postgres replaces Notion, only the
repository behind `getArticleBySlug` changes; the endpoint and UI do not.
