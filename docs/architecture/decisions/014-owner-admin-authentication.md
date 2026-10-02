# 014. Owner Admin Authentication

## Status

Accepted (2026-10-03), confirmed by the project owner: password +
server-side session for v0.1's single owner admin. No two-factor
authentication and no third-party auth provider for now; the
implementation stays isolated in `apps/api/src/auth` so either can be
added if explicitly requested later.

## Context

v0.1 has exactly one admin (the owner, Candide): no participant accounts,
no team accounts, no contributor login. Admin endpoints must be protected
server-side regardless of what the frontend shows.

## Decision

- **One owner**: `admin_users` with a `role` column and a partial unique
  index allowing at most one `owner`. No signup endpoint; the owner is
  created or re-keyed with a local CLI (`admin:set-owner`) that reads the
  password from a hidden prompt, never from argv. Re-keying revokes every
  session.
- **Passwords**: Node's built-in scrypt (N=2^17, r=8, p=1, 16-byte salt),
  versioned hash format; minimum 12 characters; unknown emails still pay
  one hash verification (no user enumeration by timing); one uniform error.
- **Sessions**: 256-bit opaque token in an `HttpOnly; Secure;
  SameSite=Strict; Path=/` cookie (`__Host-` prefix when secure); only its
  SHA-256 is stored. Idle timeout (default 8 h) and absolute cap (default
  7 days); server-side revocation on logout. Nothing in `localStorage`.
- **Authorization**: global guard — every controller whose declared path
  starts with `admin` requires a live session, decided from route metadata
  (not the raw URL); routing is case-sensitive as defence in depth. Only
  the login handler opts out.
- **CSRF**: SameSite=Strict plus an Origin/Referer allow-list check on every
  state-changing admin request, including login.
- **Brute force**: login limited to 5 attempts per 15 minutes per client IP
  (in-memory limiter, adequate for one API instance); client IP from
  `X-Forwarded-For` only for configured trusted proxy hops.

## Alternatives considered

- **External identity provider / OAuth (e.g. Google, GitHub)** — avoids
  password storage but adds an external dependency and account-recovery
  coupling; not chosen without a requirement.
- **JWT in localStorage** — rejected: exposed to XSS, no server-side
  revocation.
- **Supabase Auth** — rejected by ADR 002 for v0.1.

## Trade-offs

- Password-only until 2FA is confirmed; recovery is the local CLI.
- The rate limiter's in-memory store resets on restart and does not span
  multiple API instances; switch to a Postgres-backed store if the API is
  ever scaled out.

## Future migration implications

Additional roles extend the `role` check constraint and add authorization
rules per controller; the session and guard mechanics stay.
