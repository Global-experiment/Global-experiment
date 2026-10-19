# Release — public website fixes (Step 2, 2026-10-19)

**Status: run on 2026-10-19.** Decisions: [overview §2.3](../architecture/overview.md)
(2 and 17). No migration.

**What ships:** sticky headers with a share button on every public page
(desktop: copy, check icon, "Link copied to clipboard"; mobile: native
share), copy rows in sheets close after copying; the Treasury header is
back, title and share, stats in USD, history in every currency
(`treasury.public_toolbar` off); one-off card donations on the donate page
with Stripe's card fields, no email, a reference on the thank-you page
(`donations.checkout = embedded`); PayPal on Monthly
(`donations.paypal_monthly`); footer bar padding, 24px checkboxes, sheets
slide down on close; a CSP that allows Stripe.js on `/donate` only.

## Steps

1. **Backup** with `o-backup.sh`: `pg_dump`, `api.env` copy, SHA-256 on the
   server and on the owner's computer (identical).
2. **Release** with `o-release.sh` (stdin: the sandbox publishable key,
   never printed): stop both services, `git pull --ff-only`, `npm ci` (new
   packages `@stripe/stripe-js`, `@stripe/react-stripe-js`), both builds,
   `api.env` gets `STRIPE_PUBLISHABLE_KEY` and
   `DONATIONS_PAYPAL_MONTHLY=true`, `chown .next`, clear the data cache,
   start, health checks.
3. **Stripe sandbox:** add `payment_intent.succeeded` to the webhook
   endpoint (ten events, [stripe.md](stripe.md)).
4. **Checks:** public pages and `/admin/login` 200; `/api/donations/config`
   says `embedded` with a `pk_test_` key and PayPal once + monthly; CSP
   allows `js.stripe.com` on `/donate` only; one sandbox card donation end
   to end.

## Rollback

Stop both services; `git checkout 3339e3b`, `npm ci`, both builds,
`chown`; remove `STRIPE_PUBLISHABLE_KEY` and `DONATIONS_PAYPAL_MONTHLY`
from `api.env` (or restore `api.env.20261019-000325`); start. The database
needs no restore (no migration); the sandbox donation stays a test entry.
Removing `STRIPE_PUBLISHABLE_KEY` alone turns card donations back to
hosted Checkout.

## Record of the run — 2026-10-19

| Step | Result |
|---|---|
| Backup | `ge-prod-20261019-000325.dump`, 284,739 bytes, SHA-256 `7130316c3f9f7bee39ee97d642a4e4730f6e581fb9f9c435db1ad3d7363ebf25`; copied to `ge-db-backups`, hash identical. Before: Treasury entries 18, people 2, organizations 2, 9 migrations. |
| Release | Stopped 00:03:54 UTC, up 00:04:27 (**33 seconds** offline); `3339e3b..0779c89`; builds OK; `api.env`: publishable key (1 line, `pk_test_`), `DONATIONS_PAYPAL_MONTHLY=true`. |
| Webhook | Sandbox endpoint: 10 events, `payment_intent.succeeded` added. |
| Checks | Pages 200; config `embedded`, PayPal once + monthly in EUR, USD, CHF. Sandbox donation: PaymentIntent created through the public API (reference `GE-0UBSTPVS`), confirmed with a test card, card only, metadata `kind = donation`, `flow = embedded`; webhook recorded it once (one `payment_intent.succeeded` event; entries 18 → 19, USD 2.00, test mode, published); the thank-you page shows the reference and "No email receipt is sent". A browser on production: the card sheet opens, Stripe's fields load, no console errors. Logs: no errors. |
| Follow-up | Stripe's card fields took 5–10 s to arrive in that browser with nothing shown meanwhile: the sheet now says "Loading the secure card form…" until they are ready (`0e1c88e`). Backup `ge-prod-20261019-000936.dump` (SHA-256 `cbe09e4c751802b5f62068bd1310739d2dc5abdd03fa98c968ea7fbdf7d43f3b`, copied, identical); stopped 00:09:59, up 00:10:27 (**28 seconds**); `0779c89..6cba61c`; checked on production. |

At go-live the live account needs PayPal recurring payments enabled before
`donations.paypal_monthly` stays on, and the live publishable key goes in
with the live secret key (the API refuses keys of different modes).
