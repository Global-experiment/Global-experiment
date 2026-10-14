# Release plan — Treasury (roadmap module 1b)

**Status: prepared, not run.** Nothing here has touched production; each
step needs the owner's go-ahead.

**What ships:** migration **0007** (`treasury_documents`, `import_runs.kind`
+= `treasury`), the public Treasury from the ledger (`/treasury`, the
expense and anonymous donation pages; the illustrative
`presentationData.ts` is gone), the Notion Treasury importer (CLI and the
admin Imports card), the admin Treasury list and record, supporting
documents on the private local disk, and **pg-boss** background jobs in the
API process (imports and Stripe fee reconciliation).

Procedure: [release-2026-10-directory.md](release-2026-10-directory.md)
steps 0, 1, 2, 5 (migration), 7 and 9, plus the steps below. Database:
`global_experiment` via `/etc/global-experiment/api.env`. Values are never
printed: use the env-loading wrappers of the directory runbook.

## Before the window

1. **pg-boss schema.** pg-boss creates and migrates its own `pgboss`
   schema when the API starts. Check that the API's database user may
   create a schema in `global_experiment` (it owns the database today):

   ```bash
   # The database's owner (expected: the user in the API's DATABASE_URL)
   sudo -u postgres psql -Atc "select pg_get_userbyid(datdba) from pg_database where datname = 'global_experiment'"
   ```

   If it may not: `GRANT CREATE ON DATABASE global_experiment TO <api user>;`
   (recorded in the release record).

2. **File storage directory** (outside every web root, private, in the backup):

   ```bash
   install -d -m 0700 -o <api user> -g <api user> /var/lib/global-experiment/files
   ```

   `FILE_STORAGE_DIR` defaults to that path in production. The server has
   no scheduled backup job (backups are the runbooks' `pg_dump`s), so every
   backup from now on also archives this directory next to the dump and
   copies it off the server with the same SHA-256 check:

   ```bash
   tar -C /var/lib/global-experiment -czf "$BACKUP_DIR/ge-files-$STAMP.tar.gz" files
   chmod 600 "$BACKUP_DIR/ge-files-$STAMP.tar.gz"; sha256sum "$BACKUP_DIR/ge-files-$STAMP.tar.gz"
   ```

3. **nginx upload size.** nginx answers 413 above 1 MB by default; documents
   go up to 20 MB. In the site's server block, for the upload route only:

   ```nginx
   location ~ ^/api/admin/treasury/[0-9a-f-]+/documents$ {
       client_max_body_size 21m;
       proxy_pass http://127.0.0.1:3000;   # same upstream as the site
       # …the site's usual proxy headers
   }
   ```

   `nginx -t && systemctl reload nginx`.

## Environment (`/etc/global-experiment/api.env`)

| Variable | Value | Why |
|---|---|---|
| `NOTION_TREASURY_DB_ID` | the Notion "Treasury" database id | Importer (CLI and admin) |
| `TREASURY_PUBLIC_RECIPIENT_NAMES` | `false` (default) | Q3 pending: public pages show no names |
| `TREASURY_PUBLISH_UNQUALIFIED` | `false` (default) | Q25 pending: only Qualified / Not required are public |
| `TREASURY_WISE_CONNECTED` | `false` (default) | Balance and Sustainability hidden until Wise |
| `TREASURY_DONATION_APPEAL` | `false` (default) | "Cry for donation" banner off |
| `IMPORT_SCHEDULE_TREASURY` (and `_TAXONOMY`, `_DIRECTORY`) | `off` (default), or a cron in UTC | Scheduled imports; read at start |
| `FILE_STORAGE_DIR` | unset (→ `/var/lib/global-experiment/files`) | Supporting documents |

Each `treasury.*` value can later be changed without a restart through a
`settings` row (data-model §1.1).

## Steps

1. Backup (directory runbook step 1), including the files directory once
   it has content.
2. Stop both services, `git pull --ff-only`, `npm ci`, web and API builds,
   `chown -R globalexp:globalexp .next`.
3. Migration 0007 (directory runbook step 5). Expected: 8 migrations;
   `treasury_documents` empty.
4. Environment above; start both services. The API log shows the job queue
   starting (`Jobs` context) and the `pgboss` schema created on first start.
5. **Importer dry run** (writes only an `import_runs` row):
   `npm run api:import:treasury` — today expected *40 rows, 20 expenses,
   20 donations (never imported), 40 demo, 0 changes, apply refused (all
   demo)*. The same from the admin: Imports → Treasury expenses → Dry run.
6. Checks: API health 200; `/treasury` 200 with the history empty or only
   live entries, no Balance or Sustainability, no banner; an unknown entry
   `/treasury/expense/999999` 404; `GET /api/treasury/overview?currency=USD`
   200; admin `/admin/treasury` lists the ledger (sandbox donations, if any,
   marked Test); `/api/admin/treasury` unauthenticated 401; one PDF upload,
   download and delete on any entry, then the file gone from the directory.
7. Release record (this file): results, downtime, differences.

**CLI imports and the public cache:** an import applied from the admin
refreshes the public pages at once; one applied with the CLI shows within
5 minutes (the time-based fallback).

## Rollback

Stop both services; restore the dump (directory runbook §10); `git checkout`
the previous commit, `npm ci`, rebuild, `chown`, start. The `pgboss` schema
and the files directory can stay (unused by the previous version) or be
dropped: `DROP SCHEMA pgboss CASCADE`.
