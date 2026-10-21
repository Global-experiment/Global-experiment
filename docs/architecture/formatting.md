# Formatting — numbers, dates and times

**Source:** the client's Notion pages **"Numbers"** (edited 2026-10-18) and
**"Date and time"** (edited 2026-10-17), both under *0.1 native*. This file
records the rules as implemented; the code is
`src/shared/format/` (`numbers.ts`, `dates.ts`, `Timestamp.tsx`) and its
tests (`format.test.ts`) use the pages' own examples.

Where it applies: every admin detail page and the history feed (Delivery B,
2026-10-21). The public pages keep their Figma-matched formats for now; they
move to the shared module when they are next redesigned.

## Numbers

English formatting everywhere, whatever the visitor's country or browser
locale: Latin digits, comma grouping, point decimals (1,234,567.89).

| Value | Rule | Examples |
|---|---|---|
| Whole numbers, counts | Grouped from 1,000, no decimals | 0 · 999 · 1,000 · 1,234,567 |
| General decimals | Up to 2 places (more only where a field needs it), trailing zeroes removed, leading zero kept | 1.5 · 1,234.56 · 8 · 0.5 |
| Percentages | Up to 1 decimal, no space, trailing .0 removed; "less than 0.1%" and "more than 99.9%" near the ends | 62% · 62.4% |
| Scores out of 10 | Always 1 decimal and the denominator | 8.0 / 10 |
| Money | Uppercase code, nonbreaking space, the currency's decimals with trailing zeroes | USD 39.80 · CHF 1,234.50 |
| Negative values | U+2212 minus before the value, also before the currency code | −12 · −USD 39.80 |
| Changes | + for increases, − for decreases, zero without a sign; pp for percentage points | +12 · −12 · 0 · +5 pp |
| Ranges | En dash, no spaces | 10–20 · 10%–20% |
| Missing | Unavailable, or Not applicable when the measure doesn't apply | — |
| Identifiers | Kept exactly: no grouping, no rounding | 001234 · PER-81 |
| Compact (counters, summary cards, charts only) | K, M, B, T; 1 decimal; trailing .0 removed; promoted suffix | 12.3K · 1M (never 1,000K) |

Exact halves round away from zero, for display only; sorting, filtering
and exports use the original values. A nonzero value that would display as
zero shows a threshold ("less than 0.01"). Numeric columns are
right-aligned with tabular digits.

## Dates and times

Timestamps are stored in UTC and shown in the **viewer's time zone**
(browser or device, daylight saving included), for visitors without an
account too. Until the browser's zone is known (server rendering) the
default is **Europe/Zurich**.

| Context | Format | Example |
|---|---|---|
| Clickable content that opens its details | Elapsed time | 3d |
| Non-clickable content among other timestamps (history entries) | Short exact | Oct 14 9:24 PM |
| A record's own timestamps on its detail page | Full exact | October 14 at 9:24 PM |

- Elapsed time: Just now (under a minute) · 1min · 25min · 1h · 4h · 1d ·
  3d · 1w · 3w · 1m · 8m · 1y · 3y. The largest completed unit, rounded
  down, one unit only; "min" for minutes and "m" for months; months and
  years are calendar-aware. Real elapsed time, the same worldwide (never
  "Yesterday" because local midnight passed). Labels update while the page
  is open; screen readers hear the expanded wording ("4 hours ago").
- Exact formats: 12-hour clock, uppercase AM/PM, no leading zero on the day
  or hour, two minute digits. The year and time zone are on hover and
  keyboard focus ("October 14, 2026 at 9:24 PM GMT+2").
- Date-only values (first and last contact) are shown as stored, never
  converted: "October 14, 2026" (with the year, since a plain date has no
  hover reference).

## Decisions

- The person-record prototype shows "September 25, 2026 3:26 PM" for record
  dates; the Notion rule ("October 14 at 9:24 PM", year on hover) is newer
  and explicit, so it applies.
- Notion's page asks for wording localised to the interface language; the
  interface is English only today, so the module formats in English.
