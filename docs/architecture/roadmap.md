# Roadmap — v0.1 module by module, then v1.0

Status: **proposed** (2026-10-15). Architecture: [overview.md](./overview.md).
Schema and migration order: [data-model.md](./data-model.md). Estimates
are working hours for implementation, tests and the production release of
each module (one developer), assuming the open questions in §5 are
answered before the module starts; an unanswered question is built in its
safest form (usually: left out) and listed in the module's release record.

Legend: **v0.1** = this release line (the admin sidebar and the public
site as designed). **v1.0** = participant platform (accounts, profiles,
teams, participation, governance) — named here only so v0.1 leaves the
right seams (overview §7); nothing v1.0 is built ahead.

## 1. Already shipped (v0.1)

| Module | Migrations | Admin | Public |
|---|---|---|---|
| Owner sign-in, sessions, display name | 0000, 0005 | Login, Profile, user card | — |
| Directory: People, Organizations | 0001, 0002, 0004 | Lists, records, limits 10/5, Duplicate | — |
| Taxonomy (14 / 120 / 1105) | 0002, 0003 | Domains, Fields, Expertise (read-only) | — |
| Imports (taxonomy, directory) | 0003 | Imports page, Import Notion | — |
| Admin shell (Figma) | — | Sidebar, search, toasts, list toolbar | — |
| Donations (module 1, Stripe sandbox phase) | 0006 | — | `/donate` (Once / Monthly, card, Apple Pay, Google Pay, PayPal, SEPA in EUR), `/donate/thank-you`; figures from the database |
| Treasury (module 1b) | 0007, 0008 | Treasury list and record, supporting documents, Treasury import | `/treasury` and the expense and donation pages, from the database; sample data marked "Test" until go-live |
| Public site shells | — | — | Home, Documentation (live Notion), Waitlist, Feedback, Issue, Contribute (inert forms) |

## 2. Build order (v0.1)

Revised 2026-10-15 with the client's decisions (data ownership, admin
framework, Treasury answers).

| # | Module | Due | Hours | Depends on |
|---|---|---|---|---|
| 1 | **Donations end-to-end** — migration 0006 (`treasury_entries`, `stripe_events`, `stripe_subscriptions`), Stripe Checkout, webhooks, `/donate` and `/donate/thank-you` | **24 Oct** | 40 | — |
| 1b | **Treasury** — public Treasury page and entry details from native data, Notion Treasury importer (expenses), admin Treasury list and record, supporting documents (0007), background jobs (pg-boss: scheduled imports, fee reconciliation) | after 24 Oct | 40 | 1 |
| 2 | **Platform + Audit/History** — migration 0008 (`audit_events`, `managed_by`, limit triggers; `settings` already in 0006); History panel and Monitoring → History; **settings and feature flags, module modes and the cut-over action; module registry; config-driven list and record pages; People, Organizations and Taxonomy refactored onto them** | | 62 | 1b (jobs) |
| 3 | **CMS** — Home and Documentation imported into revisions (Notion-edited in v0.1), public site reads the database, admin list and read-only records with History | | 30 | 2 |
| 4 | **Feedback and issues** (+ AI triage) | | 32 | 2 |
| 5 | **Email foundation + Messages + Emails** | | 42 | 1b (jobs), Stalwart running |
| 6 | **Waitlist** | | 16 | 5 |
| 7 | **Services and access grants** | | 14 | 2 |
| 8 | **Accounts and roles** | | 26 | 2, 5 |
| 9 | **Technical dashboard** | | 12 | 1b, 5 |
| 10 | **Analytics** | | 8 | Q13 |
| 11 | People saved views | | 4 | Q9 |
| | **Total v0.1** | | **≈ 326** | |

Changes from the first version (≈ 302 h): module 1 is split so donations
ship end-to-end by 24 October (audit, jobs, limit triggers and documents
moved to 1b/2); module 2 gains the platform work (+52 h: settings, flags,
module modes and cut-over 10, registry 6, config-driven pages 22,
refactoring the built pages 12, limit triggers 2); CMS, Feedback and
Services get cheaper on the framework and because their records are edited
in Notion during v0.1 (the CMS rich-text editor, 18 h, moves to the CMS
cut-over in v1.0, §4).

Why this order: donations have the only external deadline. The platform
work comes next because every later module is a registry entry plus list
and record configs, and every record page shows History. CMS then removes
the last live Notion read from the public site. Email comes before the
Waitlist (confirmation email). Accounts and roles come once there is more
than one module worth delegating; until then the owner is the only admin
(Q8).

