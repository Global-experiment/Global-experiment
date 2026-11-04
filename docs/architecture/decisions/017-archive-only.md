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
- Removing a link between two records (a person's organization or
  expertise) is not a deletion: both records stay, and the history shows
  the link's removal.
- Comments, supporting documents and pictures are archive-only too
  (amendment below, Delivery 6).
- The `*.delete` permission keys stay in `admin_permissions` and the role
  matrix, unused, until the teams and memberships model replaces the
  fixed roles (Later cleanup of decision 016).

## Amendment — Delivery 6 (2026-11-04): comments, documents, pictures

Asked by the client on 2026-11-03. Nothing a person added is deleted, in
the admin or through the API; removing it archives it.

- **Comments.** "Delete" becomes **Archive**: the comment is hidden from
  the other admins (they see "This comment was archived.", never its text,
  not even in its edits), kept, and its author restores it. Events:
  `comment_archived`, `comment_restored`. `DELETE /api/admin/comments/:id`
  is gone; `POST …/comments/:id/archive` and `…/restore` replace it.
  Comments deleted before migration 0015 became archived, so they can be
  restored too; their old "deleted a comment" events stay as they were.
- **Treasury supporting documents.** "Delete" becomes **Archive**: the
  document moves to "Archived documents" on the entry, stays downloadable
  for the Treasury roles, and is restored from there (or by uploading the
  same file again). Events: `file_archived`, `file_restored`, naming the
  file. `DELETE /api/admin/treasury/documents/:id` is gone;
  `POST …/documents/:id/archive` and `…/restore` replace it.
- **Profile pictures.** Removing or replacing a picture archives it: it is
  listed under "Previous pictures" on Profile and can be used again.
  Events: `file_archived` / `file_restored` on the account.
- **Files are never removed from the storage.** The storage interface has
  no delete any more; files are content-addressed, so keeping them never
  stores the same file twice. Pictures and documents removed before
  migration 0015 were already deleted and can't be recovered.
- Home and Documentation images (Delivery 6, ADR 020) follow the same
  rule: every revision keeps the images it used.

## Consequences

- A record entered by mistake is archived, not removed; its number stays
  taken.
- A person or organization that an expense names was already protected
  from deletion; nothing changes for the Treasury ledger.
- The server scripts that purge demo or sample data (`purge-demo-data`,
  `purge-sample-treasury`) are operator tools run with a backup, not admin
  options; they are untouched.
