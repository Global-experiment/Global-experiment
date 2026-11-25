# Roadmap — what is built, and the order of work

Status: **current** (updated 2026-11-19, OPS-104). First written on
2026-10-15. Architecture: [overview.md](./overview.md). Schema and
migrations: [data-model.md](./data-model.md).

This document lists what is built and the order of work agreed with the
client. It gives no hour estimates. It gives no dates except those the
client agreed.

An open question (§5) is answered before the module it belongs to starts.
An unanswered question is built in its safest form (usually: left out), and
the module's release record lists it.

Legend:

- **v0.1:** the admin sidebar and the public site as designed.
- **v1.0:** the participant platform (accounts, profiles, teams,
  participation, governance).

## 1. Built and in production

| Module or change | Migrations | Admin | Public |
|---|---|---|---|
| Sign-in, sessions, display name | 0000, 0005 | Login, Profile, user card | — |
| Directory: People, Organizations | 0001, 0002, 0004, 0010, 0011 | Lists, records, link limits, Duplicate, contact channels, follow-ups | — |
| Taxonomy (domains, fields, expertise, teams) | 0002, 0003 | Domains, Fields, Expertise | — |
| Donations (Stripe) | 0006 | — | `/donate`, `/donate/thank-you`; figures from the database |
| Treasury | 0006–0008 | Treasury list and record, review, publication | `/treasury`, expense and donation pages; sample data marked "Test" until go-live |
| History, comments, views, archive | 0009, 0010 | History panel on every record, Monitoring → History | — |
| Accounts and roles, Services and Permissions (Delivery 2) | 0012, 0013 | Accounts, Profile settings, Services, Permissions | — |
| The client's first feedback batch (Delivery 4) | 0014 | Invitation links, account description and expertise, service categories, permission names | — |
| Archive only (Delivery 6, ADR 017) | 0015 | No permanent delete anywhere; comments and pictures archived | — |
| Home and Documentation, native (Delivery 6, ADR 020) | 0016 | Home editor, Documentation list and record, versions (view, compare, restore), images | Home, Documentation, article history |
| People and Organizations CSV import (ADR 016) | — | Import CSV, Imports page, reports | — |
| Expense detail page (OPS-155, ADR 021) | 0017 | The Rootadmin edits every business field of an expense; supporting documents removed from the platform | Expense pages follow the edits |
| Field validation when a field is left (OPS-70) | — | Every edit form; rules shared by the site and the API | Join and set-password forms |
| Permission rules across modules (OPS-158) | — | Service-level checks, refusals recorded in History, Archive hidden where the role can't publish | — |
| An invited account can be deactivated (OPS-158) | 0018 | Accounts | — |
| Contributor guide and icon command | — | `CONTRIBUTING.md`, `AGENTS.md`, `npm run icons:add` (official Material Symbols, cleaned) | — |

Public site shells, not connected yet: Waitlist, Send feedback, Report
issue, Contribute.

**On hold:** People and Organizations. Their data, tables and migrations
don't change until the client lifts the hold.

## 2. Order of work (agreed)

1. **Feedbacks and issues, v0.1, with automatic qualification.**
   - The public composers save submissions.
   - The admin lists them and qualifies each one (type, categories, status,
     significance, routing to expertise). Qualification is suggested
     automatically, and a person confirms it.
   - Needs first: the status list (Q6), the scores (Q7), the provider for
     the automatic qualification (Q12) and public summaries (Q31).
   - The public write endpoint gets rate limits, size limits and bot
     controls.
2. **Information notes.** News posts on the public site, edited in the
   admin as CMS documents of a new kind (data-model §5), with versions,
   publication and History like Documentation (Q34).
3. **Teams and governance,** in five phases (§4).
4. **Visibility,** its own sprint later. Scoped when it starts.

Other v0.1 modules (Waitlist, Messages and Emails, Technical dashboard,
Analytics, People saved views) are not scheduled yet. Each joins the
admin menu when it goes live (ADR 024).

## 3. Built modules: notes

What changed from the first plan, kept short. The release records hold
the details.

- **Data ownership:** the first plan kept Notion as the editing tool in
  v0.1, with importers and a cut-over per module.
  - Only People and Organizations take outside data, by CSV (ADR 016).
  - The Notion imports were removed (OPS-154).
  - Home and Documentation were imported once and are edited in the admin
    (ADR 020).
  - Nothing reads Notion at runtime, and no cut-over is left to do.
