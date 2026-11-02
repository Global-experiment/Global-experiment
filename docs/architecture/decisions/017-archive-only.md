# 017 — Nothing is deleted, everything is archived

## Status

Accepted — 2026-11-03 (client, OPS-147). Replaces the "permanent delete"
part of decision 12 (overview §2.2) and the Treasury delete rules of
decision 016 ("Expenses copied from Notion… can be deleted permanently").

## Context

Decision 12 (2026-10-21) gave every record an archive and, for the
Rootadmin, a permanent delete behind a typed confirmation. In the first
feedback batch Candide asked for no permanent delete anywhere: "No delete
permanently options, only archive."

## Decision

- No table has a permanent delete, for any role, the Rootadmin included:
  People, Organizations, Treasury entries (manual ones too), Services,
  Permissions, and Expertise, Fields and Domains. The routes are gone from
  the API (`DELETE /api/admin/people/:id`, `/organizations/:id`,
  `/treasury/:id`, `/services/:id`, `/access-grants/:id`,
  `/expertise/{domains,fields,items}/:id` answer 404) and the "Delete
  permanently" button and its dialog are gone from the record page.
- Archive and restore stay as they were: an archived record leaves the
  default views, shows in "Archived", and is restored from there.
- Past "deleted" History events stay readable, with what the record was
  (the Treasury details kept since Delivery 3).
- Not records, so unchanged: removing a link between two records (a
  person's organization or expertise), deleting a comment (kept struck
  through in the history), removing a profile picture, and deleting a
  Treasury supporting document.
- **Next delivery (client, 2026-11-03):** comments, supporting documents
  and pictures become archive-only too: removing one hides it but keeps it
  recoverable, with a History event. Until then they are deleted as above.
- The `*.delete` permission keys stay in `admin_permissions` and the role
  matrix, unused, until the teams and memberships model replaces the
  fixed roles (Later cleanup of decision 016).

## Consequences

- A record entered by mistake is archived, not removed; its number stays
  taken.
- A person or organization that an expense names was already protected
  from deletion; nothing changes for the Treasury ledger.
- The server scripts that purge demo or sample data (`purge-demo-data`,
  `purge-sample-treasury`) are operator tools run with a backup, not admin
  options; they are untouched.
