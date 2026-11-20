# 022 — One identity for participants and admins

## Status

Accepted — 2026-11-19 (OPS-104), for the teams and governance work
(roadmap §4). Replaces the plan in overview §7 for a separate participant
`accounts` table next to `admin_users`. It changes nothing in the database
today.

## Context

The first architecture kept two identities:

- `admin_users` for the staff who run the admin;
- a future `accounts` table for participants, linked to `admin_users` when
  a participant also became an admin.

Two tables meant two sign-in paths, two session rules and a link between
them.

The client's decisions for teams change who an admin is:

- At sign-up, a participant picks up to 10 areas of expertise. Each
  expertise belongs to one or more of the six teams (`expertise_teams`).
- The participant becomes an **Admin** of every team linked to their
  choices. Several teams are allowed.
- Removing an expertise later removes them from a team no other choice
  links to, unless an individual permission keeps them in.
- Roles exist per team (Admin, Superadmin, Auditor). Rootadmins sit above
  all teams.

So most participants are team admins from their first day, and people move
in and out of teams as their expertise changes. With two tables, almost
every participant would need both rows from sign-up, and every change of
expertise would cross the link.

ADR 018 already went part of the way:

- whoever opens an invitation link creates their own account;
- the account has no role until one is given;
- accounts have their own expertise (`admin_user_expertise`, up to 10, the
  same taxonomy and limit as participant profiles).

## Decision

- **One accounts table holds everyone.** Today's `admin_users` is that
  table. The name stays for now, to avoid churn; a rename can come later
  as its own change.
- **A participant is an account with no team membership** (and not a
  Rootadmin). Participants sign in, edit their own profile and use the
  participant pages; they have no admin permission.
- **Team membership grants admin access.** An account with at least one
  active team membership, or a Rootadmin, reaches the admin, limited to
  what its memberships and individual permissions allow.
  `team_memberships(account, team, role)` points at the same table.
- **Admin routes stay closed to participants.** Every admin route keeps
  declaring the permission it needs, and the guard still refuses a route
  without one. A participant holds no permission, so it reaches only the
  routes for one's own profile. Participant pages get their own route
  group and guard.
- **Today's roles move to team memberships** in the teams work. Each
  account keeps the access it has today, and the move is checked account
  by account before release.
- **Sign-up for participants** adds what invitation sign-up doesn't need
  yet: email verification, abuse controls on the public sign-up route, and
  the participant's expertise chosen on the way in.

## Consequences

- **One sign-in, one session cookie, one password policy and one profile**
  for everyone. Becoming an admin, or leaving a team, is a membership
  change, not an account change.
- **History keeps one actor per person,** whether they acted as a
  participant or as a team member.
- **Admin routes must never trust "signed in" alone.** The routes open to
  any signed-in account are the ones for one's own profile, and tests
  check that an account without a membership reads nothing else.
- **The admin's lists and counts scale with participants,** not only
  staff. The account and History lists need indexes, and the participant
  sign-up needs abuse controls, before sign-up opens (roadmap §4, phase 0).
- **Overview §7 changes** for participant accounts and teams. Data-model
  §10 no longer plans a separate participant table.
- **Reversible later at a cost:** splitting the table again would mean
  moving rows and sessions. Keeping one table is the cheaper path for the
  agreed plan.