## 3. Modules in detail

### 1. Donations end-to-end (due 24 Oct, 40 h)

- **Scope:** migration 0006; Stripe Checkout (hosted) for one-off
  donations in EUR, USD or CHF — presets 2 / 5 / 10 / 20 / 50, Other,
  min 1, max 10,000, default currency from the environment (USD), the
  currency kept through the whole flow; monthly donations built **behind
  the `donations.monthly` flag (off)** with the customer-portal login link,
  no yearly; webhooks with signature check and exactly-once processing
  (`stripe_events`); each successful payment creates a **published native
  donation** ("Anonymous donation", review Not required, gross / fee / net
  from Stripe's balance transaction — fetched in the webhook, retried by
  Stripe if not ready yet); refunds as **negative refund entries** linked to
  the donation; on-demand revalidation of the public pages on every new
  entry (5-minute fallback); Stripe email receipts on; PayPal / SEPA rows
  behind `donations.extra_methods` (off, Q19). The `settings` table comes
  with migration 0006 (flags: a row overrides the environment default);
  its admin page and audit come with module 2.
- **Public pages:** `/donate` (Common pages p28–31: currency switch,
  Donations / Med. donation / Monthly donors stats — "Donors" hidden,
  "Monthly donors" = active subscriptions, shown only with the flag;
  Once / Monthly only with the flag; presets, Other, "Select an amount"
  warning; legal copy as approved, **policy links hidden** until real texts
  exist — no invented legal text) and `/donate/thank-you` (p33–34,
  "Donation sent" toast).
- **Tests:** database checks (signs, cadence, uniqueness, refund link);
  checkout validation (currency, min, max, decimals); webhook signature,
  redelivery, out-of-order, refund (full and partial), missing balance
  transaction; Playwright donate → Checkout redirect, cancel back with the
  same currency and amount, thank-you; a manual test-mode run with the
  Stripe CLI.
- **Breakdown:** schema + API 8 · Checkout + webhooks + refunds 14 ·
  monthly behind the flag 4 · donate + thank-you pages 8 · tests, deploy,
  Stripe dashboard setup 6.

### 1b. Treasury (40 h)

- **Public pages:** `/treasury` from native data (p11–14: currency switch,
  Med. donation and Expenses stats — **Balance and Sustainability hidden
  until Wise is connected**; Expenses / Donations pills; history; page-
  actions sheet), expense detail (p22–23), anonymous donation detail
  (p26–27); the static `presentationData.ts` is deleted.
- **Notion Treasury importer** (expenses): whole units → minor units, gross
  = net, fee 0, flagged; Notion's 10 expense types; `managed_by = notion`;
  on demand and scheduled. Today all 40 rows are demo → 0 imported.
- **Admin:** Treasury list and record on the existing components (synced
  fields read-only for Notion entries, "Managed in Notion" badge and link;
  donations read-only — they come from Stripe).
- **Supporting documents** (migration 0007): upload, list, download through
  the file-storage adapter.
- **Background jobs:** pg-boss in the API process — scheduled imports, fee
  reconciliation, the import runner moved off memory.
- **Breakdown:** public pages 12 · importer 6 · admin list/record 10 ·
  documents + storage 6 · jobs 6.
- **Built and released (2026-10-15, `a66f04c`; sample data and the
  full p11 page `07cf94f`):** all of the above. The currency switch drives the stats and the history
  (`?currency=`, default USD), with an "All currencies" choice that lists
  every currency (stats then stay in the default currency; amounts are
  never converted). Pending client answers are settings, off by default:
  `treasury.public_recipient_names` (Q3), `treasury.publish_unqualified`
  (Q25), `treasury.wise_connected` (Q22) and `treasury.donation_appeal`
  (the "Cry for donation" banner, switched by hand until Wise gives a
  Sustainability score — new, to confirm). The p11 search button opens a
  search of public text (descriptions, expense types, entry numbers;
  `?q=`), and each stat shows its "+2.1%" trend: the change from the same
  figure 30 days earlier. **Before go-live (owner, 2026-10-15):** production
  shows sample data marked as such — sample expenses tagged "Test", sample
  Balance and Sustainability figures with a note under the stats
  (`treasury.sample_figures`, until Wise), and Stripe sandbox donations
  tagged "Test" (`treasury.show_test_donations`, ignored with a live key);
  `api:seed-sample-treasury` adds the samples, `api:purge-sample-treasury`
  removes them all (run it at go-live). Left out of the frames for lack of
  data: the Amount, Location and Expertise filters, the expense's roadmap
  link, reactions and timeline (p22), and p23's Roadmap action. Supporting documents: owner
  only, PDF / PNG / JPEG ≤ 20 MB, private local disk (Q5 open). No admin
  create or delete of entries (expenses come from Notion, donations from
  Stripe).

