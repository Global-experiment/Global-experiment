# Release record — Stripe donations, sandbox phase (October 2026)

**What shipped:** `develop` at `b0edf93` (*Merge branch
'feat/stripe-donations' into develop*, feature commit `64d881d`): roadmap
module 1 — migration **0006** (`settings`, Treasury ledger, Stripe events
and subscriptions), donate page and thank-you page, Checkout, the signed
webhook (donations, refunds, disputes), test/live separation, the
`donations.enabled` switch with a private preview link, and the
`purge-test-donations` command. **Before:** `3e1a42e`.

**State after the release:** Stripe **sandbox** (test key), donations
**closed** (`DONATIONS_ENABLED=false`): `/donate` shows "Donations open
soon" and Checkout is refused; the private preview link works. Going live
is a separate, later step (checklist below).

Procedure: [release-2026-10-directory.md](release-2026-10-directory.md)
steps 0, 1, 2, 5 (migration), 7 and 9, plus the steps below. Database:
`global_experiment` via `/etc/global-experiment/api.env`. Stripe set-up:
[stripe.md](stripe.md).

## Record of the run — 2026-10-14 (UTC)

| Step | Result |
|---|---|
| Pre-flight | Server on `3e1a42e`, both services active, API on `global_experiment` (6 migrations), web env in `/opt/global-experiment/.env.local` (`ADMIN_API_ORIGIN` via `admin-api.conf`), `.next/cache` owned by `globalexp`. Counts: domains 14, fields 120, expertise 1105, team links 1400, people 0, organizations 0, import runs 3. |
| Backup | `STAMP=20261014-181943`, services running. `ge-prod-20261014-181943.dump`, 155,583 bytes, 17 TABLE DATA, SHA-256 `22a00beda4b0858a028f54f28de26af169f282a07797ce55e545037f59efb73d`; copied to `ge-db-backups`, hash identical. `api.env`, web `.env.local` and systemd units copied. |
| Stripe sandbox endpoint | Created with the API (test key): `we_1UQWmdGpixQrYsLmJNiqTo4x`, `https://globalexperiment.org/api/stripe/webhook`, livemode false, enabled, the 9 events the code handles, account API version. Signing secret written to the server only (never printed). |
| Update and build | Services stopped 18:20:22. `3e1a42e..b0edf93` (fast-forward), `npm ci` (640 packages), web and API builds OK; rewrites for `api/admin`, `api/donations`, `api/stripe` in the routes manifest. `chown -R globalexp:globalexp .next`: 0 files left with another owner. |
| Migration 0006 | Applied successfully: 7 migrations. 4 review statuses, 10 expense types; 0 entries, events, subscriptions, settings rows. |
| Environment | `api.env` += `STRIPE_SECRET_KEY` (sandbox test key), `STRIPE_WEBHOOK_SECRET`, `PUBLIC_SITE_URL=https://globalexperiment.org`, `WEB_INTERNAL_URL=http://127.0.0.1:3000` (required with Stripe in production), `REVALIDATE_SECRET`, `DONATIONS_PREVIEW_TOKEN` (random, 48 hex), `DONATIONS_ENABLED=false`. Web `.env.local` += the same `REVALIDATE_SECRET`. Values never printed; owners and modes unchanged. |
| Restart and health | Started 18:21:52, up 18:21:54. Both active, no API errors, API on `global_experiment`. API health 200, home 200, documentation 200, public site 200, `/donate` 200 with "Donations open soon" and no payment rows, thank-you without session → 307 to `/donate` with the same choice, admin proxy 400, imports unauthenticated 401, donations config `available: true, enabled: false`, Checkout 403 (closed), unsigned webhook 400, `/api/revalidate` without secret 401, summary EUR all zero. Web log: 0 EACCES / permission denied. |
| Production test (preview link) | One **EUR 5.00** sandbox donation via `/donate?preview=…` → Stripe hosted Checkout (test card 4242) → thank-you page with "Donation sent" (token not in the return URL). Real webhook through the Next.js proxy: `checkout.session.completed` processed, 1 attempt; entry #1 donation EUR 500, **livemode = false**, published; revalidation call accepted. Refund with the Stripe CLI (sandbox): `charge.refunded` processed; entry #2 refund −500, linked to #1, livemode = false. Public figures before and after: EUR/USD/CHF summary all 0, `/donate` "€ 0" — the test rows never appeared publicly. |
| Purge of the test rows | Dry run: 1 donation, 1 refund, 0 disputes, 0 subscriptions, 2 events. Fresh backup `ge-prod-before-test-purge-20261014-182335.dump`, 189,327 bytes, 24 TABLE DATA, SHA-256 `6650316bb973b5f92cf68f1625676ef90bd16f197e9c5dbf1c010cf0f829b1d1`, copied to `ge-db-backups` (hash identical). `--confirm --backup …`: purged in one transaction, same totals; dry run after: 0. |
| Verify | domains 14, fields 120, expertise 1105, team links 1400, people 0, organizations 0, import runs 3 — unchanged. treasury entries 0, public view rows 0, stripe events 0, subscriptions 0, settings rows 0. Summaries EUR/USD/CHF all zero; `/donate` "Donations open soon", "€ 0". Services active, API health 200. |

