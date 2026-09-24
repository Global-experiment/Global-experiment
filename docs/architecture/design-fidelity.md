# Design Fidelity — Measurement Log

The client's design reference is a vector PDF export of the Figma v0.1 file.
Two exports exist locally (both git-ignored): `figma.pdf`, the original
audit, and `design.pdf`, supplied with the client's first detailed M1
frontend review. Rendering every page of both and diffing them pixel-by-
pixel found real content changes on only 2 of 39 pages — Waitlist
(pages 19–20, the CTA moved from fixed-to-viewport-bottom to directly under
the email field) — plus cosmetic re-export noise on the Documentation pages
(15/17) with no visible difference. Everywhere else, including Home and
Donate, the two exports are pixel-identical; see the client-feedback-pass
report for what that means for items that referenced "the updated Figma."

Because the PDF is vector, exact values can be read from it rather than
estimated: text runs carry their font size and position, and rules/borders
can be pixel-scanned at high zoom. This document records what was measured,
how it maps to the code, and the differences that remain on purpose.

Frames: mobile pages are 412pt wide, desktop pages 1440pt; 1pt = 1 CSS px.
Everything below the browser chrome (which ends at y=103 on every page) is
application UI. Status bar, URL bar, keyboard and home indicator are
environmental and are not reproduced.

## Layout

| Measure | PDF | Token / class |
| --- | --- | --- |
| Page gutter (mobile) | 8px (text x=8, borders x=8) | `--spacing-gutter`, `px-gutter` |
| Content column (desktop) | 640px (x=400…1040 on 1440) | `--container-page` = 656px incl. gutters, `max-w-page` |
| Header row | 44px, title 14px bold, no rule | `NavHeader` (`h-11`) |
| Back glyph / title offset | glyph at x≈10, title at x=32 | `HistoryBackButton -mx-gutter` + 40px hit area |
| Content start below header | +4px | `Container className="pt-1"` |
| Body text | 14px / 18px, white | `text-body` |
| Intro / tagline / composer / error message | 16px / 20px | `text-lead` |
| Meta (dates, tags, stat labels, hints) | 12px / 14px, #b1b1b1 | `text-meta text-text-muted` |
| Border / divider | 1px #484848 (dark) | `border-line`, `--color-line` |
| Selectable control border (amount picker, checkbox) | 1px #b1b1b1 (dark) | `border-line-strong` |
| Control radius | ≈4px | `--radius-control` |
| Standard control height (grid buttons, CTA, inputs, sheet rows, payment rows, history rows, accordion rows) | 40px | `h-10` |
| Compact control height (inline article actions, search field) | 32px | `h-8` |
| Button padding | 8px both sides (client feedback item 4) | `Button` (`px-2`) |
| Tag | 24px, 12px text, 4px padding | `Tag` |
| Filter pill (Treasury) | 32px, 12px text, rounded-full | Treasury page |
| Action-grid / row gap | 8px | `gap-2` |
| Sticky CTA | 40px, 8px above/below, no rule, shifts above an open keyboard | `StickyActionBar` |
| Full-bleed separator | spans the 8px gutters on both sides | `FullBleedSeparator` |
| Mobile sheet | square corners, no border | `Sheet` (base classes) |
| Desktop dialog | 400px wide, 1px #484848, rounded, centered | `Sheet` (`md:` classes) |

## Home (figma.pdf p1, 2026-09-24 export; p33 desktop not re-exported)

The client's third export changed one page: p1 (mobile Home). Pixel-diffed
against the previous export, p33 (desktop Home) and every other cached page
are identical, so the desktop frame still shows the earlier 4-button grid
with a sticky CTA.

Mobile p1, measured: identity row 44 → 12 → tagline (16/20) → 24 →
full-width "Join waitlist" (40, x 8…404) → 8 → 2×2 grid: Documentation |
Treasury, Contribute | Donate (40 + 8 + 40, columns 8…201 / 210…404) → 24 →
section label → 12 → section heading → 4 → paragraph(s) (18px between
paragraphs) → 16 → next section. **The rule under the grid is gone** in this
export. Bottom CTA: 40px, 8px from the bottom edge — mobile only.

Desktop uses the same five-button set and order (there's no updated desktop
frame; the sticky CTA is removed there per client feedback, so Join
waitlist must live in the grid) in the same 640px column. Breakpoint for
"desktop": Tailwind `md`, 768px.

## Vertical rhythm (Documentation index, p15)

