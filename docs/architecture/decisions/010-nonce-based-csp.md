# 010. CSP: unsafe-inline for Scripts, Not Nonces (After Trying Nonces First)

## Status

Accepted

## Context

The static CSP originally set in `next.config.ts` (`script-src 'self'`,
no `unsafe-inline`/nonce) was found — by direct browser testing, not
assumption — to block Next.js's own inline bootstrap/RSC-streaming
scripts, which broke client-side hydration **site-wide**: every route
showed CSP violations and a Next.js internal invariant failure, and no
client component (e.g. the Documentation accordion) responded to clicks.
`curl`-based verification, used earlier in the project, cannot catch this
class of bug since it never executes JavaScript or evaluates CSP.

The first fix attempted was Next.js's documented nonce-based CSP pattern:
a `proxy.ts` (Next 16's renamed `middleware.ts`) generating a fresh nonce
per request and setting it in the CSP header, which Next.js then
automatically stamps onto its own inline/bootstrap scripts. This fixed
hydration in development. In a **production build**, it did not: Home and
the route shells are statically generated (`○` in the build output), and
Next's own CSP guide explains why that's fundamentally incompatible with
nonces — *"Static pages are generated at build time, when no request or
response headers exist—so no nonce can be injected."* A static page's
script tags are baked in at build time with no nonce; the proxy's
freshly-generated per-request nonce can never match them. Next's docs
confirm this isn't a configuration mistake to fix: *"When you use nonces
in your CSP, all pages must be dynamically rendered... Static optimization
and Incremental Static Regeneration (ISR) are disabled... Higher hosting
costs."*

## Decision

Do not use nonces. Instead, use Next.js's own documented "Without Nonces"
approach: a static CSP with `script-src 'self' 'unsafe-inline'` (plus
`'unsafe-eval'` in development only, for React's debugging features),
applied via `next.config.ts` — restoring static generation for every page
that doesn't otherwise need to be dynamic (Waitlist, Contribute,
Donate, Treasury, Feedback, Issue remain statically generated; Home and
Documentation are dynamic for the unrelated reason in
[009](./009-live-notion-content-only.md)).

This is deliberately re-evaluated against this codebase's actual risk: it
has **zero** uses of `dangerouslySetInnerHTML` (verified by search), so
there is no code path today that could render attacker-controlled markup
as executable script — the exact class of attack a strict `script-src`
without `unsafe-inline` defends against. `unsafe-inline` is a real,
accepted weakening, not a non-issue, but it isn't presently protecting
against a reachable attack in this codebase.

## Why Chosen

- Matches Next.js's own recommended default for applications that don't
  have "strict security requirements that prohibit `unsafe-inline`" — this
  is not an improvised workaround.
- Forcing 100% of pages into dynamic rendering to get nonce-strict script
  loading would mean no static generation, no ISR, and higher hosting cost
  for what is, in M1, mostly static informational content — directly at
  odds with this project's stated low-operating-cost, avoid-unnecessary-
  complexity principles, for a security property that isn't currently
  protecting against a real, reachable vulnerability in this codebase.

## Alternatives Considered

- **Nonce-based CSP (tried first)** — reverted: requires force-dynamic
  rendering everywhere, confirmed incompatible with static generation by
  both official documentation and a failing production build.
- **Experimental Subresource Integrity (SRI)** — Next.js offers this as a
  hash-based alternative that preserves static generation. Not adopted:
  it's explicitly experimental/App-Router-only per Next's docs, and adds
  ongoing complexity (build-time hash generation) disproportionate to a
  risk this codebase doesn't currently have a reachable path to. Worth
  revisiting if that changes.
- **Hash-based CSP with hardcoded hashes** — rejected: Next's own inline
  script content isn't guaranteed stable across builds, making hardcoded
  hashes fragile in a way that would silently break the site on a Next.js
  or dependency upgrade.

## Trade-offs

- `unsafe-inline` for scripts is a real reduction in XSS defense-in-depth.
  **If this codebase ever adds `dangerouslySetInnerHTML`, renders raw HTML
  from Notion or any other content source, or takes on participant-
  generated content (v1), this decision must be revisited before that
  ships** — re-evaluate nonces (accepting the dynamic-rendering cost) or
  SRI at that point.
- Development still needs `'unsafe-eval'` for React's debugging features
  (confirmed via the browser's own console message); production does not
  and doesn't get it.

## Future Migration Implications

Re-evaluate this ADR specifically when: (a) any HTML-rendering sink is
added (`dangerouslySetInnerHTML`, an HTML-rendering markdown/rich-text
library, etc.), or (b) v1 introduces participant-authored content rendered
as HTML. Until then, the static-generation-compatible CSP is the correct
trade-off for this project's actual surface.
