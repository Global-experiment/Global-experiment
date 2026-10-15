# Release plan — Treasury (roadmap module 1b)

**Status: run on 2026-10-14 (UTC), fix shipped 2026-10-15**: see the
[record of the run](#record-of-the-run--2026-10-14) at the end.

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

## Record of the run — 2026-10-14

**What shipped:** `develop` at `a66f04c` (*Merge branch 'feat/treasury' into
develop*). **Before:** `bd5b5cc`. The phases ran as root from scripts copied
to `/root/deploy-1b/` (same commands as above; values never printed).

| Step | Result |
|---|---|
| Pre-flight | Server on `bd5b5cc`, both services active, 7 migrations, 68 GB free. domains 14, fields 120, expertise 1105, team links 1400, people 1, organizations 0, treasury entries 1 (a sandbox donation), import runs 4, settings 0. |
| Backup | `STAMP=20261014-230926`, services running (pg_dump snapshot). `ge-prod-20261014-230926.dump`, 189,420 bytes, 24 TABLE DATA, SHA-256 `2b14a0f28c5a104d544a4022ed316e9ef64ebfe474224b72ced649a5c7a7e03c`; copied to `ge-db-backups`, hash identical. `api.env`, web `.env.local`, the nginx site and both systemd units copied. |
| pg-boss privilege | Database owner `ge_app` = the API's user: `CREATE` on `global_experiment` is `t`, no grant needed. |
| Files directory | `/var/lib/global-experiment` (root, 755), `files` (`globalexp`, 700), outside the web root. Backed up as `ge-files-20261014-230926.tar.gz`, SHA-256 `7eb05bbe45b95547f21cfcaa5bf271538f505216c2c4742efbeebf58b2f7e508`; copied to `ge-db-backups`, hash identical. Later backups: dump plus a tar of this directory. |
| nginx | `location ~ ^/api/admin/treasury/[0-9a-f-]+/documents$` with `client_max_body_size 21m`, before `location /` (which keeps the 1 MB default). `nginx -t` OK, reloaded. |
| Environment | `NOTION_TREASURY_DB_ID` (from stdin) and `FILE_STORAGE_DIR=/var/lib/global-experiment/files` appended to `api.env` (root, 600). The Treasury settings keep their defaults. |
| Update and build | Services stopped 23:10:31 UTC. `bd5b5cc..a66f04c` (fast-forward), `npm ci` (662 packages), web build OK (`/treasury`, both detail routes, `/admin/treasury`, `/admin/treasury/[id]`), `api/admin` in routes manifest (3), API build OK, `chown -R globalexp:globalexp .next`. |
| Migration | Applied: 8 migrations, `treasury_documents` empty. |
| Restart and health | Services started, up 23:11:07 UTC, both active. API log: *Job queue started (pg-boss, 2 queues)*. API health 200, home 200, `/donate` 200, `/admin/treasury` and `/admin/imports` 200, `/api/admin/treasury` without login 401. |
| Public Treasury | `/treasury`, `?currency=all`, `?currency=EUR` 200: "No entries yet…" empty state, no Balance or Sustainability (Wise not connected), no banner, the header chart link to `/treasury`. Overview USD: 0 donations, 0 expenses, no filters. The sandbox donation stays hidden (live only in production). Unknown entries `/treasury/expense/999999`, `/treasury/donation/999999`, `/treasury/expense/abc` 404. Web log: 0 errors. |
| Admin | With a temporary owner session (10 minutes, deleted afterwards): `/api/admin/treasury` 200, total 1 (the sandbox donation); options 200; Imports status 200 with the Treasury card available. |
| Importer dry run | `import:treasury --dry-run`: 40 rows (20 expenses, 20 donations), 40 demo skipped, 0 created / updated / flagged, 0 missing, apply refused (all demo). Import runs 4 → 5 (the dry-run record). |
| Documents | Small PDF through nginx: upload 201, stored as `globalexp` 600, download byte-identical, delete 204, 0 rows and 0 files left. **15 MB: 500** (see below); nothing stored. |
| pg-boss | Schema `pgboss`; queues `import.run`, `stripe.fee-reconcile` (schedule `*/15 * * * *`); by 03:45 UTC, 19 fee-reconcile runs, all completed. |
| Verify | domains 14, fields 120, expertise 1105, team links 1400, people 1, organizations 0, treasury entries 1, settings 0, treasury documents 0 — unchanged. |

**Downtime:** 23:10:31 → 23:11:07 UTC (01:10:31 → 01:11:07 Zurich, 15
October), 36 seconds, website and admin.

**Differed from Expected:**

- **Documents over 10 MB fail.** The website's API proxy (Next.js rewrites)
  buffers request bodies up to `experimental.proxyClientMaxBodySize`,
  10 MB by default, and cuts the rest; the API then waits for the missing
  bytes and the request ends in a 500 after 30 seconds. Documents up to
  10 MB work. Fixed on 2026-10-15 (below): `proxyClientMaxBodySize: "21mb"`
  in `next.config.ts`, with an end-to-end test that uploads 15 MB through
  the website; shipping it is a web rebuild and restart, no migration.
- The 2 empty shard folders from the test upload stay in the files
  directory (harmless).

**Rollback (not needed):** stop both services; restore
`ge-prod-20261014-230926.dump` into `global_experiment` (§10 of the
directory runbook); `git checkout bd5b5cc`, `npm ci`, rebuild,
`chown -R globalexp:globalexp .next`, start. Restore the nginx site from
`/root/backups/nginx-global-experiment.20261014-230926`, then `nginx -t` and reload.

## Fix — documents up to 20 MB (2026-10-15)

`develop` at `d7dc0e1` (`aebbe5f` *fix(treasury): documents up to 20 MB pass
the website's API proxy*). Website only: no API, package or migration change
(the script stops otherwise).

| Step | Result |
|---|---|
| Backup | `ge-prod-20261015-042808.dump`, 236,468 bytes, SHA-256 `314e8ef37b378900e28a779ebf4a6e40c5bd25da58c539c9dbb957947680e82c`; copied to `ge-db-backups`, hash identical. |
| Release | Website stopped 04:28:09 UTC, `a66f04c..d7dc0e1`, web build OK, `chown -R globalexp:globalexp .next`, up 04:28:17 UTC. The API kept running. |
| Health | API 200, home 200, `/treasury` 200, unknown entry 404, `/admin/treasury` 200; both services active. |
| Documents | Through nginx with a temporary owner session (deleted afterwards): 15 MB **201**, 20.9 MB **201**, both downloaded byte-for-byte and deleted (204); 25 MB **413** (nginx); 2 MB to another admin route **413** (1 MB limit kept). Left: 0 rows, 0 files. Web log: 0 errors. |

**Downtime:** 04:28:09 → 04:28:17 UTC, 8 seconds, website only.
