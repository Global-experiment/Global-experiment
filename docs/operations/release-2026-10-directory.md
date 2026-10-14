# Release runbook — directory foundation (October 2026)

**What ships:** `develop` at `99549bb` (*Merge branch 'feat/admin-directory-v2'
into develop*) — the Notion → PostgreSQL data model, migrations **0002–0004**,
the taxonomy and People/Organizations importers, the demo-data purge and the
admin v2 (expertise picker, overdue follow-ups in Europe/Zurich time,
completeness, read-only taxonomy, Notion import page).
**Production today:** `4eb86de` (*Merge branch 'fix/admin-toolbar-tabs'*).

**Databases** (same PostgreSQL 17 server, `127.0.0.1:5432`):

| Database | Env file | Role in this release |
|---|---|---|
| `global_experiment` | `/etc/global-experiment/api.env` | **Production.** Backed up, migrated, imported into. |
| `global_experiment_demo_dev` | `/etc/global-experiment/api-demo.env` | **Demo archive.** Backed up, otherwise never modified or dropped. |

**How to use this runbook**

- Every command runs **on the VPS as root**, in one SSH session
  (`ssh ge-vps` = `root@49.12.196.138`), unless a block says *on your
  computer*. Run one step at a time and check its **Expected** result before
  the next. **Stop** wherever this document says so.
- Nothing here prints a secret: environment files are only ever *sourced*
  into a subshell, and only variable **names**, database **host/name** and
  status codes are shown. Never `cat` an `.env` file; edit with `nano`.
- **Downtime:** the admin and the public website are offline from step 2
  until step 7 (about 20–30 minutes). Pick a quiet moment.
- The server layout this assumes (seen on the server 2026-10-14): app in
  `/opt/global-experiment` (git remote **`origin`** = the client repo,
  branch `develop`); `global-experiment.service` (Next.js, user `globalexp`,
  `127.0.0.1:3000`, drop-in `admin-api.conf` with `ADMIN_API_ORIGIN`);
  `global-experiment-api.service` (NestJS, `127.0.0.1:4000`,
  `EnvironmentFile=/etc/global-experiment/api.env`, overridden by the drop-in
  `demo-db.conf` → `api-demo.env`); nginx in front. Step 0 re-checks it.

---

## 0. Pre-flight (read-only — changes nothing)

Set these in **every** SSH session used for this release (the rollback
repeats them):

```bash
ssh ge-vps
cd /opt/global-experiment
export RELEASE=99549bb PREVIOUS=4eb86de
export API_ENV=/etc/global-experiment/api.env          # production: global_experiment
export DEMO_ENV=/etc/global-experiment/api-demo.env    # demo archive: global_experiment_demo_dev
export BACKUP_DIR=/root/backups
# Run a command with one environment file loaded — values never printed:
with_env()  { ( set -a; . "$API_ENV";  set +a; "$@" ); }
with_demo() { ( set -a; . "$DEMO_ENV"; set +a; "$@" ); }
```

Checks:

```bash
git rev-parse --short HEAD                 # Expected: 4eb86de
git status --short                         # Expected: only server files (.config/, .npm/, .lesshst, .env.local.backup-*)
node -v; pg_dump --version; psql --version
df -h / /root                              # Expected: a few GB free

systemctl cat global-experiment-api.service | grep -E '^# /|EnvironmentFile|ExecStart|^User'
ls -l /etc/global-experiment/ /etc/systemd/system/global-experiment-api.service.d/

# Variable NAMES in each env file, and the database each points to (host:port/name only):
for f in /etc/global-experiment/*.env; do
  echo "== $f"; grep -oE '^[A-Z_][A-Z0-9_]*' "$f" | sort | tr '\n' ' '; echo
  ( set -a; . "$f"; set +a; echo "   DATABASE_URL -> ${DATABASE_URL:-<none>}" | sed -E 's#://[^@]*@#://***@#; s#\?.*##' )
done

# What the RUNNING API actually uses (names, and its database host/name only):
PID=$(systemctl show -p MainPID --value global-experiment-api.service)
tr '\0' '\n' < /proc/$PID/environ | grep -oE '^[A-Z_][A-Z0-9_]*' | sort | tr '\n' ' '; echo
tr '\0' '\n' < /proc/$PID/environ | sed -n -E 's#^DATABASE_URL=[a-z]+://[^@]*@#running API database: #p' | sed -E 's#\?.*##'
```

