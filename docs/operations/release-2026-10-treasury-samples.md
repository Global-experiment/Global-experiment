# Release plan — Treasury as in Figma, with sample data (October 2026)

**Status: prepared, not run.** Each production step needs the owner's
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
   builds, `chown -R globalexp:globalexp .next`.
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
