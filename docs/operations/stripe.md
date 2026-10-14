# Stripe donations — local testing and production setup

Roadmap module 1 (donations end to end). Architecture: `docs/architecture/overview.md`
§3.7 (revalidation) and `data-model.md` §1.1 (settings), §4 (Treasury,
`stripe_events`, `stripe_subscriptions`).

## 1. How it works

```text
/donate (Next.js)
  └─ POST /api/donations/checkout ──► API: validates amount / currency / frequency / method
                                       against the settings, creates a Stripe Checkout
                                       session (idempotency key) ──► Stripe hosted Checkout
Stripe ──► POST /api/stripe/webhook ──► API: signature check (raw body), stripe_events row,
                                         re-reads the objects from Stripe, writes
                                         treasury_entries in one transaction
                                         └─► POST {WEB_INTERNAL_URL}/api/revalidate (tag "treasury")
Stripe ──► /donate/thank-you?session_id=…  (session checked through the API → "Donation sent")
Stripe ──► /donate?currency=…&amount=…&canceled=1  (cancel: same choice kept)
```

- **No donor data is stored or logged.** Stripe collects the email (for its
  receipts); the database keeps amounts, currencies, Stripe object ids and
  dates only. Logs carry the event id, type and result.
- Every successful payment becomes a published **anonymous donation**
  (`managed_by = native`, review "Not required"); every Stripe refund a
  linked **negative refund entry**; a dispute a linked **dispute
  adjustment** — negative "Payment disputed" when Stripe withdraws the
  funds, positive "Dispute won" when it reinstates them. Amounts are minor units; the currency is
  the one the donor chose (EUR, USD or CHF). When Stripe settles in another
  currency (the account's), its figures and exchange rate are kept in the
  `settlement_*` columns — never converted by us.
- Fees: from Stripe's balance transaction. Some payments are settled after
  the webhook; a job in the API fills the fee in later (every
  `STRIPE_FEE_RECONCILE_MINUTES`, default 15).
- **Test vs live:** every Stripe row records its mode (`livemode`). The
  public figures show live rows only in production, the configured key's
  mode elsewhere. Test rows are removed with the purge command (§5).
- **Opening:** until `donations.enabled` is on, `/donate` shows "Donations
  open soon" without payment rows and the API refuses Checkout (403
  `donations_closed`). The private link `/donate?preview=<DONATIONS_PREVIEW_TOKEN>`
  allows a checkout anyway (for tests before launch); the token is never
  sent to Stripe, logged, or put in the share link.
- Monthly donations (subscriptions) only while `donations.monthly` is on;
  PayPal and SEPA Direct Debit rows only while `donations.extra_methods` is
  on (SEPA in EUR only, PayPal one-off only).

Every Checkout session the API creates sets: the donation marker
`metadata.kind = donation` (session, PaymentIntent or subscription),
`submit_type = donate` (one-off), no Stripe customer for one-off donations,
**`managed_payments.enabled = false`** and **`adaptive_pricing.enabled =
false`** (see §3.2).

## 2. Configuration

| Variable | Where | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | API | `sk_test_…` locally; production `sk_live_…` or better a **restricted** `rk_live_…` key (§3.1). A live key is refused unless `STRIPE_LIVE_ENABLED=true`. |
| `STRIPE_WEBHOOK_SECRET` | API | `whsec_…` of the endpoint (production) or of `stripe listen` (local). |
| `STRIPE_LIVE_ENABLED` | API | `true` only in production with a live key. |
| `STRIPE_CUSTOMER_PORTAL_URL` | API | Customer-portal login link (https). Shown on the donate page while monthly donations are on. |
| `STRIPE_FEE_RECONCILE_MINUTES` | API | Default 15; `0` turns the job off. |
| `PUBLIC_SITE_URL` | API | The site's origin: Checkout return links and the donate origin check. |
| `WEB_INTERNAL_URL` | API | Where the API reaches the Next.js server (default `http://127.0.0.1:3000`). |
| `REVALIDATE_SECRET` | API **and** Next.js | Same value on both, ≥ 32 characters (`openssl rand -hex 32`). |
| `DONATIONS_ENABLED`, `DONATIONS_MONTHLY`, `DONATIONS_EXTRA_METHODS`, `DONATIONS_DEFAULT_CURRENCY` | API | Defaults of the settings keys; a row in `settings` overrides them. `DONATIONS_ENABLED` defaults to false. |
| `DONATIONS_PREVIEW_TOKEN` | API | 32–128 characters of `[A-Za-z0-9_-]` (`openssl rand -hex 24`); unset = no preview link. |
| `ADMIN_API_ORIGIN` | Next.js | The API origin; Next.js proxies `/api/admin`, `/api/donations`, `/api/stripe` and `/api/treasury` to it and reads the public figures from it. |

