# Design Fidelity — figma.pdf Measurement Log

The client's design reference is a vector PDF export of the Figma v0.1 file
(`figma.pdf`, kept locally, git-ignored). Because it is vector, exact values
can be read from it rather than estimated: text runs carry their font size
and position, and rules/borders can be pixel-scanned at high zoom. This
document records what was measured, how it maps to the code, and the
differences that remain on purpose.

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
| Back glyph / title offset | glyph at x≈10, title at x=32 | `IconButton -mx-gutter` + 40px hit area |
| Content start below header | +4px | `Container className="pt-1"` |
| Body text | 14px / 18px, white | `text-body` |
| Intro / tagline / composer / error message | 16px / 20px | `text-lead` |
| Meta (dates, tags, stat labels, hints) | 12px / 14px, #b1b1b1 | `text-meta text-text-muted` |
| Border / divider | 1px #484848 | `border-line`, `--color-line` |
| Selectable control border (amount picker, checkbox) | 1px #b1b1b1 | `border-line-strong` |
| Input border (waitlist, segmented control) | 1px #ffffff | `border-white` |
| Control radius | ≈4px | `--radius-control` |
| Standard control height (grid buttons, CTA, inputs, sheet rows, payment rows, history rows, accordion rows) | 40px | `h-10` |
| Compact control height (inline article actions, search field) | 32px | `h-8` |
| Tag | 24px, 12px text, 4px padding | `Tag` |
| Filter pill (Treasury) | 32px, 12px text, rounded-full | Treasury page |
| Button label offset with icon | 32px (10 + 18px glyph + 4) | `Button` |
| Button label offset without icon | 8px | `Button` |
| Action-grid / row gap | 8px | `gap-2` |
| Sticky CTA | 40px white, 8px above/below, no rule | `StickyActionBar` |
| Desktop dialog | 400px wide, 1px #484848, centered | `Sheet` (`md:max-w-dialog`) |

## Vertical rhythm (Home, p1/p33 — identical on both)

identity row 44 → 12 → tagline (16/20) → 24 → 2×2 grid (40 + 8 + 40) → 8 →
rule → 16 → section label → 12 → section heading → 4 → paragraph(s)
(18px between paragraphs) → 16 → next section. Bottom CTA: 40px, 8px from
the bottom edge.

## Vertical rhythm (Documentation index, p15)

header 44 → 4 → search 32 → 8 → "Documentation" (16 bold) → 4 → intro
(16/20) → 12 → rows (40 each, no dividers). Expanded row: meta line (12px)
directly under the row → 12 → tags (24, 8 gap) → 16 → body (14/18, heading
16 above / 4 below, 18 between paragraphs) → 20 → compact actions (32) →
20 → next row.

## Icons — Material Icons (Outlined), audited glyph by glyph

| Figma element | Material name | Where |
| --- | --- | --- |
| Join waitlist | `approval` | Home grid, Home CTA |
| Contribute | `mail` | Home grid |
| Donate | `volunteer_activism` | Home grid, Treasury CTA, sheets |
| Treasury | `toll` | Home grid |
| Back | `arrow_back` | every sub-page header |
| Search | `search` | Documentation search |
| Share | `share` | Documentation headers, expanded rows, sheets |
| Overflow | `more_vert` | Documentation, Treasury, Donate headers |
| Accordion collapsed / expanded | `expand_more` / `expand_less` | Documentation rows |
| Send feedback | `lightbulb` | article actions, sheets |
| Report issue | `new_releases` | article actions, sheets |
| Documentation | `insert_drive_file` | sheets, Home row |
| Close | `close` | Sheet title row |
| Copy | `content_copy` | Contribute |
| Copied / verified | `check_circle` | Contribute (after copy) |
| Invalid email | `warning` | Waitlist hint |
| Home (success pages, not built) | `home` | reserved |

Path data is generated verbatim from `@material-design-icons/svg/outlined`
into `src/shared/ui/icons.tsx` (Apache-2.0). Glyph sizes: 18px inside
buttons, 20px in headers and icon controls, 24px for the accordion chevron.

## Assets still needed from the client

None for the M1 pages: every glyph in figma.pdf pages 1, 15–18, 19–32 and
33–35 resolves to a Material icon. The Donate payment rows (p9) show
third-party marks that are not Material icons and are not reproduced —
if the payment shell should show them before M3, they are needed as:

- `public/assets/icons/figma/payment-visa.svg`
- `public/assets/icons/figma/payment-mastercard.svg`
- `public/assets/icons/figma/payment-amex.svg`
- `public/assets/icons/figma/apple-pay.svg`
- `public/assets/icons/figma/google-pay.svg`
- `public/assets/icons/figma/paypal.svg`

(each ≈ 24–48px wide at 20px tall, original brand colours as in the PDF).

## Intentional differences from figma.pdf

- **Typeface.** The PDF anonymises fonts; glyph shapes are consistent with
  Inter. A system sans-serif stack is used until the client confirms the
  family (one-line change in `globals.css`). Line breaks therefore differ
  slightly from the frames.
- **Home "Documentation" row.** Not on the Home frame (the design reaches
  Documentation from the Treasury/Donate sheets). Kept as a 40px action row
  so the section is reachable from Home.
- **Accordion chevrons.** The frame shows `expand_less` on every row,
  collapsed or not; the implementation uses `expand_more` when collapsed
  so the state is distinguishable.
- **Article action icons.** p15 shows the `approval` glyph on both "Send
  feedback" and "Report issue"; p16/p3 show `lightbulb` and `new_releases`
  for the same actions. The specific glyphs are used everywhere.
- **Selected filter pill (Treasury).** The frame shows both pills outlined;
  a selected pill is filled white so the pressed state is visible.
- **Invalid-email hint.** 10px in the PDF (p20); rendered at 12px (`text-meta`)
  for legibility.
- **Donate legal text and payment logos.** The long Stripe/refund text under
  the payment rows (p9) and the third-party payment marks are not
  reproduced in the M1 shell (M3 content, unverified copy, assets above).
- **Muted text.** #b1b1b1 as measured (10.4:1 on black), which supersedes
  the earlier #949494 adjustment in ADR 006.
- **Textarea focus.** The composer is borderless as designed; keyboard
  focus draws a 1px #484848 outline so focus stays visible (WCAG 2.4.7).
- **Treasury "History 1,256" count, "last updated" notes, Treasury detail
  dialogs, donation/waitlist/feedback success pages, document history.**
  These need M2/M3 data and are not built; the `Sheet` primitive already
  implements the mobile-sheet / desktop-dialog pattern they will use.