- **Treasury:**
  - Expenses are created and edited in the admin; donations come from
    Stripe.
  - Pending client answers are settings, off by default (recipient names
    in public Q3, publishing unqualified expenses Q25, Wise Q22).
  - Supporting documents left the platform (ADR 021).
- **History:** every write records one event in the same transaction.
  Refusals are recorded too.
- **Accounts:**
  - One-time links instead of emails (decision 13).
  - Invitation links that anyone can use once (decision 018).
  - Several Rootadmins, never none.
- **Services and Permissions:** granting, changing and revoking access is
  one event, shown on the account, the service and the person.
- **CMS:** the editor shipped with the module (ADR 019). Every save is a
  revision; published versions are kept and can be restored.

## 4. Teams and governance

One identity for participants and admins
(ADR [022](./decisions/022-one-identity-for-participants-and-admins.md)).
The client's decisions for this work:

- six teams from day one;
- per team, the roles Admin, Superadmin and Auditor (read-only), with
  Rootadmins above all teams;
- permissions per team, with individual additions and removals on top;
- members appear under their team role, and identity reveals are recorded;
- peer review once a team is large enough;
- unlimited undo, and nothing deleted.

The phases run in order:

0. **Hardening.**
   - History for sign-ins and refusals.
   - History queries that stay fast as the log grows.
   - Indexes for the account and History lists.
   - Database guards for archive-only.
   - No access for accounts without a role or team.
   - Test foundations: record-level permission tests, a History
     completeness check, concurrency tests on PostgreSQL, browser tests in
     CI.
   - Merging the shared field rules into one package.
1. **Foundation.**
   - Teams, memberships and per-team permissions.
   - The permission engine: route, record and list checks.
   - Moving today's accounts and roles to teams without losing access.
   - Memberships from expertise.
   - Pseudonyms and identity reveal.
   - Team pages.
2. **Moderation tools.**
   - Undo of any recorded change.
   - An activity overview of every member.
   - Bulk archive and restore.
   - Direct demotion of Admins; warnings.
3. **Review engine.**
   - Cases, ratings 0–10, unilateral and peer-review modes, and conflicts
     of interest.
   - Appeals.
   - Promotion and demotion cases.
   - Storage for future scores, with formula versions.
4. **Task assignment.**
   - Members receive cases at random.
   - Fair rotation, weighted by expertise.
   - Draws that can be re-run and checked.

Mobile views are out of scope for this work. People and Organizations get
their team rules once the hold ends.

## 5. Open questions for the client

Grouped by module. Each is needed before the module it belongs to starts;
the number is referenced from overview.md and data-model.md.
Each question ends with the client's decision and its date, or _Waiting
for client_.

**General**

- **Q1 — Notion vs the admin as the editing tool.** After each module's
  import, is the admin the only place to edit (recommended: Notion becomes
  read-only history), or does Notion stay an editing tool with repeated
  imports (which overwrite admin edits)?
  **Decided 2026-10-15:** Notion is the editing tool in v0.1 for the Notion-backed modules. **Changed since:** only People and Organizations take outside data, by CSV (ADR 016); everything else is edited in the admin, and nothing reads Notion at runtime.
- **Q8 — Admin roles.** Is v0.1 still owner-only, or do other people get
  admin access? If yes, is the team-based role list (overview §3.1) right?
  **Decided:** fixed roles today (overview §3.1). Teams with Admin, Superadmin and Auditor replace them in the teams and governance work (§4).
- **Q11 — Retention.** How long are kept: the audit log, waitlist entries,
  feedback submissions (and their personal data), messages, Stripe event
  ids? _Waiting for client._ (Treasury documents: kept by the accountants
  outside the platform since OPS-155, ADR 021.)
- **Q15 — Environments and releases.** Add a staging environment? Deploy
  tagged releases from `main` (production follows `develop` today)? _Waiting for client._

**Treasury and donations**

- **Q2 — Monthly donations** through Stripe subscriptions: yes or no?
  Yearly too (Notion has a Yearly cadence)?
  **Decided 2026-10-15:** Built behind the `donations.monthly` flag, off by default. No yearly donations.
- **Q3 — Recipients in public.** May an expense's recipient (person or
  organization name) be shown publicly, or only the description and tags? _Waiting for client._
- **Q4 — Treasury refresh.** Every 5 minutes, or Figma's "every 4 hours"?
  **Decided 2026-10-15:** On-demand revalidation on every new or changed entry, plus a 5-minute fallback.
- **Q5 — Documents storage.** Same server or object storage, maximum size,
  retention. **Closed by OPS-155:** supporting documents left the platform (ADR 021).
