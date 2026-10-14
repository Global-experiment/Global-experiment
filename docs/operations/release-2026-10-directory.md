# Release runbook — directory foundation (October 2026)

**What ships:** `develop` at `99549bb` (*Merge branch 'feat/admin-directory-v2'
into develop*) — the Notion → PostgreSQL data model, migrations **0002–0004**,
the taxonomy and People/Organizations importers, the demo-data purge and the
admin v2 (expertise picker, overdue follow-ups in Europe/Zurich time,
completeness, read-only taxonomy, Notion import page).
**Production today:** `4eb86de` (*Merge branch 'fix/admin-toolbar-tabs'*).

**How to use this runbook**

- Every command runs **on the VPS as root**, in one SSH session
  (`ssh ge-vps` = `root@49.12.196.138`), unless a block says *on your
  computer*. Run one step at a time and check its **Expected** result before
  the next. **Stop** wherever this document says so.
- Nothing here prints a secret: environment files are only ever *sourced*
  into a subshell, and only variable **names**, database **host/name** and
  status codes are shown. Never `cat` an `.env` file; edit with `nano`.
- **Downtime:** the admin is offline from step 1, the public website from
  step 2 until step 7 (about 20–30 minutes). Pick a quiet moment.
- The server layout this assumes (seen on the server 2026-10-09): app in
  `/opt/global-experiment` (git remote **`origin`** = the client repo,
  branch `develop`); `global-experiment.service` (Next.js, user `globalexp`,
  `127.0.0.1:3000`, drop-in `admin-api.conf` with `ADMIN_API_ORIGIN`);
  `global-experiment-api.service` (NestJS, `127.0.0.1:4000`, environment
  from `/etc/global-experiment/*.env`); nginx in front. Step 0 re-checks it.

---

## 0. Pre-flight (read-only — changes nothing)

```bash
ssh ge-vps
cd /opt/global-experiment
export RELEASE=99549bb PREVIOUS=4eb86de
export STAMP=$(date +%Y%m%d-%H%M%S); echo "STAMP=$STAMP"   # write this down: later steps and the rollback use it
export BACKUP_DIR=/root/backups; mkdir -p -m 700 "$BACKUP_DIR"
# Run a command with one environment file loaded — values never printed:
with_env() { ( set -a; . "$API_ENV"; set +a; "$@" ); }

git rev-parse --short HEAD                 # Expected: 4eb86de
git status --short                         # Expected: only server files (.config/, .npm/, .lesshst, .env.local.backup-*)
node -v; pg_dump --version; psql --version
df -h / /root                              # Expected: a few GB free

systemctl cat global-experiment-api.service | grep -E '^# /|EnvironmentFile|ExecStart|^User'
ls -l /etc/global-experiment/

# Variable NAMES in each env file, and the database each points to (host:port/name only):
for f in /etc/global-experiment/*.env; do
  echo "== $f"; grep -oE '^[A-Z_][A-Z0-9_]*' "$f" | sort | tr '\n' ' '; echo
  ( set -a; . "$f"; set +a; echo "   DATABASE_URL -> ${DATABASE_URL:-<none>}" | sed -E 's#://[^@]*@#://***@#; s#\?.*##' )
done

# What the RUNNING API actually uses (names, and its database host/name only) —
# the unit's main process (npm) carries exactly the environment systemd gave it:
PID=$(systemctl show -p MainPID --value global-experiment-api.service)
tr '\0' '\n' < /proc/$PID/environ | grep -oE '^[A-Z_][A-Z0-9_]*' | sort | tr '\n' ' '; echo
tr '\0' '\n' < /proc/$PID/environ | sed -n -E 's#^DATABASE_URL=[a-z]+://[^@]*@#running API database: #p' | sed -E 's#\?.*##'
```

