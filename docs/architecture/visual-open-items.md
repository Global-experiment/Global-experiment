# Visual Open Items

What in the current implementation is still an approximation rather than a
value confirmed against the client's design. Everything else — gutters,
column width, control heights, type scale, borders, radius, icon glyphs —
was measured from the vector `figma.pdf` export; see
[design-fidelity.md](./design-fidelity.md) for the measurement log.

## Font family — unresolved

The PDF export anonymises embedded fonts as unnamed glyph sets, so the
family cannot be read from it. Glyph shapes are consistent with Inter.
The app uses a generic system stack (`ui-sans-serif, system-ui, …`),
isolated to one CSS variable (`--font-sans` in `src/app/globals.css`); once
the client confirms the family it is a one-line change. Until then line
breaks differ slightly from the frames and rendering varies by OS.

## Corner radius — measured visually

Rules and text are exact; the ≈4px control radius was read from a 12×
raster of a button corner, not from vector geometry. If the client's Figma
token differs by a pixel, `--radius-control` is the single place to change.

## Payment marks — assets needed

The Donate payment rows show Visa/Mastercard/Amex, Apple Pay, Google Pay and
PayPal marks that are not Material icons. See the asset list in
[design-fidelity.md](./design-fidelity.md#assets-still-needed-from-the-client).

**Resolved since the first M1 pass:** icons (now exact Material glyphs),
spacing scale, control heights, border colours, muted text colour.