### 2. Platform + Audit/History (62 h)

- **Migration 0008:** `audit_events`, `managed_by` on the built
  directory and taxonomy tables (backfilled from `notion_page_id`),
  relationship-limit constraint triggers.
- **Audit/History (10 h):** audit writes for every module built so far;
  History panel (admin p6, p9, p12) and Monitoring → History.
- **Settings, flags, modes, cut-over (10 h):** typed settings with
  environment defaults; owner settings page; module modes; the cut-over
  action (overview §2.1) with its checks (final import done, second dry run
  0 changes, backup taken).
- **Module registry (6 h):** sidebar, routes, permissions, mode and flags
  from one entry per module; "Coming soon" for modules not enabled.
- **Config-driven list and record pages (22 h):** columns, filters,
  sorts, views, property types (text, pills, pickers with limits, dates,
  chips), synced-field read-only rule and badge, right-panel actions,
  History panel.
- **Refactor People, Organizations, Taxonomy onto the framework (12 h)**,
  with the existing Playwright suite as the safety net (no visual change).
- **Limit triggers (2 h).**

### 3. CMS (30 h)

Migration 0009; Notion importer for the 10 real Documentation articles
and the Home page into `documents` + `content_revisions` (a new revision
only when the content changed — that is the History), on demand and
scheduled; public Home, Documentation and article history read from the
API with on-demand revalidation; admin Documentation list and read-only
document and Home records (Figma p5–p9 layout, "Managed in Notion"),
History panel. The rich-text editor (toolbar, Submit / Discard / Duplicate
as a draft) is built at the CMS cut-over (§4). Breakdown: schema + API 8 ·
importer 8 · public + revalidation 6 · admin pages 8.

### 4. Feedback and issues (32 h)

Migration 0010; the public composers persist (native records,
rate-limited, bot heuristics); admin list and record on the framework
(type, categories, status, scores, translation, AI note, decision
rationale, public summary, duplicate of, expertise) — Notion-made
submissions read-only for synced fields; AI triage job behind the provider
adapter; Notion importer (10 demo rows today → 0).

### 5. Email foundation + Messages + Emails (42 h)

Stalwart integration (SMTP out, JMAP in), `email_outbox` with retries,
migration 0014 (mailboxes, threads, messages, outbox); Messages inbox
(threads per mailbox, link to a person, status); Emails delivery log.
Prerequisite outside the code: Stalwart installed with SPF/DKIM/DMARC
(estimate excludes server setup, Q16).

### 6. Waitlist (16 h)

Migration 0011; the public form persists (native records); confirmation
email (double opt-in, Q17); admin list (status, confirmed, linked person,
export); unsubscribe link.

### 7. Services and access grants (14 h)

Migration 0012; Services and Access grants as framework configs (status
pills Planned / Invited / Active / Revoked / Expired, dates, person,
service; Notion records read-only for synced fields); the People "Access
grant" column and record row; Notion importer (14 + 20 demo rows today →
0), on demand and scheduled.

### 8. Accounts and roles (26 h)

Migration 0013; roles and permissions (overview §3.1) with one API guard;
Accounts page (list, invite, change role, deactivate); invitation and
password-reset emails; audit of every permission change.

### 9. Technical dashboard (12 h)

Health of API, database, jobs (queued / failed / dead), last backup,
Stripe webhook failures, Notion and email reachability, import schedules,
disk space; links to the import runs.

### 10. Analytics (8 h)

The chosen tool's script on the public site (with the privacy settings
the tool allows) and the admin page reading its stats API.

### 11. People saved views (4 h)

The view tabs (built, hidden) get their filters once the client defines
Sourcing, Discussions, Contributors, Collaborators and the "+3" views.

## 4. v1.0 (not built in v0.1)

**First: the cut-over to native data** (overview §2.1), one module at a
time, using the cut-over action built in module 2 — final import, second
dry run with 0 changes, backup, switch the mode, verify, archive the Notion
database. Work per module: about 2 h (run, verify, record), plus the
**CMS rich-text editor (18 h)**, which is only needed once the CMS is
native. After the last module the importers are switched off for good.

Then, in rough order, each its own design and estimate later:

