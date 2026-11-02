# 016. Imports: CSV for People and Organizations only

## Status

Accepted (2026-10-30), Delivery 3. Decided by the client on 2026-10-23
(board cards OPS-93, OPS-94, OPS-49, OPS-150). Replaces, for imports, the
"Notion is the editing tool in v0.1" plan of overview §2.1. Amended
2026-11-03, Delivery 4: CSV is the only import (OPS-154), and unknown values
no longer refuse a row (OPS-153); the Treasury delete of the Consequences
was withdrawn by decision 017 (archive only).

## Context

Until now every Notion-backed table had an importer (Taxonomy, People and
Organizations, Treasury expenses), and the admin showed "Managed in
Notion" on what they wrote. The client decided that only People and
Organizations take data from outside — as CSV files their admins prepare —
and that Treasury and every other table are edited in the admin only, with
no import and no export.

## Decision

- **CSV import, People and Organizations only.** For accounts with write
  access to the table (`directory.create`), enforced by the API. Steps:
  upload (UTF-8, comma or semicolon, a header row; at most 2 MB and 5,000
  rows) → column matching (automatic by header name, changeable, or
  skipped) → check (rows to add, possible duplicates, rows with errors and
  why; nothing written) → import → report.
- **Same rules as the detail page.** Each row becomes the detail page's own
  create request and is validated by the same schema (email, links, dates,
  scores, lengths, relation limits); relations are found by name
  (organizations, expertise, contact channels, state, source), ignoring
  case, accents and extra spaces, with Notion's link suffix removed —
  "(https://www.notion.so/…)" as well as "(https://app.notion.com/p/…)".
- **Unknown values don't refuse a row (OPS-153, 2026-11-03).** A value of a
  relation column the admin doesn't have (or has twice) is listed once on
  the column step, with the rows it is in, and the admin maps it to an
  existing value or skips it (the default). A row whose value stays
  unresolved is imported without it, with a warning on the check step and
  in the report. Real errors (no name, an invalid email…) still refuse the
  row, with the reason. Why: the client's first import (2026-10-30)
  refused 370 of 394 rows only because Notion had changed its link format
  and "Other" wasn't a contact channel.
- **Duplicates are never merged or overwritten.** A row is a possible
  duplicate when its record UUID, email, website or name matches an
  existing record (archived ones included) or an earlier row; it is skipped
  unless the admin ticks it, and then added as a new record. Display
  numbers (PER-n, ORG-n, GE-n) are never compared or stored: they are not
  identities and will be replaced by random ids.
- **All or nothing.** The import re-plans from the same file and choices in
  one transaction and must match the check the admin saw (counts), or it
  writes nothing (409). A failure while writing rolls everything back.
- **Recorded.** Every created record gets an `imported` history event with
  the importing account and "CSV import"; the run is an `import_runs` row
  (`people_csv` / `organizations_csv`: who, when, file name, counts, every
  row's outcome) with its own history event, and a report page lists what
  was added (linked), the duplicates with the existing record (linked) and
  the errors. No file is stored.
- **No Notion import at all (OPS-154, 2026-11-03).** The People and
  Organizations importer that was kept as a secondary option is removed
  too: its routes, job queue worker, CLI (`import:directory`), schedule
  (`imports.directory.schedule`) and server variables
  (`NOTION_PEOPLE_DB_ID`, `NOTION_ORGANIZATIONS_DB_ID`,
  `IMPORT_SCHEDULE_DIRECTORY`, `IMPORT_FIXTURE_FILE`). Any schedule left
  in the job queue is cleared at start, a queued job refused. Past runs
  stay in `import_runs` and the History, listed read-only on Imports.
- **Removed (Delivery 3):** the Notion Taxonomy and Treasury importers (code, CLI,
  schedules, settings, server variables) and every "Managed in Notion"
  label or read-only state outside People and Organizations. Expenses
  copied from Notion earlier are ordinary in-app entries now. The API
  refuses an import of any other table (403) and has no export route.
  Existing data is unchanged: rows keep `managed_by` and `notion_page_id`.

## Consequences

- The taxonomy (Expertise, Fields, Domains) can no longer be changed from
  Notion and has no editor in the admin yet: it stays as it is until the
  Expertise/Fields/Domains detail template is built (client, 2026-10-30).
- Home and Documentation are still read live from Notion until the native
  editor ships (Delivery 4); their admin views stay read-only, without the
  label.
- Expenses copied from Notion are ordinary entries. They are archived,
  never deleted (decision 017); past "deleted" History events keep the
  entry's details.

## Later cleanup

- The `taxonomy.import`, `treasury.import` and `cms.import` permission keys
  stay in `admin_permissions` and `admin_role_permissions` (seeded by 0012)
  and in `PERMISSIONS`, but no route uses them. The client chose to keep
  them for now (2026-10-30). A later migration should delete their
  `admin_role_permissions` rows, then their `admin_permissions` rows, and
  remove them from `PERMISSIONS` and `ROLE_PERMISSIONS`, with a backup first
  and the access-control tests updated.
- The `NOTION_DOMAINS_DB_ID`, `NOTION_FIELDS_DB_ID`,
  `NOTION_EXPERTISE_DB_ID`, `NOTION_TREASURY_DB_ID`,
  `IMPORT_SCHEDULE_TAXONOMY` and `IMPORT_SCHEDULE_TREASURY` server variables
  are ignored and can be removed from the server's environment; since
  OPS-154, so are `NOTION_PEOPLE_DB_ID`, `NOTION_ORGANIZATIONS_DB_ID` and
  `IMPORT_SCHEDULE_DIRECTORY` (the API no longer reads `NOTION_API_KEY`;
  the website still does, for Home and Documentation).
- The `directory.import` and `*.delete` permission keys (decision 017) are
  unused too and go with the same cleanup.
- The `managed_by` and `notion_page_id` columns of `treasury_entries` remain
  as a record of where an entry was copied from; nothing reads them.
