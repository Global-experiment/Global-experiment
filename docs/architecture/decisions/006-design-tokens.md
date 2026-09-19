# 006. Design Tokens: Grayscale Palette and Accessibility Adjustment

## Status

Accepted — amended 2026-09-19: values re-measured from the vector
`figma.pdf` export. Muted text is now the measured `#b1b1b1` (10.4:1 on
black, so the earlier `#949494` accessibility adjustment is no longer
needed); borders are the measured `#484848`; the control radius is 4px and
the type scale is 14/18 body, 16/20 lead, 12/14 meta. The full measurement
log is in [design-fidelity.md](../design-fidelity.md). The typeface remains
unconfirmed.

## Context

A design audit of the approved Figma v0.1 file (pixel-sampled colors, not
estimated) found a strict black-background, grayscale-only palette with no
brand/accent color and no color-coded status anywhere in the interface. Two
of the observed grays measure below WCAG 2.2 AA contrast against the pure
black background when computed precisely:

- `#737373` ≈ 4.43:1 (just under the 4.5:1 AA threshold for normal text)
- `#5a5a5a` ≈ 3.04:1 (fails AA for normal text)

The font family used in the Figma file could not be recovered from the
available export (PDF export anonymizes embedded fonts) and remains
unconfirmed.

## Decision

Implement the palette as Tailwind v4 theme tokens in `src/app/globals.css`:
`surface-base` (#000000), `text-primary` (#ffffff), `text-secondary`
(#e7e7e7), `text-tertiary` (#b2b2b2) — all as observed — and `text-muted`
adjusted to **#949494** (~6.9:1) instead of the observed #737373, for any
token used on readable body-sized text. Border tokens (`border-subtle`,
`border-faint`) keep the observed darker values since WCAG contrast
requirements don't apply to non-text decorative borders/dividers.

`font-sans` is set to a generic system-font stack (`ui-sans-serif,
system-ui, ...`), not a specific typeface, isolated behind this single CSS
variable so the real font can be swapped in with a one-line change once
confirmed.

## Why Chosen

- The client's instruction was explicit: match the audited visual system,
  but improve contrast where needed for WCAG 2.2 AA without introducing a
  new visual language. A single adjusted gray for muted/tertiary text
  satisfies both constraints — it's visually indistinguishable in intent
  (still "the muted gray") while being measurably compliant.
- Isolating the font behind one variable avoids scattering a placeholder
  font choice through component code, so the real typeface (once confirmed)
  is a single-line change with no component-level rework.

## Alternatives Considered

- **Keep the exact observed #737373** — rejected: fails AA by a small but
  real margin for any body-sized usage (list-item descriptions, timestamps).
- **Introduce a font now (e.g. a popular open-source sans-serif) as a
  stand-in** — rejected: risks looking like a deliberate design decision
  rather than a placeholder, and creates a real dependency (font loading,
  licensing) for a value that's still explicitly unconfirmed.

## Trade-offs

- `text-muted` no longer pixel-matches the Figma source exactly; this is an
  intentional, documented deviation for accessibility, not an oversight.
- The system-font fallback stack renders differently across operating
  systems (a real trade-off during the interim period), which is preferable
  to guessing a specific brand typeface.

## Future Migration Implications

When the real font family and any exact color corrections are confirmed
(via Figma API/token access), both changes are contained to
`src/app/globals.css`'s `@theme` block — no component code references raw
hex values or font names directly.
