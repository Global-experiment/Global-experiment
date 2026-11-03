# Working on the site yourself — 3 November 2026

You (and any developer you invite) can now run the whole site and admin on
your own computer, with made-up sample data, without any password or key of
the live site. Nothing you do locally can reach the live site or its data.

## What you need

- **Node.js 22 or later** (<https://nodejs.org>, the "LTS" download) and
  **Git**. Windows, Mac or Linux. Nothing else to install.

## Get started (once)

Open a terminal (on Windows: "Git Bash" or "PowerShell") and type:

```bash
git clone https://github.com/Global-experiment/Global-experiment.git
cd Global-experiment
git checkout develop
npm ci
npm run setup
```

The last step prepares everything and ends by printing **your local admin
login** (an email and a password). It only works on your computer; it is
also saved in a file named `.env.local`, which never leaves your computer.

## Every day

```bash
npm run dev:local
```

Wait until it says "Ready", then open:

- <http://localhost:3000> — the public site;
- <http://localhost:3000/admin> — the admin; sign in with your local login.

People, Organizations, Treasury, Services and the rest are filled with
made-up sample records you can change freely. To start again from fresh
sample data: stop with Ctrl+C, then `npm run setup -- --reset`.

Home and Documentation are written in Notion, so on your computer they say
"Notion isn't connected in this local setup". Ask me if you want to work on
them: I can give you read access. The donate page says "Donations are
unavailable" locally unless you add your own Stripe test account.

When `npm ci` ends with `npm warn allow-scripts` lines, that's expected:
nothing to do.

## Making a change

1. Start from `develop`: `git checkout develop`, `git pull`, then a new
   branch: `git checkout -b fix/treasury-filter-spacing` (`feat/…` for
   something new, `fix/…` for a correction, `docs/…` for text).
2. Make the change and check it in the browser.
3. Commit with a short message in this form:
   `fix(treasury): spacing above the filters`. The computer checks the
   format and tidies the code layout for you before each commit.
4. Push the branch and open a **pull request into `develop`** on GitHub,
   with screenshots. The automatic checks run, I review it, and I merge and
   put it live.

Everything is explained in more detail in `CONTRIBUTING.md`, at the top of
the project.

## Also in this delivery

- A safety scan of the project's whole history: no password or key was
  ever committed (the only matches were made-up test values).
- The code layout is now formatted automatically, the same way everywhere.
  If you have a branch in progress, update it from `develop` before
  continuing (ask me if Git reports conflicts).
- GitHub settings that protect `main` and `develop` (pull request, checks
  and review required) are ready; we switch them on when you decide.