1. **Participant accounts** — "Join the experiment" with the terms gate,
   email or OAuth (Google, Microsoft, Apple, Whatsapp), validation, sign-in,
   password reset, change email, delete account (personal data deleted,
   activity kept anonymous), terms/privacy update emails (Figma "Signup and
   signin", "Profile and account", Master p48–52).
2. **Profiles** — name or alias, picture, bio, gender, year of birth,
   nationalities, ranked expertise (≤ 10, the same limit and taxonomy as
   today), per-field visibility (Private / Approximate / Public),
   Participant 0 (the experiment AI).
3. **Teams and admin applications** — "Join admin" with the staged review
   (AI pre-qualification, moderation, expert review, superadmin validation,
   scores 0–10), team memberships reusing today's permission keys,
   superadmin level, promotion/demotion proposals, the "Welcome to X admin
   team" email.
4. **Named and recurring donor display** (opt-in) and Wise sync/payouts.
5. **Participation and moderation** — dailies (questions, answers, thought
   clusters, alignment / diversity), the moderation case queue (feedback,
   issues, superissues, applications, documentation), reviews with
   alignment / qualification / comment coefficients (0–10), public
   comments; the Statistics page.
6. **Governance** — roadmap items (linked from feedback and expenses),
   expense approval workflow (request → treasury validation), the
   Constitution's amendment process.

## 5. Open questions for the client

Grouped by module. Each is needed before the module it belongs to starts;
the number is referenced from overview.md and data-model.md.
Each question ends with the client's decision and its date, or *Waiting
for client*.

**General**

- **Q1 — Notion vs the admin as the editing tool.** After each module's
  import, is the admin the only place to edit (recommended: Notion becomes
  read-only history), or does Notion stay an editing tool with repeated
  imports (which overwrite admin edits)?
  **Decided 2026-10-15:** Notion is the editing tool in v0.1 for the Notion-backed modules (importers on demand and on a schedule); in v1.0 the database and admin are the only source and importers are off. Record-level `managed_by`, module modes and the cut-over procedure: overview §2.1.
- **Q8 — Admin roles.** Is v0.1 still owner-only, or do other people get
  admin access? If yes, is the team-based role list (overview §3.1) right? *Waiting for client.*
- **Q11 — Retention.** How long are kept: the audit log, waitlist entries,
  feedback submissions (and their personal data), messages, Stripe event
  ids, treasury documents (accounting law: often 10 years)? *Waiting for client.*
- **Q15 — Environments and releases.** Add a staging environment? Deploy
  tagged releases from `main` (production follows `develop` today)? *Waiting for client.*

**Treasury and donations (needed now)**

- **Q2 — Monthly donations** through Stripe subscriptions: yes or no?
  Yearly too (Notion has a Yearly cadence)?
  **Decided 2026-10-15:** Built behind the `donations.monthly` flag, off by default. No yearly donations.
- **Q3 — Recipients in public.** May an expense's recipient (person or
  organization name) be shown publicly, or only the description and tags? *Waiting for client.*
- **Q4 — Treasury refresh.** Every 5 minutes, or Figma's "every 4 hours"?
  **Decided 2026-10-15:** On-demand revalidation on every new or changed entry, plus a 5-minute fallback.
- **Q5 — Documents storage.** Same VPS (backed up off-site) or object
  storage, maximum size, retention. *Waiting for client.*
- **Q18 — Stripe account and settlement.** Account country; are EUR, USD and
  CHF each settled in their own currency (to Wise), or converted? *Waiting for client.*
- **Q19 — Payment methods.** Card (with Apple Pay / Google Pay), PayPal and
  SEPA as in Figma? SEPA is EUR only. *Waiting for client.*
- **Q20 — Refunds** as negative adjustment entries linked to the donation
  (recommended)?
  **Decided 2026-10-15:** Negative refund entries linked to the donation.
- **Q21 — Amounts.** Minimum and maximum per donation, presets (2 / 5 / 10 /
  20 / 50) for all currencies, default currency.
  **Decided 2026-10-15:** Presets 2 / 5 / 10 / 20 / 50, minimum 1, maximum 10,000; default currency configurable (USD).
- **Q22 — Balance and Sustainability** before Wise is connected: totals of
  published entries per currency, or hide those two stats?
  **Decided 2026-10-15:** Balance and Sustainability are hidden until Wise is connected.
- **Q23 — Notion amounts** are whole currency units (50 = USD 50)? Import
  old entries with gross = net and fee = 0?
  **Decided 2026-10-15:** Whole units; imported as gross = net, fee 0, and flagged.
