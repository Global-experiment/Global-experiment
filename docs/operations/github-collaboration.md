# GitHub collaboration settings

**Status: applied on 2026-11-09** to `Global-experiment/Global-experiment`.
They make the rules of [CONTRIBUTING.md](../../CONTRIBUTING.md) enforced by
GitHub. Settings → Rules → Rulesets shows them; only repository
administrators can change them.

## The ruleset "Secu" (`main` and `develop`)

One repository ruleset, **Secu**, enforcement **Active**, on the default
branch (`main`) and `develop`:

| Rule | Setting |
|---|---|
| Restrict deletions | The branches can't be deleted. |
| Block force pushes | History can't be rewritten. |
| Require signed commits | Every commit that lands on the branch has a verified signature. |
| Require a pull request | Nobody pushes to the branch directly; every change arrives through a pull request. |
| Approvals | 1, from a code owner (`.github/CODEOWNERS`: `@snowopard`). |
| Stale approvals | A new push dismisses an earlier approval. |
| Conversations | All review conversations must be resolved. |
| Status checks | `conventions`, `build` and `api-postgres` (the jobs of `.github/workflows/ci.yml`, from GitHub Actions) must pass, on a branch up to date with its base. |

A direct push to `main` or `develop` is refused, by anyone, with
`GH013: Repository rule violations found`.

## Who can bypass

Only the **`maintainers`** team (the maintainer alone; it has the Maintain
role on the repository), in **pull requests only** mode:

- the maintainer's changes still go through a pull request, and CI runs on
  it;
- the maintainer can merge their own pull request without a second
  approval, which is the reason for the bypass while there is one reviewer.

A bypass applies to the whole ruleset when merging: GitHub then offers to
merge "without waiting for requirements to be met" (approval, signatures
and checks alike). The maintainer uses it for the missing approval only, and
waits for the three checks to pass first.

No other person, role or app can bypass. Add someone to `maintainers` only
if they review and release too.

## Merge methods

Settings → General → Pull Requests:

- **Squash merge** (on): contributor pull requests into `develop`. GitHub
  creates and signs the one resulting commit, so contributors don't need to
  sign their own commits.
- **Merge commit** (on): the release pull request `develop` → `main`, which
  keeps the history.
- **Rebase merge** (off): GitHub can't sign rebased commits, so the
  signed-commits rule would refuse them.

## Signed commits

What lands on `main` and `develop` must be signed:

- squash merges and the merge commits GitHub creates are signed by GitHub;
- the maintainer signs their own commits (SSH signing key);
- commits from before 2026-11-09 are unsigned. They are already on
  `develop`; the first release pull request into `main` brings them along,
  which the maintainer's bypass allows.

Contributors may sign their commits too (optional, since squash merges cover
it). With Git 2.34 or later:

```bash
ssh-keygen -t ed25519 -C "you@example.com" -f ~/.ssh/github_signing
git config --local gpg.format ssh
git config --local user.signingkey ~/.ssh/github_signing.pub
git config --local commit.gpgsign true
```

Then add the `.pub` file on GitHub: Settings → SSH and GPG keys → New SSH
key → Key type **Signing Key**. The commit email must be a verified email of
the GitHub account, or GitHub shows the commit as Unverified.

## Check

Settings → Rules → Rulesets → Secu shows the rules above. Without the web
interface:

```bash
gh api repos/Global-experiment/Global-experiment/rules/branches/develop --jq '.[].type'
```

Expected: `deletion`, `non_fast_forward`, `required_signatures`,
`pull_request`, `required_status_checks`.

## Collaborators

Give contributors the **Write** role (Settings → Collaborators), not Admin:
they can push their own branches and open pull requests; the ruleset keeps
`main` and `develop` behind review and CI. Only the maintainer merges and
deploys (production access is never shared).
