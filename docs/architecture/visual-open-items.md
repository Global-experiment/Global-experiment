# Visual Open Items — Not Final

This tracks every value in the current implementation that is an
**approximation**, not a confirmed Figma value. None of these should be
treated as final. They exist because the only available Figma source
during M1 was a PDF export (see the design audit), which loses information
a live Figma file or token export would preserve.

## Font family — unresolved

The real typeface used in Figma cannot be recovered: PDF export
anonymizes embedded fonts as unnamed glyph sets with no family metadata.
Currently using a generic system-font stack (`ui-sans-serif, system-ui,
-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`), isolated
to one CSS variable (`--font-sans` in `src/app/globals.css`) so the real
font is a one-line change once confirmed — no component touches a font
name directly.

## Icons — approximated, not extracted

`src/shared/ui/icons.tsx` (Waitlist, Contribute, Donate, Treasury) are
semantic placeholder line icons, not the real Figma glyphs — vector icon
artwork isn't recoverable from a PDF export. Same for the back-arrow,
search, and chevron icons used throughout. Replacing these requires either
real Figma API/asset access or exported SVGs from the client.

## Spacing / radius — measured where possible, estimated otherwise

- Colors are exact (pixel-sampled from the PDF render, not estimated) —
  see `docs/architecture/decisions/006-design-tokens.md`.
- The 8px spacing scale and `0.5rem` (8px) control radius are consistent,
  reasonable estimates based on visual proportion, not measured from
  vector data (PDF text/image export doesn't expose exact corner-radius or
  padding values, only rendered pixels).
- Button height, exact horizontal margins, and inter-section vertical
  rhythm are built to be visually close and internally consistent (same
  token scale everywhere), not pixel-matched to source coordinates.

## What would resolve these

Live Figma access (API token + file) would give exact font family, type
scale, spacing, and radius values, plus real icon/asset exports — see the
original design audit for what was already extracted from the PDF
(colors, measured line-heights, layout structure) versus what requires
live access (everything in this document).

**Do not treat any value listed here as final until confirmed against a
live Figma source.**
