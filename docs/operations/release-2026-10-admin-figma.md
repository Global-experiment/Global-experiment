# Release record — admin Figma conformance (October 2026)

**What shipped:** `develop` at `3e1a42e` (*Merge branch 'feat/admin-figma'
into develop*): the admin desktop Figma (login card, sidebar, list
toolbars, record pages with pills and the right panel), the 10 expertise /
5 organizations limits (API, UI, importer), Duplicate, the admin display
name (migration **0005**, nullable) and the empty-query expertise search fix.
**Before:** `812afde`.

Procedure: [release-2026-10-directory.md](release-2026-10-directory.md)
steps 1, 2, 5, 7 and 9 (no Notion settings, drop-in, purge or import
needed this time). Database: `global_experiment` via
`/etc/global-experiment/api.env`.

## Record of the run — 2026-10-14

| Step | Result |
|---|---|
| Pre-flight | Server on `812afde`, both services active, API on `global_experiment`, `.next/cache` owned by `globalexp`. |
| Backup | `STAMP=20261014-140449`, services running (pg_dump snapshot). `ge-prod-20261014-140449.dump`, 155,302 bytes, 17 TABLE DATA, SHA-256 `2577f4f789aead4b40b9048037245f26c8728875f702a988bfdff3a1d452259b`; copied to `ge-db-backups`, hash identical. `api.env` copied. |
| Update and build | Services stopped 14:05:14 UTC. `812afde..3e1a42e` (fast-forward), `npm ci` (638 packages), web and API builds OK, `api/admin` in routes manifest (3). `chown -R globalexp:globalexp .next`: 0 files left with another owner. |
| Migrations | Applied successfully: 6 migrations. `admin_users.display_name` added, nullable, empty for the owner (left for the owner to set on /admin/profile). |
| Restart and health | Services started 14:06:11 UTC, both active, no API errors, API on `global_experiment`. API health 200, home 200, documentation 200, admin login page 200 (new "Sign in to the Global experiment" card), admin proxy 400, imports without login 401. Web log: 0 "permission denied" / EACCES lines. |
| Verify | domains 14, fields 120, expertise 1105, team links 1400, people 0, organizations 0, demo 0 / 0, import runs 3 — unchanged. |

**Downtime:** 14:05:14 → 14:06:11 UTC (16:05:14 → 16:06:11 Zurich),
57 seconds, website and admin.

**Differed from Expected:** nothing.

**Rollback (not needed):** restore `ge-prod-20261014-140449.dump` into
`global_experiment` (§10 of the directory runbook), `git checkout 812afde`,
rebuild, `chown -R globalexp:globalexp .next`, restart.
