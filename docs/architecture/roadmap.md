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
| Public site shells | — | — | Home, Documentation (live Notion), Treasury / Donate (static examples), Waitlist, Feedback, Issue, Contribute (inert forms) |

## 2. Build order (v0.1)

| # | Module | Due | Hours | Depends on |
|---|---|---|---|---|
| 1 | **Treasury + Stripe donations** (part A) | **24 Oct** | 62 | Foundations below (built inside it) |
| 1b | Treasury part B (documents, History panel on entries) | after 24 Oct | 18 | 1 |
| 2 | **Audit / History** (panel on every record + Monitoring → History) | | 10 | 1 (audit table ships with 1) |
| 3 | **CMS** (Home, Documentation, editor, revisions) | | 48 | 2 |
| 4 | **Feedback and issues** (+ AI triage) | | 36 | jobs (1), 2 |
| 5 | **Email foundation + Messages + Emails** | | 42 | jobs (1), Stalwart running |
| 6 | **Waitlist** | | 16 | 5 |
| 7 | **Services and access grants** | | 20 | 2 |
| 8 | **Accounts and roles** | | 26 | 2, 5 (invitation / reset emails) |
| 9 | **Technical dashboard** | | 12 | 1, 5 |
| 10 | **Analytics** | | 8 | Q13 |
| 11 | People saved views (Sourcing, Discussions, …) | | 4 | Q9 |
| | **Total v0.1** | | **≈ 302** | |

Why this order: Treasury has the only external deadline. Audit/History is
cross-cutting and cheap once its table exists, and every later record page
shows the History panel. CMS removes the last live Notion dependency on the
public site. Feedback and Waitlist turn today's inert public forms into
real ones, Email first because the Waitlist needs a confirmation email.
Accounts and roles come once there is more than one module worth
delegating; until then the owner is the only admin (Q8).

## 3. Modules in detail

### 1. Treasury + Stripe donations — part A (due 24 Oct, 62 h)

- **Scope:** migrations 0006 (audit, relation-limit triggers) and 0007
  (treasury); Treasury API (admin CRUD, review, publication, public
  summary and entries); Stripe Checkout (one-off; monthly only if Q2) and
  webhooks (signature, exactly-once, refunds as adjustment entries, fee
  reconciliation job); pg-boss job runner; Notion Treasury importer (the
  40 Notion rows are all demo today → 0 imported, reported); delete the
  static `presentationData.ts`.
- **Admin pages:** Admin → Treasury list (the People list pattern —
  admin-desktop p2–p4, p10–p11: search, filters, sort, columns, Import
  Notion) and the entry record (p12 pattern: properties, pills for type /
  review / publication, recipient picker, right panel with Number, Discard,
  Duplicate, Submit).
- **Public pages:** `/treasury` (Common pages p11–14: currency switch,
  stats, Expenses/Donations pills, history, "Cry for donation" banner,
  page-actions sheet), expense detail (p22–23), donation detail —
  anonymous only (p26–27), `/donate` (p28–32: currency, presets, Other,
  amount warning, payment rows, legal copy), `/donate/thank-you` (p33–34,
  "Donation sent" toast).
- **Tests:** database checks (signs, recipient rule, publication rule,
  uniqueness); Checkout validation; webhook signature, redelivery,
  out-of-order, partial refund, missing fee; importer plan; public API
  returns published data only; Playwright donate → Checkout redirect,
  thank-you, treasury lists; manual test-mode run with the Stripe CLI.
- **Breakdown:** schema + API 14 · Stripe + jobs 14 · public pages 14 ·
  admin list/record 10 · importer 4 · tests, deploy, Stripe dashboard 6.

### 1b. Treasury part B (18 h)

Supporting documents (upload, list, download — file storage adapter),
History panel on entries, the Expenses column and record row on People
and Organizations. Wise is **not** included (v0.1 only if asked; v1.0
payouts).

### 2. Audit / History (10 h)

History panel (admin p6, p9, p12: actor, role, action, time, field diffs,
added/removed chips) on People, Organizations, Treasury, and every later
record; Monitoring → History page (all events, filters by module, actor,
date). Audit writes for the already-built modules (People, Organizations,
imports). Tests: one event per change, none for a rolled-back change,
diffs exclude secrets.

