<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Everything below is the project's own guide. `next dev` only rewrites the block above, between its two markers: keep that block as it is and edit below. -->

# Working on the Global experiment

Rules for every contributor and every coding assistant. The details (setup, structure, tests, pull requests) are in [CONTRIBUTING.md](CONTRIBUTING.md); read it first. When this file and a request disagree, or something is unclear, ask the maintainer instead of guessing.

## Workflow

- Branch from `develop`: `fix/`, `feat/`, `docs/`, `chore/`, `refactor/` or `test/` followed by a short name (`fix/treasury-filter-reset`).
- One topic per branch and per pull request.
- Open pull requests into `develop` only. Never push to `main` or `develop` directly; only the maintainer merges and deploys.
- Commit messages are Conventional Commits (`fix(treasury): reset keeps the year`). Name the OPS card in the commit or the pull request (`OPS-153`).
- Fill in the pull request template. Add before/after screenshots for every visible change (light and dark, mobile and desktop when the layout differs) and name the Figma frame.

## What a frontend contributor changes

Frontend:

- `src/app/` (routes: `(public)/` pages and `admin/`), except `src/app/api/`
- `src/modules/` (`admin/`, `documentation/`, `home/`)
- `src/shared/` (shared UI in `src/shared/ui/`, formatting, validation), except `src/shared/security/`
- `src/app/globals.css` (theme tokens)
- `public/assets/`
- `e2e/` (browser tests for what you change)

Ask the maintainer **before** changing any of these:

- `apps/api/` (the API), `apps/api/drizzle/` (migrations), any `*.schema.ts` (database tables)
- `src/app/api/`, `src/shared/security/`, `next.config.ts`
- `.env*` files and `.env.example`
- `.github/` (CI workflows, `CODEOWNERS`, the pull request template), `.husky/`, lint, format and test configs
- `package.json` and `package-lock.json`: no new dependency, removal or version change

## Design

- Follow the client's Figma files and the existing design system: layout, spacing, sizes, colours and icons come from there.
- Reuse an existing component (`src/shared/ui/`, `src/modules/*/`) before creating one. Extend it rather than copying it.
- Icons: only the exact Figma assets in `public/assets/icons/figma/`. If the icon you need isn't there, stop and ask; don't draw, download or substitute one.
- No inline styles and no hard-coded colours or sizes where a theme token exists (`src/app/globals.css`).
- Every screen works in light and dark, on mobile and desktop.
- Accessibility: every control has a label, everything works with the keyboard (visible focus, logical order), text meets contrast, and the axe checks in the browser tests pass.

## Code quality

- TypeScript strict. No `any` (ESLint rejects it); no `@ts-ignore` or disabled lint rules to get past a check.
- No dead code, commented-out code or leftover `console.log`.
- Small components with one job. Follow the patterns, names and comments of the code around you.
- User-facing text is plain, short English and never shows technical details.
- Add or update tests with the change (see CONTRIBUTING.md, Tests).

## Before pushing

```bash
npm run lint          # ESLint
npm run typecheck     # types (site)
npm test              # unit tests (site)
npm run format:check  # formatting
npm run test:e2e      # browser tests, for UI changes
```

`npm run test:e2e` needs a local PostgreSQL test database (CONTRIBUTING.md, Tests). If you can't run it, say so in the pull request and the maintainer runs it. If you were allowed to change the API, also run `npm run api:typecheck` and `npm run api:test`.

The git hooks installed by `npm ci` run on every commit: ESLint `--fix` and Prettier on the staged code and CSS files, then commitlint on the message. They don't run type checks or tests, and CI runs everything again on the pull request.

## Never

- Commit a secret, a `.env*` file (other than `.env.example`), a database dump, a design export (`docs/design/`) or real personal data. Test data is made up and lives only in test files.
- Use production credentials, keys or data. Local setup is `npm run setup`; it creates everything you need.
- Delete data. Records are archived and restored, never deleted (archive only, [ADR 017](docs/architecture/decisions/017-archive-only.md)).
- Edit generated files: migrations in `apps/api/drizzle/`, `next-env.d.ts`, `package-lock.json` by hand, or the Next.js block at the top of this file.

## For coding assistants

- Read this file and [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything, and the Next.js guide for what you touch (`node_modules/next/dist/docs/`).
- Follow the existing patterns. Look for a similar component, route or test and match it.
- Don't invent APIs, endpoints, props, tokens or packages. Check that they exist in this repository or in the installed version's docs.
- Stay within the scope above. When something is unclear or out of scope, ask instead of guessing.
- Explain every change in the pull request description: what changed, why, and how it was tested.
