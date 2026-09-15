# 008. Navigation Scaffolds vs. Feature Completion

## Status

Accepted

## Context

The client needs to navigate the full Home information architecture during
visual review — every button Figma shows as a destination should actually
go somewhere — without that being mistaken for M2/M3 backend features
(Waitlist persistence, Donations via Stripe, Treasury sync, Feedback/Issue
processing) being implemented early.

## Decision

Two distinct, clearly labeled concepts, referenced by this ADR number in
code comments wherever they apply:

- **M1 navigation scaffold**: the route exists, is reachable via a real
  `<Link>`, and renders the real Figma visual layout using the existing
  design system. No disabled buttons are used for navigation.
- **Later milestone implementation**: the actual business action —
  persistence, external API calls, payment processing, email, AI
  processing — which these scaffolds explicitly do not perform.

Concretely, for each route shell (`/waitlist`, `/donate`, `/treasury`,
`/feedback`, `/issue`):
- Navigation into and out of the page is real (`Link`, back buttons).
- Form inputs and selection controls (amount, frequency, feedback/issue
  type, message text) are real, working UI state — because that's just
  local component state, not a backend feature.
- The final submit/pay action is a real, enabled button (not disabled —
  disabled is reserved for navigation that genuinely doesn't exist yet,
  which no longer applies to any Home destination) that shows
  `InertActionNotice` on click instead of performing or faking the action.
  It never navigates to a fake success page.

`/contribute` is the one exception: per the Figma/IA audit, it only needs a
`mailto:` link and a client-side copy-to-clipboard button, neither of which
depends on the later AI/email-ingestion backend — so it's genuinely
functional now, not a scaffold.

## Why Chosen

- Matches the client's explicit distinction: "M1 navigation scaffold: route
  exists and can be reviewed visually" vs. "later milestone implementation:
  actual business action."
- A real, enabled button that clearly declines the action (via
  `InertActionNotice`) is more honest than either faking success or
  disabling a control the design shows as available.

## Alternatives Considered

- **Disable all shell-page submit buttons** — rejected: the client
  explicitly distinguished disabled-for-navigation (not allowed) from
  disabled-for-an-unimplemented-action; a disabled submit button on a page
  otherwise built for "visual review" also makes the primary visual element
  (the button style itself) harder to actually review.
- **Fake a success screen on submit** — explicitly rejected by the client
  ("do not fake successful data submission").

## Trade-offs

- Placeholder numeric content (Treasury/Donate stats) is illustrative, not
  live — matches how the Figma source itself presents these figures (the
  Documentation content explicitly states design-material values are
  examples), but must not be mistaken for real data during review.
- Feedback/Issue are implemented as one page each (type list + composer)
  rather than Figma's two-step bottom-sheet-then-page flow, since building
  the intermediate step adds real complexity for a flow with no backend
  yet to justify it — revisit when M2 builds the real submission pipeline.

## Future Migration Implications

When each milestone builds the real backend (M2: Waitlist/Feedback/Issue;
M3: Donate/Treasury), the visual shell built here is the starting point —
replace `InertActionNotice`-triggering handlers with real submission logic
calling the (then-existing) application layer, without needing to rebuild
the layout.