### 3. CMS (48 h)

Migration 0008; block content model (heading / text / bulleted and
numbered lists / links — the editor toolbar of admin p6 and p9);
revisions; Home editor (p5–p6) and Documentation list + document editor
(p7–p9: Title, Expertise ≤ 10, Slug, Status pills Published / Draft /
Unpublished / Archived, Display order, Number, Duplicate as a draft);
public Home, Documentation and article history read from the API with
revalidation on publish; Notion importer for the 10 real articles and the
Home page. Breakdown: schema + API 10 · editor 16 · admin pages 10 ·
public + revalidation 6 · importer 6.

### 4. Feedback and issues (36 h)

Migration 0009; the public composers persist (rate-limited, bot
heuristics); admin list and record (type, categories, status, scores,
translation, AI note, decision rationale, public summary, duplicate of,
expertise); AI triage job behind the provider adapter (translation,
significance, note, bot score); Notion importer (10 demo rows today → 0).

### 5. Email foundation + Messages + Emails (42 h)

Stalwart integration (SMTP out, JMAP in), `email_outbox` with retries,
migration 0013 (mailboxes, threads, messages, outbox); Messages inbox
(threads per mailbox, link to a person, status); Emails delivery log.
Prerequisite outside the code: Stalwart installed with SPF/DKIM/DMARC
(estimate excludes server setup, Q16).

### 6. Waitlist (16 h)

Migration 0010; the public form persists; confirmation email (double
opt-in, Q17); admin list (status, confirmed, linked person, export);
unsubscribe link.

### 7. Services and access grants (20 h)

Migration 0011; Services list/record, Access grants list/record (status
pills Planned / Invited / Active / Revoked / Expired, dates, person,
service); the People "Access grant" column and record row; Notion
importer (14 + 20 demo rows today → 0).

### 8. Accounts and roles (26 h)

Migration 0012; roles and permissions (overview §3.1) with one API guard;
Accounts page (list, invite, change role, deactivate); invitation and
password-reset emails; audit of every permission change.

### 9. Technical dashboard (12 h)

Health of API, database, jobs (queued / failed / dead), last backup,
Stripe webhook failures, Notion and email reachability, disk space;
links to the import runs.

### 10. Analytics (8 h)

The chosen tool's script on the public site (with the privacy settings
the tool allows) and the admin page reading its stats API.

### 11. People saved views (4 h)

The view tabs (built, hidden) get their filters once the client defines
Sourcing, Discussions, Contributors, Collaborators and the "+3" views.

## 4. v1.0 (not built in v0.1)

Rough order, each its own design and estimate later:

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

**General**

- **Q1 — Notion vs the admin as the editing tool.** After each module's
  import, is the admin the only place to edit (recommended: Notion becomes
  read-only history), or does Notion stay an editing tool with repeated
  imports (which overwrite admin edits)?
- **Q8 — Admin roles.** Is v0.1 still owner-only, or do other people get
  admin access? If yes, is the team-based role list (overview §3.1) right?
- **Q11 — Retention.** How long are kept: the audit log, waitlist entries,
  feedback submissions (and their personal data), messages, Stripe event
  ids, treasury documents (accounting law: often 10 years)?
- **Q15 — Environments and releases.** Add a staging environment? Deploy
  tagged releases from `main` (production follows `develop` today)?

**Treasury and donations (needed now)**

- **Q2 — Monthly donations** through Stripe subscriptions: yes or no?
  Yearly too (Notion has a Yearly cadence)?
- **Q3 — Recipients in public.** May an expense's recipient (person or
  organization name) be shown publicly, or only the description and tags?
- **Q4 — Treasury refresh.** Every 5 minutes, or Figma's "every 4 hours"?
- **Q5 — Documents storage.** Same VPS (backed up off-site) or object
  storage, maximum size, retention.
- **Q18 — Stripe account and settlement.** Account country; are EUR, USD and
  CHF each settled in their own currency (to Wise), or converted?
- **Q19 — Payment methods.** Card (with Apple Pay / Google Pay), PayPal and
  SEPA as in Figma? SEPA is EUR only.
- **Q20 — Refunds** as negative adjustment entries linked to the donation
  (recommended)?