**Why this matters:** on 2026-10-09 the API unit showed
`EnvironmentFile=/etc/global-experiment/api.env`, then an **empty**
`EnvironmentFile=` (which *resets* the list), then
`EnvironmentFile=/etc/global-experiment/api-demo.env`. If that's still so,
the API reads **only `api-demo.env`** — `api.env` is ignored. Step 4 fixes it.

**Decide before going on** (send me this output if anything is unclear):

| Pre-flight shows | Then |
|---|---|
| `api.env` and `api-demo.env` point to the **same** database, and the running API uses it | Continue. That database is production. |
| They point to **different** databases | **Stop.** Production must be the database the admin uses today (it holds the owner account). We'll decide together which one, and set `api.env` to it, before step 1. |
| `api-demo.env` sets `NODE_ENV` to anything but `production` | Continue — step 4 removes it (the API must run with `NODE_ENV=production`). |

Set the file whose database you'll back up and migrate (normally the one the
running API uses):

```bash
export API_ENV=/etc/global-experiment/api-demo.env   # or api.env — per the table above
```

---

## 1. Backup (database + configuration)

```bash
systemctl stop global-experiment-api.service       # admin offline: no writes during the backup
cp -p /etc/global-experiment/*.env "$BACKUP_DIR/"  # config files, permissions kept
for f in "$BACKUP_DIR"/*.env; do mv "$f" "$f.$STAMP"; done
mkdir -p "$BACKUP_DIR/systemd-$STAMP" && cp -a /etc/systemd/system/global-experiment-api.service* /etc/systemd/system/global-experiment.service* "$BACKUP_DIR/systemd-$STAMP/"

DUMP="$BACKUP_DIR/ge-prod-$STAMP.dump"
with_env sh -c 'pg_dump --format=custom --no-owner --file="$1" --dbname="$DATABASE_URL"' _ "$DUMP"
ls -l "$DUMP"                                          # Expected: non-empty (tens of KB or more)
test -s "$DUMP" && pg_restore --list "$DUMP" | grep -c 'TABLE DATA'   # Expected: 13 (tables before this release)
pg_restore --list "$DUMP" | grep -E 'TABLE DATA .* (people|organizations|admin_users) '
sha256sum "$DUMP"                                      # note the hash
```

**Copy it off the server** — *on your computer* (PowerShell):

```powershell
scp ge-vps:/root/backups/ge-prod-<STAMP>.dump "C:\Users\snowo\Documents\workspace\ge-db-backups\"
Get-FileHash -Algorithm SHA256 "C:\Users\snowo\Documents\workspace\ge-db-backups\ge-prod-<STAMP>.dump"   # same hash as on the server
```

**Stop** if the dump is empty, the hash differs, or `pg_dump` reports a
version mismatch (the client must be the server's major version or newer).

---

## 2. Update the code and build (website offline from here)

```bash
systemctl stop global-experiment.service          # npm ci replaces node_modules under the running site
cd /opt/global-experiment
git fetch origin
git status --short                                # Expected: only the server files listed in step 0
git checkout develop
git pull --ff-only origin develop
git log --oneline -3                              # Expected: the runbook commit, then 99549bb Merge branch 'feat/admin-directory-v2' into develop
npm ci
npm run build                                     # website (reads ADMIN_API_ORIGIN from .env.local)
grep -c 'api/admin' .next/routes-manifest.json    # Expected: 1 or more (admin proxy built in)
npm run api:build
```

**Stop** if `git pull` refuses (local changes) or a build fails — the
previous build is gone, so go to **Rollback → code** (§10).

---

## 3. Notion settings for the API

Edit the API's environment file (values: copy them from your own
`.env.local`; never paste them anywhere else):

```bash
nano /etc/global-experiment/api.env
```

Add these lines at the end (`KEY=value`, no quotes, no spaces):

```
NOTION_API_KEY=
NOTION_DOMAINS_DB_ID=
NOTION_FIELDS_DB_ID=
NOTION_EXPERTISE_DB_ID=
NOTION_PEOPLE_DB_ID=
NOTION_ORGANIZATIONS_DB_ID=
```

