# Release — Candide's first feedback batch (Delivery 4, 2026-11-03)

**Status: run on 2026-11-02 at 22:11 UTC (2026-11-03 in the client's
morning).** Decisions:
[017 archive only](../architecture/decisions/017-archive-only.md),
[018 invitation links and accounts](../architecture/decisions/018-invitation-links-and-accounts.md),
[016 imports](../architecture/decisions/016-imports-csv-only-for-people-and-organizations.md)
(OPS-153, OPS-154). Client note:
[2026-11-03-feedback-batch-1](../releases/2026-11-03-feedback-batch-1.md).
**Migration 0014** (`0014_feedback_batch_1`), rehearsed on a copy of
production.

**What ships:** OPS-8, 128, 130, 135, 136, 138, 141, 142, 144, 147, 148,
149, 151, 153 and 154 — invitation links (no role until a Rootadmin gives
one), description and expertise on accounts and the profile, no note and no
People link on accounts, permission field order and automatic names, one
History event per grant, several category tags per service, Responsible
account replaced by Owner permissions, no permanent delete anywhere, CSV
import that skips unknown values with a warning (mapping or skipping each
one) and accepts Notion's links and "Other", the Notion import removed,
Treasury filters below the stats, Share's check glyph in the admin.

## Steps

1. **CI** green on the pushed commit.
2. **Pre-flight:** `ge-security-check` (all checks pass, or the release
   stops).
3. **Backup** with `o-backup.sh`: `pg_dump`, `api.env` copy, SHA-256 on the
   server and on the owner's computer (identical).
4. **Release** with `u-release.sh`: stops unless the only new migration is
   `0014_feedback_batch_1.sql`; counts, roles and a fingerprint of the
   client's 24 imported records (count and md5, nothing else printed)
   before and after; stop both services, `git pull --ff-only`, `npm ci`,
   both builds, `db:migrate`, `chown -R globalexp:globalexp .next`, clear
   the data cache, start, health checks; lists the ignored Notion variables
   still in `api.env` (names only).
5. **Checks** without writing data (below).

## What migration 0014 changes in the data

Counted on a copy of production before it was written (client decisions of
2026-11-03):

- `services.responsible_admin_id`: 5 of 8 services (Candide on Cloudflare,
  Figma, GitHub, Hetzner, Stripe). Cloudflare and GitHub already had an
  Owner permission; an **Active Owner permission** was added for Figma,
  Hetzner and Stripe, each with a History event, before the column was
  dropped.
- `services.category_key`: 7 of 8; each became the service's first tag.
- `admin_users.note` and `admin_users.person_id`: no values; dropped.
- Every permission is named "Service / Account / Permission level".
- `contact_channels` += Other (OPS-153).

## Server variables now ignored

Left in `/etc/global-experiment/api.env` as the client asked; the API no
longer reads them and they can be removed later:

- `NOTION_DOMAINS_DB_ID`, `NOTION_FIELDS_DB_ID`, `NOTION_EXPERTISE_DB_ID`,
  `NOTION_TREASURY_DB_ID` (since Delivery 3)
- `NOTION_PEOPLE_DB_ID`, `NOTION_ORGANIZATIONS_DB_ID` (since this release,
  OPS-154)

`IMPORT_SCHEDULE_DIRECTORY` was not set. `NOTION_API_KEY` is still used
(the public Home and Documentation pages).

## Unused permission keys

Left in `admin_permissions` and the role matrix as the client asked, for the
later cleanup with the teams and memberships model: every `*.delete` key
(nothing is deleted since OPS-147), every `*.import` key, and
`directory.import` (the Notion import, OPS-154).

## Rollback

Migration 0014 drops columns, so a rollback restores the database: stop
both services; restore `ge-prod-20261102-221110.dump` (below) with
`pg_restore --clean`; `git checkout d6e7a1d`, `npm ci`, both builds,
`chown`; start. Anything written after the release would be lost.

## Record of the run — 2026-11-02 (UTC)

| Step | Result |
|---|---|
| CI | `ce40aa8` on develop (client repo): lint, typecheck, tests, builds, migrations, PostgreSQL suite — success (run 41533874255). |
| Pre-flight | All checks passed. |
| Backup | `ge-prod-20261102-221110.dump`, 404,824 bytes, SHA-256 `83d405fb04cc2c5672392b2f6f3a32e202c995fb0f217ea935007462caa2a594`; copied to `ge-db-backups`, hash identical. |
| Release | Stopped 22:11:40, up 22:12:22 (**42 seconds** offline); `d6e7a1d..ce40aa8`; builds OK; migration 0014 applied (15 migrations); `.next` owned by `globalexp`; both services active; API health 200. |
| Data | Before → after: people 28 → 28, organizations 2 → 2, Treasury entries 20 → 20, services 8 → 8, accounts 6 → 6 (roles unchanged: 3 Rootadmin, 3 Treasury), permissions 7 → 10 (the 3 Owner permissions), contact channels 9 → 10, History events 96 → 99, import runs 6 → 6. Every permission named; 7 category tags; 0 invitation links; the 4 dropped columns gone. Same as the rehearsal. |
| Client's import | The 24 records of the CSV import of 2026-10-30, with their expertise, organizations and channels: same count and same fingerprint before and after (`d7590589f86ac549532a013af69bbc9a`) — unchanged. |
| Public | Home, Documentation, Treasury, Donate, `/admin/login` and `/admin/join`: 200. Treasury: Balance and Sustainability first, then the Expenses / Donations filters; the "sample figures until the Wise account is connected" sentence is gone. |
| API, anonymous | People, Accounts, invitation links, import runs and the CSV preview: 401. |
| Removed routes | Notion import (`imports/status`, `imports/jobs/:id`, `imports/directory/dry-run`, `imports/directory/apply`) and permanent delete (People, Treasury entries): 404. |
| Build | Share's "Link copied" check glyph is in the admin build; "Import Notion" is absent, "Import CSV" present. The job queue keeps only the Stripe fee schedule (the Notion import schedules are cleared). |
| Logs | No errors since the restart. |
| Not run | No import, no invitation link, no test data. Signed-in checks are for the client: production sessions are not created from the server. As a Rootadmin: Accounts → New invitation link (or Invitation links, to see the list); a service shows Category tags and no Responsible; a permission shows Service, Account, Permission level, Status, Scope, Granted, Revoked, Expired, People, then its automatic name; Share on Home turns into a check; no "Delete permanently" in any More options. |
