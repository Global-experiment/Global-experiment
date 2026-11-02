# 018 — Invitation links, and accounts as the experiment's participants

## Status

Accepted — 2026-11-03 (client, OPS-141, OPS-136, OPS-142, OPS-144,
OPS-135; migration 0014). Replaces "New account creates an invitation"
(overview §2.2, decision 4) and the account's link to People (decision
015). Decision 13 (no email server: links are copied by hand) still holds.

## Context

Until now a Rootadmin created an invited account (email, name, role,
optionally a person of the directory) and copied its one-time link. Candide
asked for a link with no input at all, opened by whoever is invited, who
then creates their own account. She also clarified that People is the CRM
and accounts are the experiment's participants: they are not linked, and
an account carries its own description and expertise.

## Decision

**Invitation links (`admin_invitations`).**

- "New invitation link" on Accounts makes one at once, with no input. It is
  shown once, in a modal with a copy button. Only its SHA-256 is stored and
  the token travels in the URL fragment (`/admin/join#…`), so no server or
  proxy log sees it.
- A link works once (it is marked used in the same transaction that makes
  the account) and for 7 days. A Rootadmin revokes a waiting one from
  "Invitation links", which also lists the used ones with their accounts.
- Whoever opens it gives an email (not yet used by another account) and a
  password that meets the rules. The account is created active, signed in,
  and lands on its empty profile.
- **No role, no permissions** until a Rootadmin gives a role:
  `admin_users.role` is nullable for that, and an account without a role
  sees only its profile.
- The sign-up endpoints are anonymous and rate-limited like sign-in (5 per
  15 minutes per address; inspecting a link, 20).
- Making, revoking and using a link are in the history ("link created",
  "link revoked", "created this account via an invitation link").
- Accounts invited the old way keep their per-account link; password reset
  links are unchanged; the `admin:invite` server command stays for
  bootstrapping a Rootadmin.

**Accounts.**

- No link to People (`admin_users.person_id` dropped) and no note
  (`admin_users.note` dropped). Neither had a value in production
  (2026-11-03).
- A description (`admin_users.description`, up to 5,000 characters) and
  the account's own expertise (`admin_user_expertise`, up to 10, ordered).
  The holder edits both from Profile settings; a Rootadmin
  (`accounts.manage`) edits them for any account. People keep their own
  expertise.
- The expertise picker's search is open to every signed-in account (an
  account with no role still sets its own); the taxonomy tree stays behind
  `taxonomy.read`.

## Compatibility with teams

The roles and permission keys are unchanged. A null role is the "no
membership yet" state a teams model will need too: per-team roles can be
added beside `admin_users.role` without touching invitations, profiles or
the history.

## Consequences

- An invitation can't be addressed to someone in particular: whoever has
  the link can use it, once, within 7 days. It is sent privately and can be
  revoked.
- The email an invitee gives isn't verified (there is no email server).
  The Rootadmin sees it on the account before giving a role. Accepted for
  now (client, 2026-11-03): email verification comes with the email
  infrastructure (OPS-115).