Check — prints `1` per variable, never a value:

```bash
for v in NOTION_API_KEY NOTION_DOMAINS_DB_ID NOTION_FIELDS_DB_ID NOTION_EXPERTISE_DB_ID NOTION_PEOPLE_DB_ID NOTION_ORGANIZATIONS_DB_ID; do
  printf '%s: ' "$v"; grep -c "^$v=." /etc/global-experiment/api.env
done
ls -l /etc/global-experiment/api.env              # owner and mode unchanged (nano keeps them)
```

**Time zone:** nothing to set. The overdue rule computes "today" in
`Europe/Zurich` inside the API, whatever the server's time zone; timestamps
stay stored in UTC. Leave the server's `TZ` as it is.

---

## 4. `api-demo.env` — what it does, and removing its use

**What it does:** it's a second environment file for the API service. A
systemd drop-in clears the unit's `EnvironmentFile` list and loads
`api-demo.env` instead of `api.env`, so the running API takes *all* its
settings from it (that's why `api.env` changes had no effect). The code being
released reads **no demo setting**: the demo seed command is removed (no
`seed:demo`), and the only test hook (`IMPORT_FIXTURE_FILE`) is refused by the
API unless `NODE_ENV=test`. So `api-demo.env` can only switch the API to a
different set of values — e.g. a demo database, or a non-production
`NODE_ENV` — which is what must go.

Find the drop-in that loads it and disable it (copies are in
`$BACKUP_DIR/systemd-$STAMP`):

```bash
systemctl cat global-experiment-api.service | grep -E '^# /|EnvironmentFile'
# The '# /etc/systemd/system/global-experiment-api.service.d/<name>.conf' header just
# above 'EnvironmentFile=' / 'EnvironmentFile=…api-demo.env' is the drop-in to disable.
DROPIN=/etc/systemd/system/global-experiment-api.service.d/<name>.conf
grep -v -E '^\s*(#|$)' "$DROPIN"                   # Expected: only [Service] and the two EnvironmentFile lines
```

- If the drop-in contains **only** those lines: `mv "$DROPIN" "$DROPIN.disabled-$STAMP"`
- If it contains **other settings too**: `nano "$DROPIN"` and delete just the
  two `EnvironmentFile` lines.

Then:

```bash
systemctl daemon-reload
systemctl cat global-experiment-api.service | grep EnvironmentFile   # Expected: only EnvironmentFile=/etc/global-experiment/api.env
mv /etc/global-experiment/api-demo.env "$BACKUP_DIR/api-demo.env.disabled-$STAMP"   # kept, not deleted
export API_ENV=/etc/global-experiment/api.env
( set -a; . "$API_ENV"; set +a; echo "NODE_ENV=${NODE_ENV:-<unset: the service sets it>}"; echo "$DATABASE_URL" | sed -E 's#://[^@]*@#://***@#; s#\?.*##' )
# Expected: NODE_ENV=production (or unset) and the production database from step 0
```

If `api.env` has no `NODE_ENV`, add `NODE_ENV=production` to it with `nano`.

---

## 5. Migrations 0002 → 0004

```bash
cd /opt/global-experiment
with_env npm run db:migrate 2>&1 | tee "$BACKUP_DIR/migrate-$STAMP.log"
grep -oE "0002: source \"[a-z_]+\" removed; cleared on person [^']+" "$BACKUP_DIR/migrate-$STAMP.log"
tail -1 "$BACKUP_DIR/migrate-$STAMP.log"          # Expected: migrations applied successfully!
cat > "$BACKUP_DIR/after-migrate.sql" <<'SQL'
select count(*) from drizzle.__drizzle_migrations;
select string_agg(key, ',' order by sort_order) from person_sources;
select string_agg(key, ',' order by sort_order) from taxonomy_statuses;
SQL
with_env sh -c 'psql "$DATABASE_URL" -At -f "$1"' _ "$BACKUP_DIR/after-migrate.sql"
# Expected: 5, then candide,ai,contribution_email,other, then active,proposed,deprecated
```

**Expected NOTICE output:** one line per person still on a removed source,
e.g. `0002: source "waitlist" removed; cleared on person de000000-… (Bea Demo)`
— on production these are the demo people (removed in step 6 anyway). A
real person in that list keeps everything except the Source, which is cleared.

**Stop** if the migration fails: it runs in one transaction, so nothing
changed — send me the log.

---

## 6. Purge the demo data

```bash
with_env npm run api:purge-demo-data -- --dry-run | tee "$BACKUP_DIR/purge-dry-$STAMP.txt"
```

**Review** the list: only the former demo records (`… Demo / Sample / Example /
Placeholder` people, the 12 demo organizations such as *Northwind Civic Lab*,
the demo taxonomy *Technology / Design / Governance / Operations*), each with
`former demo seed id (de000000-…)`, and `0 kept`. **Stop** if any real record
is listed.

Then, with the backup from step 1 (must be under 24 hours old):

```bash
with_env npm run api:purge-demo-data -- --confirm --backup "$BACKUP_DIR/ge-prod-$STAMP.dump"
# Expected: "PURGED on database …" with the same totals as the dry run
```

---

## 7. Restart and health checks

```bash
systemctl start global-experiment-api.service
systemctl start global-experiment.service
sleep 5
systemctl is-active global-experiment-api.service global-experiment.service   # Expected: active, active
journalctl -u global-experiment-api.service -n 40 --no-pager | grep -iE 'error|invalid' || echo "no errors"

curl -s -o /dev/null -w 'api health      %{http_code}\n' http://127.0.0.1:4000/api/health          # 200
curl -s -o /dev/null -w 'web home        %{http_code}\n' http://127.0.0.1:3000/                    # 200
curl -s -o /dev/null -w 'web docs        %{http_code}\n' http://127.0.0.1:3000/documentation       # 200
curl -s -o /dev/null -w 'public site     %{http_code}\n' https://globalexperiment.org/             # 200
curl -s -o /dev/null -w 'admin proxy     %{http_code}\n' -X POST -H 'Origin: https://globalexperiment.org' \
  -H 'Content-Type: application/json' -d '{}' https://globalexperiment.org/api/admin/auth/login    # 400 = API reached
curl -s -o /dev/null -w 'imports guarded %{http_code}\n' https://globalexperiment.org/api/admin/imports/status  # 401
```

In the browser (Ctrl+F5): log in at <https://globalexperiment.org/admin/login>,
open **People → Notion import**: both cards are available (no "isn't
configured" message).

**Stop** and go to §10 if the API doesn't start, or the admin login fails
(a `401` with the right password means the owner account isn't in this
database — tell me before anything else).

---

## 8. Taxonomy import on production

**Either** with the command line:

```bash
cd /opt/global-experiment
with_env npm run api:import:taxonomy -- --dry-run | tee "$BACKUP_DIR/taxonomy-dry-$STAMP.txt"
# Expected: Read from Notion: 14 domains, 120 fields, 1105 expertise
#           created 14 / 120 / 1105, team links 1400 added, skipped 0, flagged 0, missing 0
with_env npm run api:import:taxonomy -- --apply | tee "$BACKUP_DIR/taxonomy-apply-$STAMP.txt"
with_env npm run api:import:taxonomy -- --dry-run
# Expected: "Result: 0 changes — the database already matches Notion."
```

**or** in the admin (**Notion import** page): *Dry run taxonomy* → review the
report → *Apply this dry run…* → *Apply* → wait for "Taxonomy apply finished"
→ *Dry run taxonomy* again → "finished: no changes".

Optionally also *Dry run people & organizations*: until Candide's real records
are in Notion it reports every record as demo and offers no Apply (the API
refuses it). **Do not** apply the directory now.

---

## 9. Verify

```bash
cat > "$BACKUP_DIR/verify.sql" <<'SQL'
select 'domains', count(*) from expertise_domains
union all select 'fields', count(*) from expertise_fields
union all select 'expertise', count(*) from expertise_items
union all select 'team links', count(*) from expertise_teams
union all select 'people', count(*) from people
union all select 'organizations', count(*) from organizations
union all select 'demo people', count(*) from people where id::text like 'de000000-%' or email ilike '%example.org'
union all select 'demo organizations', count(*) from organizations where id::text like 'de000000-%' or email ilike '%example.org' or website ilike '%example.org%'
union all select 'import runs', count(*) from import_runs;
SQL
with_env sh -c 'psql "$DATABASE_URL" -At -F " | " -f "$1"' _ "$BACKUP_DIR/verify.sql"
# Expected: domains 14 | fields 120 | expertise 1105 | team links 1400 | people 0 | organizations 0 | demo 0 | demo 0 | import runs ≥ 3
```

In the admin: **Domains** "14 of 14", **Fields** "120 of 120", **Expertise**
"1105 of 1105" (each with "Managed in Notion – updated by the importer"),
**People** and **Organizations** empty, **Notion import** history shows the
dry runs and the apply.

---

## 10. Rollback

Use it if a step above fails and can't be fixed on the spot. It restores the
database from step 1's backup and redeploys `4eb86de`. Everything written
after the backup is lost (the admin was offline, so: nothing).

```bash
cd /opt/global-experiment
export STAMP=<the STAMP from step 0>  BACKUP_DIR=/root/backups
with_env() { ( set -a; . "$API_ENV"; set +a; "$@" ); }
systemctl stop global-experiment.service global-experiment-api.service

# 1) Configuration back to its state before the release
cp -p "$BACKUP_DIR/api.env.$STAMP" /etc/global-experiment/api.env
[ -f "$BACKUP_DIR/api-demo.env.$STAMP" ] && cp -p "$BACKUP_DIR/api-demo.env.$STAMP" /etc/global-experiment/api-demo.env
cp -a "$BACKUP_DIR/systemd-$STAMP/global-experiment-api.service.d" /etc/systemd/system/ 2>/dev/null
rm -f /etc/systemd/system/global-experiment-api.service.d/*.disabled-*
systemctl daemon-reload
export API_ENV=<the file used in step 1>

# 2) Database back to the backup (drops this release's tables and data first)
with_env sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "drop schema if exists drizzle cascade; drop schema public cascade; create schema public;"'
with_env sh -c 'pg_restore --no-owner --no-privileges --exit-on-error --dbname="$DATABASE_URL" "$1"' _ "$BACKUP_DIR/ge-prod-$STAMP.dump"
with_env sh -c 'psql "$DATABASE_URL" -At -c "select count(*) from drizzle.__drizzle_migrations"'   # Expected: 2

# 3) Code back to 4eb86de
git checkout 4eb86de
npm ci && npm run build && npm run api:build
grep -c 'api/admin' .next/routes-manifest.json    # 1 or more

systemctl start global-experiment-api.service global-experiment.service
# then the health checks of step 7
```

- If `drop schema public` fails with *must be owner*, run the two database
  commands as the PostgreSQL superuser instead:
  `sudo -u postgres psql -d <database> -c "…"` and
  `sudo -u postgres pg_restore --no-owner --role=<app user> -d <database> <dump>`.
- The server is then on a detached `4eb86de`; `git checkout develop` before
  the next release attempt.

---

## Record of the run

Fill in as you go (no secrets): `STAMP`, dump file name and SHA-256, step 0
decision (which env file / database), migration NOTICE count, purge totals,
taxonomy dry run / apply / second dry run results, verification counts, and
anything that differed from **Expected**.