In production with a Stripe key, the API refuses to start without
`STRIPE_WEBHOOK_SECRET`, `PUBLIC_SITE_URL`, `WEB_INTERNAL_URL` and
`REVALIDATE_SECRET`. No Stripe variable is ever exposed through a
`NEXT_PUBLIC_` prefix (Checkout is hosted by Stripe; the publishable key
isn't used).

Flags in the database (until module 2 adds the admin page):

```sql
insert into settings (key, value) values ('donations.monthly', 'true')
  on conflict (key) do update set value = excluded.value, updated_at = now();
delete from settings where key = 'donations.monthly';   -- back to the environment default
```

## 3. Production setup (live mode)

Do these in the Stripe Dashboard of the association's account, **live
mode**, before setting the live key on the server.

### 3.1 API key

Create a **restricted key** (Developers → API keys → Create restricted key),
named e.g. "global-experiment-api", with only:

| Resource | Permission |
|---|---|
| Checkout Sessions | Write |
| PaymentIntents, Charges, Refunds, Invoices, Invoice Payments, Subscriptions, Balance transactions | Read |
| Webhook endpoints, everything else | None |

Put it in `/etc/global-experiment/api.env` as `STRIPE_SECRET_KEY` with
`STRIPE_LIVE_ENABLED=true` (never in the repository, never printed).

### 3.2 Account settings that would break donations

- **Managed Payments** (Settings → Managed Payments): Stripe as merchant of
  record for digital products. Not for donations to the association — turn
  it **off** as the account default. (The API also disables it on every
  session; with it on, Stripe rejects the session — found in the test-mode
  run, where the sandbox had it on by default.)
- **Adaptive Pricing** (Settings → Payments → Adaptive Pricing): offers the
  donor their local currency (e.g. JPY). The ledger keeps EUR, USD and CHF
  only — turn it **off**. (Also disabled per session; a charge in another
  currency would be refused by the webhook and show as
  `retry:unsupported_currency` in `stripe_events`.)

### 3.3 Payment methods

Settings → Payments → Payment methods: **Cards** on, **Apple Pay** and
**Google Pay** on (shown by Checkout on supported devices; no domain
verification needed for hosted Checkout). **PayPal** and **SEPA Direct
Debit** only when the client turns `donations.extra_methods` on — PayPal
needs activation in the Dashboard; recurring PayPal needs a separate Stripe
approval, so the site offers PayPal for one-off donations only.

### 3.4 Webhook endpoint

Developers → Webhooks → Add endpoint:

- URL: `https://globalexperiment.org/api/stripe/webhook` (through the
  Next.js proxy, which forwards the raw body unchanged — verified locally).
- Events (exactly these nine): `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `invoice.paid`,
  `charge.refunded`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`.
- API version: any. The handler reads only the event id, type and object id,
  then re-reads the objects with the SDK's pinned version (2026-08-26.dahlia).
- Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.

### 3.5 Receipts, customer portal, branding

- Settings → Customer emails: **Successful payments** and **Refunds** on
  (Stripe sends the receipts — decided).
- Settings → Billing → Customer portal: allow **cancelling subscriptions**
  (and updating the payment method); turn off plan changes. Copy the
  **login link** into `STRIPE_CUSTOMER_PORTAL_URL`.
- Settings → Business → Public details: the association's name, support
  email (`donations@globalexperiment.org`), statement descriptor (e.g.
  "GLOBAL EXPERIMENT").

### 3.6 Payouts

Settings → Payouts: the association's **Wise EUR account** as the bank
account, automatic payouts (daily or weekly). The account's settlement
currency is what fills the `settlement_*` columns for USD and CHF
donations. Wise reconciliation is a later module (Wise API, Q-list).

### 3.7 Release checklist

1. Backup, then migration **0006** (release runbook, as for 0005).
2. `/etc/global-experiment/api.env`: `STRIPE_SECRET_KEY` (restricted live
   key), `STRIPE_LIVE_ENABLED=true`, `STRIPE_WEBHOOK_SECRET`,
   `PUBLIC_SITE_URL=https://globalexperiment.org`,
   `WEB_INTERNAL_URL=http://127.0.0.1:3000`, `REVALIDATE_SECRET`,
   `STRIPE_CUSTOMER_PORTAL_URL` (if monthly is on).
3. Next.js environment (`.env.local` on the server or the unit's drop-in):
   the same `REVALIDATE_SECRET`; `ADMIN_API_ORIGIN` already set.
4. Dashboard: §3.2 off, §3.3 methods, §3.4 endpoint (9 events), §3.5, §3.6.
5. Restart both services; `GET /api/donations/config` answers
   `"available": true`.
6. One real **small** donation (e.g. 1 EUR) with a team member's card →
   thank-you page with "Donation sent"; a `processed` row in
   `stripe_events`; the donation on `/donate` figures; then refund it in the
   Dashboard → a negative refund entry. (Both stay in the public ledger.)
7. Dashboard → Webhooks → the endpoint shows only 2xx deliveries.

## 4. Local testing (test mode)

Never against the development or production database: use a dedicated
local database whose name ends in `_test` (here
`global_experiment_stripe_test`), migrated with `drizzle-kit migrate`.
Test-mode rows are test data.

1. **Stripe CLI:** `winget install Stripe.StripeCli`. Instead of
   `stripe login`, give it the test key from `.env.local` as
   `STRIPE_API_KEY` in the environment of the command (never on the command
   line, never printed).
2. **Keys:** `.env.local` has `STRIPE_SECRET_KEY=sk_test_…` and
   `REVALIDATE_SECRET`. The webhook secret: `stripe listen --print-secret`
   (stable for this machine and account) → `STRIPE_WEBHOOK_SECRET` in
   `.env.local`, without echoing it.
3. **Run:** the API (`npm run api:dev` with `DATABASE_URL` → the `_test`
   database), the site (`npm run dev`, port 3000), and
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook \
     --events checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,charge.refunded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,charge.dispute.funds_withdrawn,charge.dispute.funds_reinstated
   ```
   Donations must be open locally: `DONATIONS_ENABLED=true`, or use the
   preview link.
   Forwarding to the site (not straight to the API on 4000) tests the
   production path through the Next.js proxy.
4. **Donate** on `http://localhost:3000/donate`; Checkout test cards:
   `4242 4242 4242 4242` (success), `4000 0025 0000 3155` (3-D Secure),
   `4000 0000 0000 9995` (declined), `4000 0000 0000 0259` (disputed
   right after payment: `charge.dispute.funds_withdrawn`); any future date,
   any CVC. SEPA test
   IBAN `DE89 3704 0044 0532 0130 00` (EUR, extra methods on).
5. **Monthly:** start the API with `DONATIONS_MONTHLY=true` (or the
   settings row above).
6. **Refunds:** `stripe refunds create --charge=ch_… --amount=500` (partial)
   or without `--amount` (full).
7. **Cancel a subscription:** `stripe subscriptions cancel sub_… --confirm`
   (without `--confirm` the CLI waits for a confirmation).
8. **Redeliver an event:** `stripe events resend evt_…` → logged as
   `"result":"duplicate"`, nothing written.
9. **Late fees:** start the API with `STRIPE_FEE_RECONCILE_MINUTES=1` to
   see the fill-in run within a minute.
10. **Inspect** (no personal data in these tables):
    ```sql
    select entry_number, entry_type, currency, gross_amount, fee_amount, net_amount,
           settlement_currency, settlement_net_amount, cadence, external_transaction_id,
           adjusts_entry_id is not null as refund_of_donation, publication_status
      from treasury_entries order by entry_number;
    select id, type, status, attempts, last_error from stripe_events order by received_at;
    select id, status, currency, amount, canceled_at from stripe_subscriptions;
    ```

Automated tests don't call Stripe: the API suites use a Stripe double with
Stripe's own signature helper and an HTTP-recording client for the SDK
adapter; the Playwright suites run the API with `STRIPE_FIXTURE=1`
(scripted Checkout sessions, accepted only under `NODE_ENV=test`).

## 5. Operating it

- **Failed events:**
  `select id, type, attempts, last_error, received_at from stripe_events where status = 'failed';`
  Codes: `retry:charge_not_ready`, `retry:donation_not_recorded` (Stripe
  retries for up to 3 days and they resolve), `retry:unsupported_currency`
  (an account setting — §3.2), `error:…` (a bug or an outage; check the
  logs by event id). Stripe Dashboard → Webhooks → the event → **Resend**
  replays it safely (exactly once).
- **Refunds** are made in the Stripe Dashboard; the ledger follows from
  `charge.refunded`. Pending refunds are recorded once they succeed.
- **Disputes** are answered in the Stripe Dashboard (evidence). The ledger
  follows Stripe's money movements: "Payment disputed" when the funds are
  withdrawn (with Stripe's dispute fee), "Dispute won" when they're
  reinstated. A lost dispute simply keeps the negative adjustment.
- **Test-mode rows** (e.g. after a pre-launch test on production):
  ```bash
  npm run api:purge-test-donations                           # dry run: counts only
  npm run api:purge-test-donations -- --confirm --backup <fresh backup file>
  ```
  Deletes `livemode = false` entries (adjustments first), subscriptions and
  events in one transaction; refuses without a backup from the last 24 h.
- **Rotating secrets:** a new webhook signing secret (Dashboard → roll) or
  API key → update `api.env`, restart the API. A new `REVALIDATE_SECRET` →
  both services, restart both.
