# Operations

How the site goes live, in general terms. Only the maintainer deploys and
has access to the production server and its data; contributors never need
either (see [CONTRIBUTING.md](../../CONTRIBUTING.md)).

**Release records and server notes are never kept in this repository**,
which is public. They live only in the maintainer's private operations
folder, outside any git working copy. Only the generic process below and the
client-facing note of each delivery ([docs/releases](../releases)) are here.

## A release

1. **Merged and green.** The change is merged into `develop` and the CI run
   on that commit passes (lint, types, tests on PGlite and on PostgreSQL 17,
   builds, commit messages, formatting).
2. **Security pre-flight.** An automatic check on the production server must
   pass, or the release stops: access by key only, a firewall that lets
   through nothing but web traffic and the maintainer's access, and
   protection against repeated sign-in attempts. The same check also runs on
   a schedule.
3. **Backup.** The database and the server's configuration are backed up
   just before the release. The backup is copied off the server and both
   copies' checksums must match.
4. **Migrations, rehearsed.** A release that changes the database is first
   rehearsed on a copy of production restored on the maintainer's machine.
   Before a migration removes a column or a link, the values it holds are
   counted; if any are real data, the client decides what happens to them
   before the migration is written.
5. **Deploy.** The services stop, the server moves to the released commit,
   installs, builds, applies the migrations and starts again; the health
   checks must answer. The site is offline for well under a minute.
6. **Checks without writing data.** Counts are compared with the rehearsal,
   the public pages and the admin sign-in page are opened, unsigned API
   requests must be refused, and the logs must show no error. Nothing is
   imported and no test data is created on production.
7. **Records.** The maintainer writes the release record (the commit, the CI
   run, the backup's checksum, the counts, the checks) in the private
   operations folder, never in the repository; the client gets a
   plain-language note in `docs/releases`.

## Rollback

Without a migration: the previous commit is deployed again. With a
migration that removed data: the backup taken in step 3 is restored, then
the previous commit is deployed; anything written after the release is lost,
which is why releases are checked right away.

## Secrets and settings

Production settings and keys live only on the server, outside the
repository, readable only by the services that need them. They are never
committed, never printed in logs or records, and never needed by a
contributor: `npm run setup` gives every machine its own local values
(see [.env.example](../../.env.example)).

## Also here

- [stripe.md](stripe.md) — how donations connect to Stripe
- [github-collaboration.md](github-collaboration.md) — the rules GitHub
  enforces on `main` and `develop` (ruleset "Secu", applied 2026-11-09)