- **Q18 — Stripe account and settlement.** Account country; are EUR, USD and
  CHF each settled in their own currency (to Wise), or converted? _Waiting for client._
- **Q19 — Payment methods.** Card (with Apple Pay / Google Pay), PayPal and
  SEPA as in Figma? SEPA is EUR only. _Waiting for client._
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
  matches Figma)? Or publish only qualified entries? _Waiting for client._
- **Q26 — Donors.** No donor names or countries (anonymous only, Figma
  p26–27), and "Donors" / "Monthly donors" counted from Stripe without
  storing donor data?
  **Decided 2026-10-15:** Anonymous donors only; "Donors" hidden; "Monthly donors" = active subscriptions.
- **Q27 — Receipts and policies.** Enable Stripe email receipts? Who writes
  the Privacy Policy and the Donation & Refund Policy pages the donate copy
  links to?
  **Decided 2026-10-15:** Stripe email receipts; the policy links stay hidden until real texts exist — no legal text is ever invented.
- **Q28 — Fees.** Is `net = gross − fee` (fee a positive cost) right for
  donations and expenses, Stripe and Wise fees included? _Waiting for client._

**CMS and Information notes**

- **Q29 — Documentation expertise.** Notion's Documentation "Expertise" is
  a separate list of 38 labels, not the taxonomy. Map them to taxonomy
  items by name (some won't match), or keep a separate documentation tag
  list? _Waiting for client._ (Since Delivery 6 the tags are kept as free
  text on each revision, as in Notion.)
- **Q30 — Home page content.** Is the Home page one rich-text page (as in
  Notion today, admin p5–p6), or will it get structured blocks (stats,
  buttons) the editor must handle? _Waiting for client._
- **Q34 — Information notes and Constitution.** The public designs show an
  Information notes (News) section and a static Constitution page; neither
  is in the admin sidebar.
  **Decided:** Information notes come after Feedbacks and issues (§2), as CMS documents of a new kind. The Constitution page: _Waiting for client._

**Feedbacks and issues (next)**

- **Q6 — Status list.** Notion has Discarded, Roadmap item, Archived (and
  empty = new). Is that the full list, and is it the same for feedback and
  issues? _Waiting for client._
- **Q7 — Scores.** Ranges and meaning of the AI significance score, the
  human significance score and the bot score; who sets the human one. _Waiting for client._
- **Q12 — AI provider** for translation and automatic qualification (and
  where its data may be processed). _Waiting for client._
- **Q31 — Public summaries.** Are decisions on feedback ever shown
  publicly (e.g. "Roadmap item"), or is everything admin-only in v0.1? _Waiting for client._

**Waitlist, Messages, Emails**

- **Q16 — Email server.** Who installs and runs Stalwart; the final
  addresses (contribute@, waitlist@, donations@)? _Waiting for client._
- **Q17 — Waitlist confirmation** by double opt-in email (recommended)? And
  should a waitlist entry be linked to an existing person automatically by
  email, or only by hand? _Waiting for client._
- **Q32 — Messages scope.** Read and triage only, or also reply from the
  admin? _Waiting for client._

**Services, access grants, analytics, monitoring**

- **Q10 — Permission levels.** Notion stores free text; is there a fixed
  list (e.g. Viewer, Editor, Admin, Owner) per service? _Waiting for client._
- **Q13 — Analytics tool:** Plausible or Matomo (the documentation and
  older records disagree)? _Waiting for client._
- **Q14 — Error tracking:** add self-hosted GlitchTip, or logs only? _Waiting for client._

**Designs without a module yet**

- **Q35 — "Cloud".** The admin sidebar's text layer has a hidden "Cloud"
  item under Other. What is it, and is it v0.1? _Waiting for client._
- **Q36 — Energy and consent.** The designs show a per-page energy sheet
  (Wh, CO₂, data, renewables, ~50 metrics) and a "Data collection" consent
  banner. v0.1 or later? The consent banner depends on the analytics tool
  (Q13: a cookieless tool needs none). _Waiting for client._
- **Q37 — Expense links.** Figma links expenses to a roadmap item
  ("Part of Roadmap Initiation") and shows tags like Bug / Security /
  Platform. Roadmap items don't exist in v0.1 — confirm this is v1.0. _Waiting for client._

**Directory (on hold)**

- **Q9 — View tab definitions** for People (Sourcing, Discussions,
  Contributors, Collaborators, "+3"). _Waiting for client._
- **Q33 — Required fields.** Which Notion properties carry the `*`
  ("required for completeness") in each database — read from the schema
  today; is that the rule to keep? _Waiting for client._
