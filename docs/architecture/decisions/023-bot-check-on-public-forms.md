# 023 — Bot check on public forms

## Status

Accepted — 2026-11-24 (Feedbacks and issues, part 1). Applies to the
feedback and issue composers; another public form that writes to the
database can use the same check.

## Context

The feedback and issue composers now save what visitors send, without an
account. The rate limit (10 per 15 minutes per client), the size limit and
the validation slow a script down, but they don't tell a person from a
program. The admins read every submission, so the platform needs a bot
check before it saves one.

## Decision

- **Cloudflare Turnstile**, a third party, checks that a person sends the
  form. The page loads Cloudflare's script on the first send only, so a
  visitor who never sends never contacts Cloudflare. The check shows
  nothing unless Cloudflare asks the visitor to interact.
- **The API verifies every token** with Cloudflare before it saves the
  submission: right site, right form, used once. It doesn't send the
  visitor's IP address, and it stores no IP address or other identifier of
  the sender.
- **Fail-closed.** Without a secret, or when Cloudflare can't be reached,
  the API refuses the submission (503) and logs why. It never accepts a
  submission unchecked. The composer keeps the visitor's text and says
  sending isn't available.
- **The keys.**
  - `TURNSTILE_SECRET_KEY`: in the API's environment on the server, entered
    by the maintainer. Never in the repository, the site or the browser.
  - `TURNSTILE_SITE_KEY`: public by design. Also in the API's environment;
    the API gives it to the page (`GET /api/feedback/config`), so changing
    it needs no rebuild.
  - Development without keys uses Cloudflare's documented test keys, which
    always pass. Production never does: it refuses every Cloudflare test
    key at start-up.
  - Tests check tokens in-process (`TURNSTILE_FIXTURE`, refused unless
    `NODE_ENV` is `test`); the browser tests replace Cloudflare's script.
- **CSP.** `/feedback` and `/issue`, and only those, allow
  `https://challenges.cloudflare.com` in `script-src` and `frame-src`
  (`src/shared/security/headers.ts`). ADR 010 is unchanged: no nonce.

## Consequences

- No new dependency: the browser loads Cloudflare's script by URL, and the
  API calls Cloudflare with `fetch`.
- Cloudflare processes the sending visitor's browser signals for the check.
  The data policy should say so (an open client question, with retention,
  Q11).
- If Cloudflare is down, nobody can send feedback until it is back. That is
  the price of failing closed.
- Replacing Turnstile later changes the verifier, the script and the CSP
  entry, not the submissions.
