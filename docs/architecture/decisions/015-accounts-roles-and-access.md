# 015. Accounts, roles and access

## Status

Accepted (2026-10-28), Delivery 2. Extends 014 (owner admin
authentication): the session, password hashing, CSRF and rate limits are
unchanged.

## Context

The admin designs (p15 Accounts, p16 Services, p17 Permissions, p18
Profile settings) need more than one admin, with team roles, and a record
of who has access to which outside service. 014 allowed exactly one owner
and no invitations; there is still no email server (decision 13 of
2026-10-19).

## Decision

- **Roles and permissions as data.** `admin_roles`, `admin_permissions`
  (`module.action`) and `admin_role_permissions`, seeded by migration 0012
  from `apps/api/src/access-control/permissions.ts`; a test keeps the seed
  equal to the file. The matrix is in overview §3.1. Several Rootadmins
  (`owner`) are allowed.
- **One guard, fail closed.** `PermissionGuard` runs after the session
  guard on every `admin/*` route and reads the route's declaration
  (`@Requires`, `@RequiresAny`, `@RequiresForParam`, `@SignedIn`); a route
  without one is refused. Denials answer 403 and are logged on the account
  (`permission_denied`). A test walks every route, compares it with a
  reviewed table, and calls each route as each role.
- **The UI hides, the API decides.** The session carries the role's
  permission keys; the admin hides menu entries and actions the role can't
  use and opens records view-only, and never calls an endpoint the role
  can't use. Data the role can't read is removed by the API (a person's
  permissions without `access.read`).
- **Never without a Rootadmin.** The service refuses to deactivate or
  demote the last active Rootadmin; a deferred constraint trigger refuses
  any change or deletion of an active Rootadmin that leaves none.
  Accounts are deactivated, never deleted (decision 14).
- **One-time links instead of emails.** Invitations and password resets
  are links a Rootadmin copies and sends: 32 random bytes (base64url) in
  the URL fragment, never in a request line or a log; only the SHA-256 is
  stored; 72 hours, single use (consumed atomically), and a new link
  cancels the previous one. Every invalid link gets the same answer. With
  `email.enabled` (later) the same links are emailed.
- **Passwords** (NIST SP 800-63B style): 12–128 characters; under 20, at
  least three character classes; not the email or the name; not one
  repeated character; not a common password. The web checklist mirrors
  the API's rules and a test compares them.
- **Profile** (p18): display name, picture (PNG, JPEG or WebP up to 2 MB,
  type read from the bytes, stored by the content-addressed file storage,
  served with `nosniff`), time zone (IANA; empty = the browser's),
  appearance (System, Light, Dark — replaces the temporary light preview
  toggle), email and password changes with the current password, and
  deactivation of one's own account.
- **Access grants** (Permissions) belong to a person of the directory and
  optionally their admin account (decision 5). Granting, changing and
  revoking access is recorded in the history of the person, the account
  and the service.

## Consequences

- A new role or a changed right is a row change (and the file, for the
  next fresh database), not a code change in the controllers.
- An admin on a light-themed device now sees the light appearance by
  default (System); Dark stays the site's default without an account.
- The set-owner CLI remains the recovery path: it makes an account an
  active Rootadmin with a new password and applies the password rules.
