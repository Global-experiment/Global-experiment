# GitHub collaboration settings (prepared, not applied)

**Status: prepared on 2026-11-03, not applied.** The client decides when to
apply them. They make the rules of [CONTRIBUTING.md](../../CONTRIBUTING.md)
enforced by GitHub on `Global-experiment/Global-experiment` (a public
repository, so branch protection is available on the free plan).

## What they do

For `main` and `develop`:

- **Pull request required**: nobody pushes to these branches directly; every
  change arrives through a pull request.
- **CI required**: the `build`, `api-postgres` and `conventions` jobs of
  `.github/workflows/ci.yml` must pass, on a branch up to date with its base.
- **1 review**, from the code owner (`.github/CODEOWNERS`: `@snowopard`); a
  new push dismisses an earlier approval.
- **No force push, no branch deletion**; open conversations must be resolved.

Repository administrators are **not** bound by these rules
(`enforce_admins: false`). The maintainer is the only reviewer: if the rules
bound administrators, the maintainer's own pull requests (and the release
records pushed after a deploy) could never be merged. Set `enforce_admins` to
`true` once a second reviewer exists.

## Prerequisites

- The GitHub CLI (`gh`), signed in as a repository administrator
  (`gh auth status`).
- The `conventions` job must have run at least once on the repository, so
  GitHub knows the check's name (it runs on every push and pull request).

## Apply

Run from any folder (Git Bash, macOS or Linux shell). Each command sets the
whole protection of one branch; running it again is safe.

```bash
for BRANCH in main develop; do
gh api --method PUT "repos/Global-experiment/Global-experiment/branches/$BRANCH/protection" \
  -H "Accept: application/vnd.github+json" --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [{ "context": "build" }, { "context": "api-postgres" }, { "context": "conventions" }]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF
done
```

## Check

```bash
for BRANCH in main develop; do
  gh api "repos/Global-experiment/Global-experiment/branches/$BRANCH/protection" \
    --jq '{branch: "'"$BRANCH"'", checks: [.required_status_checks.checks[].context], reviews: .required_pull_request_reviews.required_approving_review_count, force_push: .allow_force_pushes.enabled}'
done
```

Expected: the three checks, 1 review, `force_push: false`, for both
branches.

## Undo

```bash
for BRANCH in main develop; do
  gh api --method DELETE "repos/Global-experiment/Global-experiment/branches/$BRANCH/protection"
done
```

## Collaborators

Give contributors the **Write** role (Settings → Collaborators), not Admin:
they can push their own branches and open pull requests; the rules above keep
`main` and `develop` behind review and CI. Only the maintainer deploys
(production access is never shared).