- **Q24 — Expense categories:** Notion's 10 expense types, or Figma's
  expertise-style tags?
  **Decided 2026-10-15:** Notion's 10 expense types.
- **Q25 — Publication of unqualified expenses.** Figma lists unqualified
  expenses publicly ("Not qualified yet") — publish every transaction with
  amount and date, and the description only once qualified (recommended,
  matches Figma)? Or publish only qualified entries? *Waiting for client.*
- **Q26 — Donors.** No donor names or countries (anonymous only, Figma
  p26–27), and "Donors" / "Monthly donors" counted from Stripe without
  storing donor data?
  **Decided 2026-10-15:** Anonymous donors only; "Donors" hidden; "Monthly donors" = active subscriptions.
- **Q27 — Receipts and policies.** Enable Stripe email receipts? Who writes
  the Privacy Policy and the Donation & Refund Policy pages the donate copy
  links to?
  **Decided 2026-10-15:** Stripe email receipts; the policy links stay hidden until real texts exist — no legal text is ever invented.
- **Q28 — Fees.** Is `net = gross − fee` (fee a positive cost) right for
  donations and expenses, Stripe and Wise fees included? *Waiting for client.*

**CMS**

- **Q29 — Documentation expertise.** Notion's Documentation "Expertise" is
  a separate list of 38 labels, not the taxonomy. Map them to taxonomy
  items by name (some won't match), or keep a separate documentation tag
  list? *Waiting for client.*
- **Q30 — Home page content.** Is the Home page one rich-text page (as in
  Notion today, admin p5–p6), or will it get structured blocks (stats,
  buttons) the editor must handle? *Waiting for client.*

**Feedback and issues**

- **Q6 — Status list.** Notion has Discarded, Roadmap item, Archived (and
  empty = new). Is that the full list, and is it the same for feedback and
  issues? *Waiting for client.*
- **Q7 — Scores.** Ranges and meaning of the AI significance score, the
  human significance score and the bot score; who sets the human one. *Waiting for client.*
- **Q12 — AI provider** for translation and triage (and where its data may
  be processed). *Waiting for client.*
- **Q31 — Public summaries.** Are decisions on feedback ever shown
  publicly (e.g. "Roadmap item"), or is everything admin-only in v0.1? *Waiting for client.*

**Waitlist, Messages, Emails**

- **Q16 — Email server.** Who installs and runs Stalwart; the final
  addresses (contribute@, waitlist@, donations@)? *Waiting for client.*
- **Q17 — Waitlist confirmation** by double opt-in email (recommended)? And
  should a waitlist entry be linked to an existing person automatically by
  email, or only by hand? *Waiting for client.*
- **Q32 — Messages scope.** Read and triage only, or also reply from the
  admin? *Waiting for client.*

**Services, access grants, analytics, monitoring**

- **Q10 — Permission levels.** Notion stores free text; is there a fixed
  list (e.g. Viewer, Editor, Admin, Owner) per service? *Waiting for client.*
- **Q13 — Analytics tool:** Plausible or Matomo (the documentation and
  older records disagree)? *Waiting for client.*
- **Q14 — Error tracking:** add self-hosted GlitchTip, or logs only? *Waiting for client.*

**Designs without a module yet**

- **Q34 — Information notes and Constitution.** The public designs show an
  Information notes (News) section ("v0.1 website delivery · April 6") and a
  static Constitution page; neither is in the admin sidebar. Are they v0.1
  pages? If yes they are CMS documents of new kinds (data-model §5.1), not
  new modules. *Waiting for client.*
- **Q35 — "Cloud".** The admin sidebar's text layer has a hidden "Cloud"
  item under Other. What is it, and is it v0.1? *Waiting for client.*
- **Q36 — Energy and consent.** The designs show a per-page energy sheet
  (Wh, CO₂, data, renewables, ~50 metrics) and a "Data collection" consent
  banner. v0.1 or later? The consent banner depends on the analytics tool
  (Q13: a cookieless tool needs none). *Waiting for client.*
- **Q37 — Expense links.** Figma links expenses to a roadmap item
  ("Part of Roadmap Initiation") and shows tags like Bug / Security /
  Platform. Roadmap items don't exist in v0.1 — confirm this is v1.0. *Waiting for client.*

**Directory**

- **Q9 — View tab definitions** for People (Sourcing, Discussions,
  Contributors, Collaborators, "+3"). *Waiting for client.*
- **Q33 — Required fields.** Which Notion properties carry the `*`
  ("required for completeness") in each database — read from the schema
  today; is that the rule to keep? *Waiting for client.*