- **Q21 — Amounts.** Minimum and maximum per donation, presets (2 / 5 / 10 /
  20 / 50) for all currencies, default currency.
- **Q22 — Balance and Sustainability** before Wise is connected: totals of
  published entries per currency, or hide those two stats?
- **Q23 — Notion amounts** are whole currency units (50 = USD 50)? Import
  old entries with gross = net and fee = 0?
- **Q24 — Expense categories:** Notion's 10 expense types, or Figma's
  expertise-style tags?
- **Q25 — Publication of unqualified expenses.** Figma lists unqualified
  expenses publicly ("Not qualified yet") — publish every transaction with
  amount and date, and the description only once qualified (recommended,
  matches Figma)? Or publish only qualified entries?
- **Q26 — Donors.** No donor names or countries (anonymous only, Figma
  p26–27), and "Donors" / "Monthly donors" counted from Stripe without
  storing donor data?
- **Q27 — Receipts and policies.** Enable Stripe email receipts? Who writes
  the Privacy Policy and the Donation & Refund Policy pages the donate copy
  links to?
- **Q28 — Fees.** Is `net = gross − fee` (fee a positive cost) right for
  donations and expenses, Stripe and Wise fees included?

**CMS**

- **Q29 — Documentation expertise.** Notion's Documentation "Expertise" is
  a separate list of 38 labels, not the taxonomy. Map them to taxonomy
  items by name (some won't match), or keep a separate documentation tag
  list?
- **Q30 — Home page content.** Is the Home page one rich-text page (as in
  Notion today, admin p5–p6), or will it get structured blocks (stats,
  buttons) the editor must handle?

**Feedback and issues**

- **Q6 — Status list.** Notion has Discarded, Roadmap item, Archived (and
  empty = new). Is that the full list, and is it the same for feedback and
  issues?
- **Q7 — Scores.** Ranges and meaning of the AI significance score, the
  human significance score and the bot score; who sets the human one.
- **Q12 — AI provider** for translation and triage (and where its data may
  be processed).
- **Q31 — Public summaries.** Are decisions on feedback ever shown
  publicly (e.g. "Roadmap item"), or is everything admin-only in v0.1?

**Waitlist, Messages, Emails**

- **Q16 — Email server.** Who installs and runs Stalwart; the final
  addresses (contribute@, waitlist@, donations@)?
- **Q17 — Waitlist confirmation** by double opt-in email (recommended)? And
  should a waitlist entry be linked to an existing person automatically by
  email, or only by hand?
- **Q32 — Messages scope.** Read and triage only, or also reply from the
  admin?

**Services, access grants, analytics, monitoring**

- **Q10 — Permission levels.** Notion stores free text; is there a fixed
  list (e.g. Viewer, Editor, Admin, Owner) per service?
- **Q13 — Analytics tool:** Plausible or Matomo (the documentation and
  older records disagree)?
- **Q14 — Error tracking:** add self-hosted GlitchTip, or logs only?

**Designs without a module yet**

- **Q34 — Information notes and Constitution.** The public designs show an
  Information notes (News) section ("v0.1 website delivery · April 6") and a
  static Constitution page; neither is in the admin sidebar. Are they v0.1
  pages? If yes they are CMS documents of new kinds (data-model §5.1), not
  new modules.
- **Q35 — "Cloud".** The admin sidebar's text layer has a hidden "Cloud"
  item under Other. What is it, and is it v0.1?
- **Q36 — Energy and consent.** The designs show a per-page energy sheet
  (Wh, CO₂, data, renewables, ~50 metrics) and a "Data collection" consent
  banner. v0.1 or later? The consent banner depends on the analytics tool
  (Q13: a cookieless tool needs none).
- **Q37 — Expense links.** Figma links expenses to a roadmap item
  ("Part of Roadmap Initiation") and shows tags like Bug / Security /
  Platform. Roadmap items don't exist in v0.1 — confirm this is v1.0.

**Directory**

- **Q9 — View tab definitions** for People (Sourcing, Discussions,
  Contributors, Collaborators, "+3").
- **Q33 — Required fields.** Which Notion properties carry the `*`
  ("required for completeness") in each database — read from the schema
  today; is that the rule to keep?