**Downtime:** 18:20:22 → 18:21:54 UTC (20:20:22 → 20:21:54 Zurich),
92 seconds, website and admin.

**Differed from Expected:** nothing. `WEB_INTERNAL_URL` was added to the
planned variables (the API requires it in production once Stripe is
configured). The `/treasury` page still shows its illustrative figures
from the code (presentation data, not the database) until module 1b
connects it to the ledger.

**Where the preview link's token is:** only on the server, in
`/etc/global-experiment/api.env` (`DONATIONS_PREVIEW_TOKEN`). The link is
`https://globalexperiment.org/donate?preview=<token>`; read the token on the
server when needed, never paste it in chat or a ticket. To change it:
replace the line, `systemctl restart global-experiment-api.service`.

**Rollback (not needed):** stop both services, restore
`ge-prod-20261014-181943.dump` into `global_experiment` (§10 of the
directory runbook), restore `api.env.20261014-181943` and
`web.env.local.20261014-181943`, `git checkout 3e1a42e`, `npm ci`, rebuild,
`chown -R globalexp:globalexp .next`, start. Then delete the sandbox
endpoint `we_1UQWmdGpixQrYsLmJNiqTo4x` in the Stripe Dashboard (test mode).

## Going live later (not done)

Prerequisites: the client's go-ahead; the association's Stripe account
activated for **live** payments (business details, bank verification);
the legal texts confirmed. Each step in [stripe.md](stripe.md) §3.

1. **Backup** `global_experiment` (pg_dump, SHA-256, copy to `ge-db-backups`).
2. **Live Dashboard settings** (Stripe Dashboard, *live* mode):
   - Settings → Managed Payments: **off** as the account default.
   - Settings → Payments → Adaptive Pricing: **off**.
   - Payment methods: Cards, Apple Pay, Google Pay on; PayPal / SEPA only
     if `donations.extra_methods` will be turned on.
   - Customer emails: Successful payments and Refunds **on**.
   - Customer portal: cancellation and payment-method update allowed, plan
     changes off; copy the login link (for `STRIPE_CUSTOMER_PORTAL_URL`, if
     monthly donations are offered).
   - Public details: association name, support email
     `donations@globalexperiment.org`, statement descriptor.
   - Payouts: the association's **Wise EUR account**, automatic payouts.
3. **Live API key:** a restricted key `rk_live_…` with Checkout Sessions
   write and read-only PaymentIntents, Charges, Refunds, Invoices, Invoice
   Payments, Subscriptions, Balance transactions, **Disputes**.
4. **Live webhook endpoint:** `https://globalexperiment.org/api/stripe/webhook`,
   the same 9 events, in *live* mode; keep its signing secret.
5. **Server `api.env`** (values never printed): replace `STRIPE_SECRET_KEY`
   (live restricted key) and `STRIPE_WEBHOOK_SECRET` (live endpoint), add
   `STRIPE_LIVE_ENABLED=true`, and `STRIPE_CUSTOMER_PORTAL_URL` if needed.
   Restart the API; `GET /api/donations/config` → `"available": true`.
6. **Clean test rows** (if any were made since): `npm run
   purge-test-donations -w @global-experiment/api -- --dry-run`, then
   `--confirm --backup <fresh dump>`. (Production shows live rows only
   anyway.)
7. **First live donation, still closed:** through the preview link, one
   small real donation (e.g. EUR 1) with a team member's card → thank-you
   "Donation sent"; `stripe_events` processed; entry with `livemode = true`;
   it appears in the public figures. Refund it in the Dashboard → a linked
   refund entry (both stay in the public ledger — the donation counts no
   more once fully refunded).
8. **Open donations:** set `DONATIONS_ENABLED=true` in `api.env` (or the
   settings row `donations.enabled = true`) and restart the API; `/donate`
   shows the payment rows, the config says `"enabled": true`.
9. **Disable the sandbox endpoint** `we_1UQWmdGpixQrYsLmJNiqTo4x` (test mode)
   so test events stop reaching production (they'd be ignored as "other
   mode" anyway once the key is live).
10. **Watch** the first days: Dashboard → Webhooks shows 2xx only;
    `select id, type, attempts, last_error from stripe_events where status = 'failed';`
    stays empty.
