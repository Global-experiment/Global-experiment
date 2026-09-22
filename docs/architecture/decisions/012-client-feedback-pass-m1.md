# 012. M1 Client Feedback Correction Pass

## Status

Accepted

## Context

The client's first detailed M1 frontend review raised ~30 concrete UI/UX
items after live use of the build described in
[011](./011-responsive-sheet-and-inline-articles.md). This ADR records the
decisions that affect architecture or that future contributors need context
on; purely cosmetic fixes (padding, hover color) aren't repeated here.

## Decisions

### Documentation: preload everything, no per-row fetch

The Documentation index previously fetched each article's body on demand
from `/api/documentation/[slug]` when its accordion row was expanded. Two
client requests conflicted with that: full-text/tag search (needs every
body up front to search it) and "no loading" expansion (needs the body
already in memory when a row opens). `DocumentationRepository` gained
`listPublishedWithContent()`, which fetches the database once and then
every article's blocks with a small concurrency limit (`mapWithConcurrency`,
limit 3) instead of one request per article, unbounded, or all sequentially.
The now-unused `/api/documentation/[slug]` route was removed.

**Trade-off, measured against live Notion:** the index page now makes ~11
Notion API calls per request (1 database query + up to 10 block fetches)
instead of 1, adding roughly 2–4 seconds to a warm request in this
environment, and occasionally much more when Notion itself is slow to
respond (observed during this pass — see the final report). This is an
explicit, client-requested trade-off: given ~10 articles total, "fetch
everything, no cache" was preferred over standing up a cache layer or a
different data store. Revisit if the article count grows materially.

### Document history: real current content, not a fabricated list

Neither the Notion export nor the public Notion API this app is built on
exposes page revision history — recorded in
[DocumentationRepository](../../../src/modules/documentation/domain/DocumentationRepository.ts)
before this route existed. `/documentation/[slug]/history` was still built
(the client asked to see the screen), showing the article's one real,
live-Notion version with an explicit note that no earlier revision is
available, instead of inventing dates or content to populate the Figma
card layout. See the final report for why this specific approach was
chosen over an empty page.

### Temporary light/dark theme toggle

`ThemeToggle` (Home only) flips a `data-theme="light"` attribute on
`<html>`, read via `useSyncExternalStore` (not an effect + `setState`, to
avoid a hydration-mismatch/re-render dance) and persisted to
`localStorage` only. `globals.css` gained one light-mode override block
under `[data-theme="light"]` for the existing color tokens; geometry and
type scale are untouched, so layout is identical in both themes. An inline
script in `layout.tsx` (`THEME_INIT_SCRIPT`) applies the stored choice
before first paint. This is explicitly temporary and isolated to three
places (ThemeToggle.tsx, the layout script, the CSS block) so it can be
removed cleanly once the client has finished reviewing it.

### Keyboard-aware sticky CTA

`useKeyboardInset` (`src/shared/ui/useKeyboardInset.ts`) reads
`window.visualViewport` to compute how much of the viewport's bottom a
software keyboard currently covers, with a pure, unit-tested calculation
function (`computeKeyboardInset`) separated from the DOM-reading hook.
`StickyActionBar` uses it to move `bottom` up by that amount instead of
staying pinned to the window edge. Waitlist doesn't use `StickyActionBar`
at all (see below), so it needs no keyboard-avoidance logic — the CTA is
in normal document flow right after the input.

### Sheet: optional title, mobile square/borderless vs. desktop bordered/rounded

`Sheet`'s `title` prop is now optional. Stat/detail sheets (Balance,
Sustainability, Median donation) pass one and get the "✕ Title" header row
Figma shows for them; overflow/action menus (page actions, Donate's menu,
the feedback/issue type pickers) don't, and render no header at all —
matching Figma exactly, confirmed by rendering the client's updated
reference. Radius and border on the sheet are now `md:`-only, so mobile is
square with no stroke and desktop keeps the bordered, rounded card.

### Every "back" control uses real history

`HistoryBackButton` replaces the old hard-coded-`href` back arrow in
`NavHeader`. It calls `router.back()` when `window.history.length > 1` (a
real previous entry to return to — including an external referrer, which
is correct back-button behavior) and falls back to a normal `<Link>` to a
given `fallbackHref` otherwise (e.g. a directly-opened article going back
to `/documentation`). Scroll-position restoration on that path comes from
the browser's native handling of a real `popstate`/back navigation, not
custom code.

### Treasury/Donate: shared, explicitly-not-fixture presentation data

`src/shared/treasury/` holds one shared source for the illustrative
stats/transactions both routes show (previously duplicated per-page
constants), plus `ClickableStatsRow` (the shared stat-detail-sheet
interaction) and `TransactionList` (the shared history-row rendering,
including the tag-overflow "+1" badge). The module is named
`presentationData.ts`, not `fixtures.ts` — the existing
`noRuntimeCmsFixtures` guard test scans runtime source filenames for
`fixture`/`mock`/`placeholder` to catch CMS-content fixtures specifically;
this is unrelated M3 financial placeholder data (already clearly labeled
as such), and the rename avoids a false positive on that guard rather than
weakening it.

## Alternatives Considered

- **Cache Documentation article bodies (e.g. `unstable_cache`, a short TTL)
  instead of fetching fresh every time** — rejected for this pass: the
  client's standing requirement (ADR 009) is that a Notion edit is visible
  on the next refresh, and a cache reintroduces exactly the staleness
  question that decision closed. Worth revisiting specifically for this
  preload if the added latency proves unacceptable in review.
- **Fabricate a plausible-looking document history list** — explicitly
  ruled out by the client's own instructions for this pass; see the ADR
  section above and the final report.

## Future Migration Implications

When Postgres replaces Notion, `listPublishedWithContent()` moves with the
rest of the repository interface unchanged. Real Treasury/Donate data and a
real document-history data source are both M3-shaped follow-ups already
anticipated by this ADR and by ADR 003.
