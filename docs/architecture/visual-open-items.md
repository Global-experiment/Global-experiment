# Visual Open Items

What in the current implementation is still an approximation, or is waiting
on a client reference that isn't available locally yet. Everything else —
gutters, column width, control heights, type scale, borders, radius, icon
glyphs — was measured from the vector Figma exports; see
[design-fidelity.md](./design-fidelity.md) for the measurement log.

## Waiting on a newer Figma reference

Two items from the client's first feedback pass named an "updated Figma"
that isn't present in either locally available export (`figma.pdf`, the
original audit, and `design.pdf`, supplied with that feedback — confirmed
by pixel-diffing every page of both):

- **Home action buttons** ("New buttons homepage (see Figma)") — Home is
  pixel-identical between the two exports. Unchanged pending the reference.
- **Donate Once/Monthly control** ("the big toggle... doesn't have the
  right feel") — Donate is also pixel-identical between the two exports.
  Replaced with a smaller, compact version of the same control as an
  interim improvement, not a confirmed final design.

Do not treat either as final until a newer export or reference arrives.

## Font family — unresolved

Both PDF exports anonymise embedded fonts as unnamed glyph sets, so the
family cannot be read from either. Glyph shapes are consistent with Inter.
The app uses a generic system stack (`ui-sans-serif, system-ui, …`),
isolated to one CSS variable (`--font-sans` in `src/app/globals.css`); once
the client confirms the family it is a one-line change.

## Corner radius — measured visually

The ≈4px control radius was read from a raster zoom of a button corner, not
from vector geometry. If the client's Figma token differs by a pixel,
`--radius-control` is the single place to change.

## Document history — no real data source

Neither the Notion export nor the public Notion API exposes page revision
history. `/documentation/[slug]/history` shows the article's one real,
live version with an explicit note instead of fabricated past versions —
see [ADR 012](./decisions/012-client-feedback-pass-m1.md) and the
client-feedback-pass report for the reasoning.

## Document-history entry point — assumption, not confirmed

No sheet or menu row reading "Document history" was visible in the Figma
export's overflow menus, only the destination screen itself (p17). It's
reachable from the article's own page-actions menu with a `history` Material
icon as the most plausible entry point; confirm against a fuller Figma
reference if one becomes available.

## Payment brand marks — resolved

All six client-supplied SVGs (Visa, Mastercard, Amex, Apple Pay, Google Pay,
PayPal) are wired in. The payment-button visual design itself is being
benchmarked/updated by the client separately and was left alone this pass.

**Resolved since the first M1 pass:** icons (Material Sharp, including new
glyphs for checkboxes, document history, and the temporary theme toggle),
spacing scale, control heights, border colours, muted text colour, button
padding, hover treatment (stroke only, no background change), full-bleed
separators, optional sheet headers, mobile vs. desktop sheet styling, real
history-based back navigation, keyboard-aware sticky CTA, all six payment
marks.
