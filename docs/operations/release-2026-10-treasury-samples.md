# Release plan — Treasury as in Figma, with sample data (October 2026)

**Status: run on 2026-10-15** (record at the end). Each production step needs the owner's
go-ahead.

**What ships:** the p11 search button (public text and entry numbers,
`?q=`), each stat's trend (change from 30 days earlier), migration **0008**
(`treasury_entries.sample`, the public view's `sample` column), and the
owner's decision of 2026-10-15 for production **before go-live**:

- sample expenses, tagged "Test" on the public pages, Mode "Sample" in the
  admin (`api:seed-sample-treasury`; one shared sample recipient
  organization, admin only);
- sample Balance and Sustainability figures with a note under the stats
  (`treasury.sample_figures`, ignored once Wise is connected);
- Stripe sandbox donations public, tagged "Test"
  (`TREASURY_SHOW_TEST_DONATIONS=true`, ignored with a live Stripe key);
- the admin list says "Published, not public" when visitors can't see a
  published entry.

Procedure: [release-2026-10-treasury.md](release-2026-10-treasury.md) and
its scripts. Database `global_experiment` via `/etc/global-experiment/api.env`;
values are never printed.

## Steps

1. **Backup:** `pg_dump` custom format, SHA-256 on the server and on the
   owner's computer (identical), `api.env` copied.
2. **Update and build** (website and admin offline from here): stop both
   services, `git pull --ff-only origin develop`, `npm ci`, web and API
   builds, `chown -R globalexp:globalexp .next`, and `rm -rf .next/cache/fetch-cache`:
   the website's data cache survives a build, and a response cached from the
   previous API could reach the new pages (it made the first `/treasury`
   request of this release fail once; the page now tolerates it too).
3. **Migration 0008.** Expected: 9 migrations; `treasury_entries.sample`
   false on every existing row.
4. **Environment:** `TREASURY_SHOW_TEST_DONATIONS=true` in `api.env`.
5. **Start** both services; health checks (API, home, `/treasury`,
   `/admin/treasury`).
6. **Sample data:** `npm run seed-sample-treasury -w @global-experiment/api -- --confirm`
   with the API's environment. Expected: 12 USD, 2 EUR, 2 CHF sample
   expenses and the sample figures. The public page shows them within
   5 minutes (cache fallback).
7. **Checks:** `/treasury` shows Balance "$ 91.3K +2.1%", Sustainability
   "1.4 +2.1%", Med. donation and Expenses ("39.8K" plus real entries), the
   sample note, the history with the sandbox donations and the samples
   tagged "Test"; the search finds "hosting"; an entry page opens; admin
   Treasury shows Mode "Sample" / "Test"; taxonomy counts unchanged;
   organizations +1 (the sample recipient).

## At go-live (not now)

1. `npm run seed-sample-treasury` is refused once the Stripe key is live.
2. `npm run purge-sample-treasury -w @global-experiment/api -- --confirm`:
   removes every sample entry, the sample recipient and the sample figures.
3. Remove `TREASURY_SHOW_TEST_DONATIONS` (a live key ignores it anyway) and
   purge the sandbox donations: `api:purge-test-donations` (backup first).

## Rollback

`purge-sample-treasury --confirm`; stop both services; restore the dump
(directory runbook §10); `git checkout` the previous commit, `npm ci`,
rebuild, `chown`, remove `TREASURY_SHOW_TEST_DONATIONS`, start.

## Record of the run — 2026-10-15

| Step | Result |
|---|---|
| Backup | `ge-prod-20261015-055905.dump`, 237,427 bytes, SHA-256 `eb2b236f9ad01f01e876cc7db86b5636bb0f19ed4c7cae650107699347f9d2a1`; copied to `ge-db-backups`, hash identical. `api.env` copied. Before: taxonomy 14/120/1105/1400, people 1, organizations 0, Treasury entries 2 (the $5 and $50 sandbox donations), 8 migrations. |
| Update and build | Services stopped 05:59:06 UTC; `d7dc0e1..07cf94f`; `npm ci`, web and API builds OK; `chown`. |
| Migration | 9 migrations; no sample rows before the seed. |
| Environment | `TREASURY_SHOW_TEST_DONATIONS=true`; Stripe key `sk_test`. |
| Start | Up 05:59:38 UTC (**32 seconds** offline), both services active. |
| Samples | `seed-sample-treasury --confirm`: 12 USD, 2 EUR, 2 CHF sample expenses and the sample figures. After: taxonomy unchanged, people 1, organizations 1 (the sample recipient), entries 18 (16 samples). |
| Incident | The first `/treasury` request (06:00:02) answered 500: the website's data cache, which survives a build, served the previous API's overview (no `trends`). Cleared `.next/cache/fetch-cache`; every page 200 since. Fixed in `31b503b` (the page tolerates an older overview; deploys clear the data cache), released at once: backup `ge-prod-20261015-060648.dump` (SHA-256 `22fc4f5af8e9bd5f509f57a51671e40eecbb504b3beaa1fe998e57f777196731`, copied, identical), website stopped 06:06:49, up 06:06:59 (**10 seconds**), `07cf94f..639dbd9`. |
| Checks | `/treasury` (USD, EUR, CHF, All), search `?q=hosting`, `?type=expense`, `/donate`: 200, three times each. An expense page and a donation page 200; unknown entry 404; `/admin/treasury` 200. USD overview: Balance $ 91.3K +2.1%, Sustainability 1.4 +2.1%, Med. donation $27.5, Expenses 39.8K +32.9%, the sample note; history 14, every entry tagged "Test". Web and API logs: 0 errors after the fix. |

## Follow-up — Donate payment methods as in Figma p28 (2026-10-15)

Owner's request: the Donate page as in Common pages p28. Configuration
only, no code: `DONATIONS_EXTRA_METHODS=true` (PayPal in USD, EUR and CHF,
one-off; Direct debit SEPA in EUR) and `DONATIONS_MONTHLY=true` (the Once /
Monthly switch and the Monthly donors stat) in `api.env` (copied first:
`api.env.20261015-092915`). The website's data cache cleared; services
restarted 09:29:15 → 09:29:17 UTC (2 seconds).

Checked first in the Stripe sandbox, with the checkout's own settings
(Managed Payments and Adaptive Pricing off): PayPal USD / EUR / CHF, SEPA
one-off and monthly, monthly card — all accepted. The webhook endpoint has
the nine events of [stripe.md](stripe.md). After the change:
`/api/donations/config` lists them; checkouts through the public API open
Stripe Checkout for PayPal (USD, EUR, CHF), SEPA (EUR, once and monthly)
and monthly card; monthly PayPal and SEPA in USD are refused (400), as the
rules say. At go-live the live Stripe account needs PayPal and SEPA
activated in its payment methods before the live key goes in.
