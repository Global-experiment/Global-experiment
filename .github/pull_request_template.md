## What

<!-- What this pull request changes, in a few lines. -->

## Why

<!-- The problem it solves or the request behind it. -->

OPS card: <!-- e.g. OPS-153, or "none" -->

## Screenshots

<!-- For any visible change: before / after, light and dark, mobile and desktop when the layout differs.
     Compare with the Figma frame it follows (name the page, e.g. admin-desktop p15). -->

## Tests

<!-- What you ran and what you added. Tick what applies. -->

- [ ] `npm run lint`, `npm run typecheck` and `npm run format:check`
- [ ] `npm test` (web unit tests)
- [ ] `npm run test:e2e` (for UI changes; if you couldn't run it, say so)
- [ ] `npm run api:test` (if the API changed)
- [ ] New or updated tests for this change
- [ ] Checked in the browser with `npm run dev:local`

## Checklist

- [ ] Branch from `develop`, pull request into `develop`
- [ ] Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`…)
- [ ] No secret, `.env*` file, database dump, design export or real personal data in the diff
- [ ] Changes to `apps/api/`, migrations, schema, `.env*`, CI, `CODEOWNERS` or dependencies were agreed with the maintainer first (or there are none)
