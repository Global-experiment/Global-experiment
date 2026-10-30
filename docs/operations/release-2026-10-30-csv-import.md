# Release — CSV import, Notion imports outside the directory removed (Delivery 3, 2026-10-30)

**Status: run on 2026-10-30.** Decisions:
[016](../architecture/decisions/016-imports-csv-only-for-people-and-organizations.md).
Client note: [2026-10-30-csv-import](../releases/2026-10-30-csv-import.md).
No migration.

**What ships:** CSV import for People and Organizations (More options →
Import CSV, `directory.create`; upload, columns, check, import, report);
the Notion People/Organizations import under the same menu; the Notion
Treasury and Taxonomy importers, their commands, schedules and settings
removed; no "Managed in Notion" outside People and Organizations; no
import or export of any other table, refused by the API. A permanently
deleted Treasury entry's History event keeps its details (`f386879`).

## Steps

1. **Pre-flight:** `ge-security-check` (all checks pass, or the release
   stops).
2. **Backup** with `o-backup.sh`: `pg_dump`, `api.env` copy, SHA-256 on the
   server and on the owner's computer (identical).
3. **Release** with `t-release.sh`: stops if any migration appears; stop
   both services, `git pull --ff-only`, `npm ci`, both builds,
   `chown -R globalexp:globalexp .next`, clear the data cache, start,
   health checks; lists the ignored Notion variables still in `api.env`
   (names only).
4. **Checks** without writing data (below).

## Server variables now ignored

Left in `/etc/global-experiment/api.env` as the client asked; the API no
longer reads them and they can be removed later (decision 016, Later
cleanup):

- `NOTION_DOMAINS_DB_ID`
- `NOTION_FIELDS_DB_ID`
- `NOTION_EXPERTISE_DB_ID`
- `NOTION_TREASURY_DB_ID`

`IMPORT_SCHEDULE_TAXONOMY` and `IMPORT_SCHEDULE_TREASURY` were not set.
`NOTION_API_KEY`, `NOTION_PEOPLE_DB_ID`, `NOTION_ORGANIZATIONS_DB_ID` and
`IMPORT_SCHEDULE_DIRECTORY` are still used.

## Rollback

Stop both services; `git checkout 1dfb7d2`, `npm ci`, both builds,
`chown`; start. No database restore is needed (no migration, no data
changed). The retired Notion schedules were cleared from the job queue at
start-up; after a rollback they come back only if `imports.taxonomy.schedule`
or `imports.treasury.schedule` is set (neither is).

## Record of the run — 2026-10-30

| Step | Result |
|---|---|
| CI | `d6e7a1d` on develop (client repo): lint, typecheck, tests, builds, PostgreSQL suite — success (run 41039487015). |
| Pre-flight | All checks passed. |
| Backup | `ge-prod-20261030-101730.dump`, 383,299 bytes, SHA-256 `4767edbb5aa48a1aeeadc774690838403262c747466810a20fb41a007371091e`; copied to `ge-db-backups`, hash identical. Before: Treasury entries 20, people 4, organizations 2, 14 migrations. |
| Release | Stopped 10:21:01 UTC, up 10:21:39 (**38 seconds** offline); `1dfb7d2..d6e7a1d`; no migration; builds OK; `.next` owned by `globalexp`; both services active; API health 200. |
| Public | Home, Documentation, Treasury, Donate and `/admin/login`: 200. No "Managed in Notion" on the public pages. |
| API, anonymous | Imports status, CSV preview, Treasury import and Treasury list: 401. |
| Admin pages | `/admin/imports/csv?table=people` and `organizations` render the import; `table=treasury` renders the 404 page. The build contains Import CSV and Import Notion; the Treasury and Taxonomy importers are absent from the API build. |
| Data | After the release: entries 20, people 4, organizations 2, 14 migrations, 5 import runs, 0 CSV runs — unchanged; nothing imported, no test data. |
| Logs | No errors since the restart. |
| Signed in | Not run by us: production sessions are not created from the server, and no Rootadmin password is held. To check in the browser as a Rootadmin: People and Organizations → More options → Import CSV opens at the upload step (stop there); More options → Import Notion is there; Treasury has no import or export; Monitoring → History loads. |
