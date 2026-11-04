# Contributing to the Global experiment

Thank you for helping. This guide is everything you need to work on the site
and the admin on your own machine. You never need a production password,
key or database to do so.

## Requirements

- **Node.js 22 or later** (with npm) — <https://nodejs.org>
- **Git**
- Windows, macOS or Linux. Nothing else to install: the local database runs
  inside the app (PGlite, PostgreSQL in a folder).

## Set up (once)

```bash
git clone https://github.com/Global-experiment/Global-experiment.git
cd Global-experiment
git checkout develop
npm ci
npm run setup
```

Recent npm versions end `npm ci` with `npm warn allow-scripts` lines about
packages whose install scripts they didn't run: that is expected, nothing to
approve; the project works without them.

`npm run setup`:

- writes `.env.local` (never committed) with local-only values: the local
  database (`DATABASE_URL=pglite:.data/pglite`), secrets generated for your
  machine, and a local Rootadmin login. It never overwrites a value already
  there;
- creates the local database, applies the migrations and fills it with
  made-up sample records (people, organizations, expertise, Treasury entries);
- prints the local Rootadmin's email and password (also kept in `.env.local`).

It refuses to touch anything but a local database: PGlite, or a PostgreSQL
server on your own machine whose database is named `…_dev` (or `…_test`).

## Run

```bash
npm run dev:local
```

This starts both parts together (Ctrl+C stops both):

- the site and the admin (Next.js): <http://localhost:3000> and
  <http://localhost:3000/admin> — sign in with the local Rootadmin;
- the API (NestJS) on <http://127.0.0.1:4000>, which the site calls.

Wait for `Ready` before opening the browser: the first visit of each page
compiles it, which takes a few seconds.

### After pulling changes

```bash
npm ci            # when package-lock.json changed
npm run setup     # when there are new migrations (it keeps your data)
```

Start again from empty sample data with `npm run setup -- --reset` (stop
`npm run dev:local` first: the local database can only be open once).

### What works without extra keys

Everything, Home and Documentation included (`npm run setup` loads sample
pages — a copy of the public text — that you edit in the admin), except
what needs outside services:

| Part | Without keys | To work on it |
|---|---|---|
| Donations | The donate page says "Donations are unavailable" | Your **own** Stripe account's test keys (`sk_test_…`, `pk_test_…`) and `DONATIONS_ENABLED=true` — see [docs/operations/stripe.md](docs/operations/stripe.md) |
| Email, AI | Not built yet | — |

Every variable is described in [.env.example](.env.example).

## Project structure

```
src/                 The website and the admin (Next.js App Router)
  app/               Routes: (public) pages, admin/, api/ proxies
  modules/           Features: admin/ (the admin screens), documentation/, home/
  shared/            Shared UI (shared/ui), configuration, formatting, validation
apps/api/            The API (NestJS) — the only part that talks to the database
  src/<module>/      One folder per area: people, organizations, treasury, accounts…
                     (controller, service, repository, *.schema.ts tables, tests)
  drizzle/           Database migrations (generated, never edited by hand)
e2e/                 Browser tests (Playwright)
docs/architecture/   How it is built, and the decisions (decisions/NNN-*.md)
docs/operations/     Releases and server operations (maintainer)
docs/releases/       Notes for the client, one per delivery
```

Next.js in this project is a recent version whose conventions may differ from
what you know: read the guide for what you touch in
`node_modules/next/dist/docs/` (see [AGENTS.md](AGENTS.md)).

## Design

The screens follow the client's Figma files: layout, spacing, sizes, colors
and icons come from there (ask the maintainer for access). Colors and sizes
are theme tokens (`src/app/globals.css`); don't hard-code new ones. Icons are
the Figma assets in `public/assets/icons/figma/`. Every screen works in light
and dark, on mobile and desktop. Design exports stay on your machine: never
commit them (`docs/design/` is ignored).

## Branches and commits

- Branch from **`develop`**, named after the kind of change:
  `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`
  (also `chore/`, `refactor/`, `test/`).
- Commit messages follow **Conventional Commits**, like the existing history:

  ```
  feat(treasury): filters below the stats
  fix(admin): signing out always lands on the login page
  docs: how to run the browser tests
  ```

  Type (`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`,
  `ci`, `build`), an optional scope in brackets, then what changed. Mention
  the OPS card when there is one (`… (OPS-153)`).
- Git hooks (installed by `npm ci`) check this for you:
  - **before each commit**: ESLint and Prettier fix and format the files you
    staged (only those, so it's quick);
  - **on the message**: commitlint refuses a message that isn't a
    Conventional Commit. The hooks never change your message.

  CI runs the same checks, so skipping the hooks doesn't get a change merged.

## Pull requests

- Open pull requests **into `develop` only** (never `main`). Fill in the
  template: what, why, the OPS card, screenshots of visible changes, tests.
- **CI must pass** (lint, types, tests, builds, commit messages, formatting).
- **A review is required**: the maintainer reviews every pull request.
- Keep a pull request to one change; rebase on `develop` if it falls behind.
- **Only the maintainer merges to `main` and deploys.** Contributors never
  need, and never get, access to the server or production data.

## Tests

```bash
npm run lint          # ESLint
npm run typecheck     # types (site)
npm test              # unit tests (site)
npm run api:typecheck # types (API)
npm run api:test      # API tests on PGlite (no database to install)
npm run format:check  # formatting
```

Optional, with a PostgreSQL 17 server on your machine and a database named
`…_test` (it is wiped by the tests) in `TEST_DATABASE_URL`:

```bash
npm run api:test:pg   # API tests on real PostgreSQL
npm run test:e2e      # browser tests (Playwright)
```

Add or update tests with every change: unit tests next to the code
(`*.test.ts`), API tests in `apps/api/src/<module>/*.e2e.test.ts`, browser
tests in `e2e/`. Test data (fixtures) only ever lives in test files.

## Code style

- TypeScript everywhere; Prettier formats (line width 160), ESLint checks.
  Run `npm run format` to format everything.
- Follow the code around you: names, comments, patterns.
- The API owns the database: the site never connects to it, it calls the API.
- User-facing text is plain English, short, and never shows technical
  details or error internals.

## No secrets, ever

- Never commit a password, key, token, `.env*` file (except `.env.example`,
  which has no values), database dump or private file. `.gitignore` covers
  them; check `git status` before committing.
- Never paste a secret into an issue, a pull request or a commit message.
- Never use production keys locally. For Stripe, use your own test account.
- If you think a secret was committed, tell the maintainer at once: it must
  be revoked and replaced, not just deleted.

## For maintainers

- **Release records and server notes never go in this repository**, which is
  public. They live only in the maintainer's private operations folder,
  outside any git working copy: the release records (commit, CI run, backup
  name and checksum, counts, checks), server procedures, addresses, accounts,
  paths and firewall details.
- What goes in the repository is generic: the release process in
  [docs/operations/README.md](docs/operations/README.md) and, for each
  delivery, a plain-language note for the client in `docs/releases/`.
- Before committing an operations document, check that it names no server,
  address, account, path, backup or database that exists in production.