header 44 → 4 → search 32 → 8 → "Documentation" (16 bold) → 4 → intro
(16/20) → 12 → rows (40 each, each with its own bottom stroke — client
feedback item 18). Expanded row: meta line (12px) directly under the row →
12 → tags (24, 8 gap) → 16 → body (14/18, heading 16 above / 4 below, 18
between paragraphs) → 20 → compact actions (32) → 20 → next row.

## Icons — Material Symbols, Sharp style, audited glyph by glyph

The client's first-pass feedback specified Google Material Icons, Sharp
style — the app previously used the Outlined style; every glyph below was
regenerated from the Sharp source.

| Figma element | Material name | Where |
| --- | --- | --- |
| Join waitlist | `approval` | Home grid, Home CTA |
| Contribute | `mail` | Home grid |
| Donate | `volunteer_activism` | Home grid, Treasury CTA, sheets |
| Treasury | `toll` | Home grid |
| Back | `arrow_back` | every sub-page header (`HistoryBackButton`) |
| Search | `search` | Documentation search |
| Share | `share` | Documentation headers, expanded rows, sheets |
| Overflow | `more_vert` | Documentation, Treasury, Donate headers |
| Accordion collapsed / expanded | `expand_more` / `expand_less` | Documentation rows |
| Send feedback | `lightbulb` | article/detail actions, sheets |
| Report issue | `new_releases` | article/detail actions, sheets |
| Documentation | `insert_drive_file` | sheets, Home row |
| Document history | `history` | article overflow menu (see the report on how this entry point was chosen — no Figma frame explicitly shows it) |
| Close | `close` | titled Sheet header row, Documentation search clear button |
| Checkbox checked / unchecked | `check_box` / `check_box_outline_blank` | Feedback/Issue type sheet (`Checkbox`) |
| Copy | `content_copy` | Contribute |
| Copied / verified | `check_circle` | Contribute (after copy, for 3s) |
| Invalid email | `warning` | Waitlist hint |
| Light/dark preview | `light_mode` / `dark_mode` | Home theme toggle — not a Figma element, see below |
| Home (success pages, not built) | `home` | reserved |

Path data is generated verbatim from `@material-design-icons/svg/sharp` into
`src/shared/ui/icons.tsx` (Apache-2.0). Glyph sizes: 16–18px inside buttons
and small controls, 20px in headers and icon controls, 24px for the
accordion chevron.

`light_mode`/`dark_mode` back the temporary theme toggle (client feedback
item 7), which isn't a Figma element at all — still a real Material Sharp
glyph, not a hand-drawn or emoji icon, for consistency with the rest of the
icon system.

## Assets still needed from the client

All six Donate payment marks (Visa, Mastercard, Amex, Apple Pay, Google Pay,
PayPal) have been supplied and are wired in
(`public/assets/icons/figma/*.svg`, rendered via `DonatePaymentMarks` /
`PaymentMarks`). Per the client's own note, the payment-button visual design
is being benchmarked/updated separately and was deliberately left alone
this pass beyond the marks already in place (client feedback item 27).

## Intentional differences / open items

- **Typeface.** Still anonymised in both PDF exports; glyph shapes are
  consistent with Inter. A system sans-serif stack is used, isolated to one
  CSS variable (`--font-sans`).
- **Corner radius.** ≈4px, read visually from a raster zoom, not vector
  geometry.
- **Donate Once/Monthly control.** The client asked for the "big toggle" to
  be replaced (client feedback item 25); neither `figma.pdf` nor
  `design.pdf` shows an updated version of this control (confirmed by
  pixel-diffing every page of both exports — see above). Implemented as a
  smaller, compact segmented control with the same interaction pending that
  reference; do not treat this as the confirmed final design.
- **Home action buttons.** Resolved by the 2026-09-24 export (p1): full-width
  Join waitlist, then Documentation / Treasury / Contribute / Donate. The
  desktop frame (p33) was not re-exported; desktop uses the same set.
- **Article action icons.** p15 shows the `approval` glyph on both "Send
  feedback" and "Report issue"; p16/p3 show `lightbulb` and `new_releases`
  for the same actions. The specific glyphs are used everywhere (kept from
  the first M1 pass).
- **Selected filter pill (Treasury).** The frame shows both pills outlined;
  a selected pill is filled with the theme's inverse-surface token so the
  pressed state is visible.
- **Document history.** No real data source exists for it (see ADR 012 and
  the client-feedback-pass report) — the route shows the article's one real
  version with an explicit note, not a fabricated list.
- **Muted text.** #b1b1b1 in dark theme (10.4:1 on black); the temporary
  light theme uses #5c5c5c (~7:1 on white) — see ADR 012 for the theme
  toggle and `globals.css` for both palettes.