**Pre-flight result, 2026-10-14** (decision taken on it):

- The running API reads **only `api-demo.env`** (`demo-db.conf` resets the
  `EnvironmentFile` list), i.e. `global_experiment_demo_dev`.
- The two files point to **different** databases. `global_experiment_demo_dev`
  holds only demo records (48/48 people, 12/12 organizations, all taxonomy
  rows with `de000000-` ids); its other rows are the owner account, its
  sessions and the two lookup tables (identical to production's). Nothing
  real needs copying except the owner's current password (step 4b).
- `global_experiment` has the same owner account (same email), no people or
  organizations, and a **different** owner password hash.
- `NODE_ENV=production` in both files and in the running API.
- **Decision:** production = `global_experiment` (`api.env`); the demo
  database stays untouched as an archive.

**Stop** if a re-run shows something else (e.g. a third env file, another
drop-in, a different database host) — send me the output.

---

## 1. Backup (both databases + configuration)

No service is stopped: the running API uses the demo archive, not
`global_experiment`, so the production dump is consistent while it runs.

```bash
mkdir -p -m 700 "$BACKUP_DIR"
export STAMP=$(date +%Y%m%d-%H%M%S); echo "STAMP=$STAMP"   # write this down: later steps and the rollback use it

# Configuration (copies only)
for f in /etc/global-experiment/*.env; do cp -p "$f" "$BACKUP_DIR/$(basename "$f").$STAMP"; done
mkdir -p -m 700 "$BACKUP_DIR/systemd-$STAMP"
cp -a /etc/systemd/system/global-experiment-api.service /etc/systemd/system/global-experiment-api.service.d \
      /etc/systemd/system/global-experiment.service /etc/systemd/system/global-experiment.service.d "$BACKUP_DIR/systemd-$STAMP/"
ls -lR "$BACKUP_DIR/systemd-$STAMP" | grep -E '\.(service|conf)$'   # Expected: 2 units, demo-db.conf, admin-api.conf

# Databases
PROD_DUMP="$BACKUP_DIR/ge-prod-$STAMP.dump"
DEMO_DUMP="$BACKUP_DIR/ge-demo-archive-$STAMP.dump"
with_env  sh -c 'pg_dump --format=custom --no-owner --file="$1" --dbname="$DATABASE_URL"' _ "$PROD_DUMP"
with_demo sh -c 'pg_dump --format=custom --no-owner --file="$1" --dbname="$DATABASE_URL"' _ "$DEMO_DUMP"
chmod 600 "$PROD_DUMP" "$DEMO_DUMP"
for d in "$PROD_DUMP" "$DEMO_DUMP"; do
  test -s "$d" && echo "$(basename "$d"): $(stat -c %s "$d") bytes, $(pg_restore --list "$d" | grep -c 'TABLE DATA') TABLE DATA"
done                                                   # Expected: both non-empty, 13 TABLE DATA each
sha256sum "$PROD_DUMP" "$DEMO_DUMP"                    # note both hashes
```

**Copy them off the server** — *on your computer* (PowerShell):

```powershell
scp "ge-vps:/root/backups/ge-prod-<STAMP>.dump" "ge-vps:/root/backups/ge-demo-archive-<STAMP>.dump" "C:\Users\snowo\Documents\workspace\ge-db-backups\"
Get-FileHash -Algorithm SHA256 "C:\Users\snowo\Documents\workspace\ge-db-backups\ge-*-<STAMP>.dump"   # same hashes as on the server
```

**Stop** if a dump is empty, a hash differs, or `pg_dump` reports a version
mismatch (the client must be the server's major version or newer).

---

## 2. Update the code and build (admin and website offline from here)

```bash
systemctl stop global-experiment.service global-experiment-api.service   # npm ci replaces node_modules under both
cd /opt/global-experiment
git fetch origin
git status --short                                # Expected: only the server files listed in step 0
git checkout develop
git pull --ff-only origin develop
git log --oneline -4                              # Expected: the runbook commits, then 99549bb Merge branch 'feat/admin-directory-v2' into develop
npm ci
npm run build                                     # website (reads ADMIN_API_ORIGIN from .env.local)
grep -c 'api/admin' .next/routes-manifest.json    # Expected: 1 or more (admin proxy built in)
npm run api:build
# The build runs as root; the website runs as globalexp and writes its page cache here
# ("Failed to update prerender cache … EACCES" otherwise — fixed on 2026-10-14):
chown -R globalexp:globalexp /opt/global-experiment/.next
stat -c '%U' /opt/global-experiment/.next/cache    # Expected: globalexp
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

## 4. Point the API at production (remove `demo-db.conf`)

**What it does:** the drop-in
`/etc/systemd/system/global-experiment-api.service.d/demo-db.conf` contains
an empty `EnvironmentFile=` (which clears the unit's list) and
`EnvironmentFile=/etc/global-experiment/api-demo.env`, so the API takes *all*
its settings from `api-demo.env` and `api.env` is ignored. The released code
reads no demo setting (no `seed:demo`; the test hook `IMPORT_FIXTURE_FILE` is
refused unless `NODE_ENV=test`), so removing the drop-in is all it takes.

```bash
DROPIN=/etc/systemd/system/global-experiment-api.service.d/demo-db.conf
grep -v -E '^\s*(#|$)' "$DROPIN"                   # Expected: [Service], EnvironmentFile=, EnvironmentFile=/etc/global-experiment/api-demo.env
mv "$DROPIN" "$BACKUP_DIR/demo-db.conf.removed-$STAMP"   # a copy is also in $BACKUP_DIR/systemd-$STAMP
systemctl daemon-reload
systemctl cat global-experiment-api.service | grep EnvironmentFile   # Expected: only EnvironmentFile=/etc/global-experiment/api.env
( set -a; . "$API_ENV"; set +a; echo "NODE_ENV=${NODE_ENV:-<unset>}"; echo "$DATABASE_URL" | sed -E 's#://[^@]*@#://***@#; s#\?.*##' )
# Expected: NODE_ENV=production and postgresql://***@127.0.0.1:5432/global_experiment
```

`api-demo.env` stays where it is (nothing loads it any more); the commands
below use it only to *read* the archive.

---

## 4b. Owner password (keep the current one)

On 2026-10-14 the owner's password hash differed between the two databases:
the password used every day lives in the demo archive. Copy **only
`password_hash`** to production's owner (same email), in one transaction.
The hash and email travel in shell variables and are never printed.
Existing sessions don't carry over (they're in the archive): everyone logs in
again after step 7.

```bash
export PGOPTIONS='-c default_transaction_read_only=on'   # reads from the archive can't write
OWNER_EMAIL=$(with_demo sh -c 'psql "$DATABASE_URL" -At -c "select email from admin_users where role = '\''owner'\''"')
OWNER_HASH=$(with_demo sh -c 'psql "$DATABASE_URL" -At -c "select password_hash from admin_users where role = '\''owner'\''"')
unset PGOPTIONS
[ -n "$OWNER_EMAIL" ] && [ -n "$OWNER_HASH" ] && echo "read: ok" || echo "read: FAILED — stop"

cat > "$BACKUP_DIR/owner-password.sql" <<'SQL'
\set ON_ERROR_STOP on
begin;
-- exactly one matching owner, or this fails (division by zero) and nothing changes
select 1 / (count(*) = 1)::int as one_owner from admin_users where role = 'owner' and lower(email) = lower(:'email');
update admin_users set password_hash = :'hash', updated_at = now() where role = 'owner' and lower(email) = lower(:'email');
commit;
SQL
with_env sh -c 'psql "$DATABASE_URL" -q -At -v email="$1" -v hash="$2" -f "$3"' _ "$OWNER_EMAIL" "$OWNER_HASH" "$BACKUP_DIR/owner-password.sql"
# Expected: 1   (and no error)

H1=$(with_demo sh -c 'psql "$DATABASE_URL" -At -c "select md5(password_hash) from admin_users where role = '\''owner'\''"')
H2=$(with_env  sh -c 'psql "$DATABASE_URL" -At -c "select md5(password_hash) from admin_users where role = '\''owner'\''"')
[ "$H1" = "$H2" ] && echo "owner password: identical" || echo "owner password: DIFFERENT — stop"
unset OWNER_EMAIL OWNER_HASH H1 H2
```

Skip this step if a check right before it already reports *identical*.

---

## 5. Migrations 0002 → 0004

```bash
cd /opt/global-experiment
with_env npm run db:migrate 2>&1 | tee "$BACKUP_DIR/migrate-$STAMP.log"
grep -oE "0002: source \"[a-z_]+\" removed; cleared on person [^']+" "$BACKUP_DIR/migrate-$STAMP.log"   # Expected: nothing (no people)
tail -1 "$BACKUP_DIR/migrate-$STAMP.log"          # Expected: migrations applied successfully!
cat > "$BACKUP_DIR/after-migrate.sql" <<'SQL'
select count(*) from drizzle.__drizzle_migrations;
select string_agg(key, ',' order by sort_order) from person_sources;
select string_agg(key, ',' order by sort_order) from taxonomy_statuses;
SQL
with_env sh -c 'psql "$DATABASE_URL" -At -f "$1"' _ "$BACKUP_DIR/after-migrate.sql"
# Expected: 5, then candide,ai,contribution_email,other, then active,proposed,deprecated
```

**NOTICE output:** migration 0002 logs one line per person still on a
removed source (`0002: source "waitlist" removed; cleared on person …`).
`global_experiment` has no people, so **none are expected**. If a line
appears, that person keeps everything except the Source, which is cleared.

**Stop** if the migration fails: it runs in one transaction, so nothing
changed — send me the log.

---

## 6. Purge the demo data (expected: nothing to purge)

```bash
with_env npm run api:purge-demo-data -- --dry-run | tee "$BACKUP_DIR/purge-dry-$STAMP.txt"
```

**Expected:** 0 records — `global_experiment` holds no demo data. Then
**skip** the `--confirm` run. If the dry run *does* list records, review
them (only `… Demo / Sample / Example / Placeholder` names, `de000000-…`
ids, `example.org` addresses; **stop** if any real record is listed) and
purge with the production backup from step 1 (under 24 hours old):

```bash
with_env npm run api:purge-demo-data -- --confirm --backup "$BACKUP_DIR/ge-prod-$STAMP.dump"
# Expected: "PURGED on database …" with the same totals as the dry run
```

The demo archive is **never** purged.

---

## 7. Restart and health checks

```bash
systemctl start global-experiment-api.service
systemctl start global-experiment.service
sleep 5
systemctl is-active global-experiment-api.service global-experiment.service   # Expected: active, active
journalctl -u global-experiment-api.service -n 40 --no-pager | grep -iE 'error|invalid' || echo "no errors"
PID=$(systemctl show -p MainPID --value global-experiment-api.service)
tr '\0' '\n' < /proc/$PID/environ | sed -n -E 's#^DATABASE_URL=[a-z]+://[^@]*@#running API database: #p' | sed -E 's#\?.*##'
# Expected: running API database: 127.0.0.1:5432/global_experiment

curl -s -o /dev/null -w 'api health      %{http_code}\n' http://127.0.0.1:4000/api/health          # 200
curl -s -o /dev/null -w 'web home        %{http_code}\n' http://127.0.0.1:3000/                    # 200
curl -s -o /dev/null -w 'web docs        %{http_code}\n' http://127.0.0.1:3000/documentation       # 200
curl -s -o /dev/null -w 'public site     %{http_code}\n' https://globalexperiment.org/             # 200
curl -s -o /dev/null -w 'admin proxy     %{http_code}\n' -X POST -H 'Origin: https://globalexperiment.org' \
  -H 'Content-Type: application/json' -d '{}' https://globalexperiment.org/api/admin/auth/login    # 400 = API reached
curl -s -o /dev/null -w 'imports guarded %{http_code}\n' https://globalexperiment.org/api/admin/imports/status  # 401
```

In the browser (Ctrl+F5): log in at <https://globalexperiment.org/admin/login>
with the **current** password, open **People → Notion import**: both cards
are available (no "isn't configured" message). People and Organizations are
empty — the demo records stay in the archive.

**Stop** and go to §10 if the API doesn't start, or the admin login fails
(a `401` with the right password means step 4b didn't take — tell me before
anything else).

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
select current_database()::text
union all select 'domains '||count(*) from expertise_domains
union all select 'fields '||count(*) from expertise_fields
union all select 'expertise '||count(*) from expertise_items
union all select 'team links '||count(*) from expertise_teams
union all select 'people '||count(*) from people
union all select 'organizations '||count(*) from organizations
union all select 'demo people '||count(*) from people where id::text like 'de000000-%' or email ilike '%example.org'
union all select 'demo organizations '||count(*) from organizations where id::text like 'de000000-%' or email ilike '%example.org' or website ilike '%example.org%'
union all select 'import runs '||count(*) from import_runs;
SQL
with_env sh -c 'psql "$DATABASE_URL" -At -f "$1"' _ "$BACKUP_DIR/verify.sql"
# Expected: global_experiment, domains 14, fields 120, expertise 1105, team links 1400,
#           people 0, organizations 0, demo 0, demo 0, import runs ≥ 3
with_demo sh -c 'psql "$DATABASE_URL" -At -c "select count(*) from drizzle.__drizzle_migrations"'
# Expected: 2 — the archive is untouched
```

In the admin: **Domains** "14 of 14", **Fields** "120 of 120", **Expertise**
"1105 of 1105" (each with "Managed in Notion – updated by the importer"),
**People** and **Organizations** empty, **Notion import** history shows the
dry runs and the apply.

---

## 10. Rollback

Use it if a step above fails and can't be fixed on the spot. It restores
`global_experiment` from step 1's backup, puts `demo-db.conf` back (so the
API runs on the demo archive again, exactly as before) and redeploys
`4eb86de`. The demo archive was never modified, so it needs no restore.

```bash
cd /opt/global-experiment
export STAMP=<the STAMP from step 1>  BACKUP_DIR=/root/backups
export API_ENV=/etc/global-experiment/api.env
with_env() { ( set -a; . "$API_ENV"; set +a; "$@" ); }
systemctl stop global-experiment.service global-experiment-api.service

# 1) Configuration back to its state before the release
cp -p "$BACKUP_DIR/api.env.$STAMP" /etc/global-experiment/api.env          # removes the Notion lines
cp -p "$BACKUP_DIR/systemd-$STAMP/global-experiment-api.service.d/demo-db.conf" /etc/systemd/system/global-experiment-api.service.d/demo-db.conf
systemctl daemon-reload
systemctl cat global-experiment-api.service | grep EnvironmentFile   # Expected: api.env, then EnvironmentFile=, then api-demo.env

# 2) global_experiment back to the backup (drops this release's tables and data first)
with_env sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "drop schema if exists drizzle cascade; drop schema public cascade; create schema public;"'
with_env sh -c 'pg_restore --no-owner --no-privileges --exit-on-error --dbname="$DATABASE_URL" "$1"' _ "$BACKUP_DIR/ge-prod-$STAMP.dump"
with_env sh -c 'psql "$DATABASE_URL" -At -c "select current_database(), count(*) from drizzle.__drizzle_migrations"'   # Expected: global_experiment|2

# 3) Code back to 4eb86de
git checkout 4eb86de
npm ci && npm run build && npm run api:build
grep -c 'api/admin' .next/routes-manifest.json    # 1 or more
chown -R globalexp:globalexp /opt/global-experiment/.next   # the website writes its cache here (see step 2)

systemctl start global-experiment-api.service global-experiment.service
# then the health checks of step 7 — the running API database is global_experiment_demo_dev again
```

- Double-check every `drop schema` command runs through `with_env`
  (`global_experiment`), **never** `with_demo`.
- If `drop schema public` fails with *must be owner*, run the two database
  commands as the PostgreSQL superuser instead:
  `sudo -u postgres psql -d global_experiment -c "…"` and
  `sudo -u postgres pg_restore --no-owner --role=<app user> -d global_experiment <dump>`.
- The server is then on a detached `4eb86de`; `git checkout develop` before
  the next release attempt.

---

## Record of the run

Fill in as you go (no secrets): `STAMP`, dump file names and SHA-256, owner
password result (step 4b), migration NOTICE count, purge totals, taxonomy dry
run / apply / second dry run results, verification counts, and anything that
differed from **Expected**.

### Run of 2026-10-14 (release `812afde`)

| Step | Result |
|---|---|
| 0 Pre-flight | Running API on `api-demo.env` → `global_experiment_demo_dev`; `api.env` → `global_experiment`; `NODE_ENV=production`. Archive held only demo records; owner password hash differed. Decision: production = `global_experiment`. |
| 1 Backup | `STAMP=20261014-114324`, no service stopped. `ge-prod-20261014-114324.dump` (30,887 bytes, 13 TABLE DATA) SHA-256 `2f5b4ef9b1cee4eb40a575389c02f4b59ab1a4fdb6eeb87f9452c7a2af9d6663`; `ge-demo-archive-20261014-114324.dump` (35,436 bytes, 13 TABLE DATA) SHA-256 `d2bdf578c8dae6d6a50c6e3124e698c2913eb8627fbf04977f5722762fdb0f3a`. Both copied to `ge-db-backups`, hashes identical. Env files and systemd units copied. |
| 2 Update and build | Services stopped 12:18:56 UTC. `develop` fast-forwarded `4eb86de..812afde`; `npm ci` (638 packages), web build, API build OK; `api/admin` in routes manifest (3). |
| 3 Notion settings | 6 `NOTION_*` variables added to `api.env` (transferred via a temp file, deleted on both sides); `api.env` still `root:root 600`. |
| 4 `demo-db.conf` | Moved to `/root/backups/demo-db.conf.removed-20261014-114324`; unit now only `EnvironmentFile=/etc/global-experiment/api.env`. `api-demo.env` left in place, unused. |
| 4b Owner password | Before: different. One-transaction update of `password_hash` (1 owner matched). After: **identical**. |
| 5 Migrations | Applied successfully; 5 migrations; sources `candide,ai,contribution_email,other`; statuses `active,proposed,deprecated`. 0 "source removed" NOTICE lines. |
| 6 Purge | Dry run on `global_experiment`: 0 person, 0 organization, 0 expertise, 0 field, 0 domain. `--confirm` skipped. |
| 7 Restart and health | Services started 12:21:19 UTC, both active, no API errors. Running API database `global_experiment`. api health 200, web home 200, web docs 200, public site 200, admin proxy 400, imports guarded 401. |
| 8 Taxonomy import | Dry run: Notion 14 / 120 / 1105, created 14 / 120 / 1105, 1400 team links, 0 skipped / flagged / missing. Apply (one transaction): same. Second dry run: 0 changes. |
| 9 Verify | `global_experiment`: domains 14, fields 120, expertise 1105, team links 1400, people 0, organizations 0, demo people 0, demo organizations 0, import runs 3. Archive untouched: 2 migrations, 48 people, 12 organizations. |

**Downtime:** 12:18:56 → 12:21:19 UTC (14:18:56 → 14:21:19 Zurich), about
2 min 23 s for both the website and the admin.

**Differed from Expected (none blocking):**

- Migration output also shows two Drizzle bookkeeping NOTICEs (`schema
  "drizzle" already exists`, `relation "__drizzle_migrations" already
  exists`) — normal for a database that already has migrations.
- The website logs `EACCES … .next/cache/fetch-cache` ("Failed to update
  prerender cache"): `.next/cache` is owned by root while the service runs as
  `globalexp`. Already present before the release (110 lines since
  2026-10-10); pages are served normally (home, documentation and its 8 Notion
  pages return 200 with content). To fix separately:
  `chown -R globalexp:globalexp /opt/global-experiment/.next/cache`.
- The admin browser login was left to the owner (password not known to the
  operator).
