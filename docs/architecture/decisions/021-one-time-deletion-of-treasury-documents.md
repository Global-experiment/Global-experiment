# 021 — One-time deletion of Treasury supporting documents

## Status

Accepted — 2026-11-10 (OPS-155). A written, one-time exception to ADR 017
(archive only). Changes nothing else in ADR 017.

## Context

Treasury entries could carry supporting documents (invoices, receipts:
`treasury_documents`, migration 0007; the files in the content-addressed
file storage). Since ADR 017 they were archived and restored, never
deleted.

On 2026-11-10 the client asked, in OPS-155, for three things on the expense
detail page:

1. Recipient, Expense type, Name, Description and Review status first, then
   the rest; every field editable by a Rootadmin.
2. No Document field: the accounting documents are now handled outside the
   platform, by the accountants.
3. "Exceptionally, permanently delete any documents already attached to
   expenses. Clean slate."

The third point contradicts archive-only, so it is recorded here, as an
exception that applies once and to these rows only.

## Decision

- **No document feature any more** (for every entry type, not only expenses:
  the documents now live with the accountants). The admin shows no Documents
  field or column; the API has no upload, list, download, archive or restore
  route and no `documents` filter. The table `treasury_documents` stays (no
  migration drops it): its History events still name the files, and the
  deletion below needs it.
- **The one-time deletion** is a script, `npm run
  api:purge-treasury-documents` (`apps/api/src/scripts/treasury-documents-purge.ts`):
  - Dry run by default: counts only (documents per entry type, entries,
    stored files and bytes), no names.
  - It deletes only with `--confirm --backup <file> --sha256 <hex>`: a
    PostgreSQL custom-format backup taken in the last 24 hours, whose SHA-256
    was verified (the same on the server and on the off-site copy).
  - In one transaction: one History event per entry (an "updated" change of
    Documents, from the files to none, by "One-time document deletion
    (OPS-155)"), then every `treasury_documents` row. After the commit, each
    stored file that no profile picture or CMS image also uses (storage is
    content-addressed, so one file can back several records).
  - Run a second time, it finds nothing and changes nothing.
- **The exception stays an exception.** `archive-only.test.ts` keeps
  forbidding any runtime delete of `treasury_documents` (and of every other
  archive-only table), keeps the file storage without a delete, and allows
  this script, and no other, to delete these rows or stored files; nothing at
  runtime may import it.
- **Rootadmin edits.** A new permission, `treasury.manage` ("Edit every
  business field of an expense"), granted to the Rootadmin role only
  (migration 0017): recipient, expense types, name, public description, date,
  amount, fee and cadence. Admin and Treasury admin keep what they had: the
  internal note (`treasury.update`), the review (`treasury.review`) and the
  publication (`treasury.publish`).

## Consequences

- Production held **0** documents on 2026-11-10 (a read-only count): the
  deletion is expected to find nothing. It is run once anyway, as part of the
  OPS-155 release, so the slate is provably clean.
- Copies of any deleted document remain in the database backups and the file
  archives taken before the deletion, until the backup retention rule removes
  them. Nothing restores them into the platform.
- Keeping accounting documents for as long as the law requires (often 10
  years) is the accountants' responsibility outside the platform.
- The History keeps the past document events (uploaded, archived, restored,
  deleted): the file names stay in it, the files don't.
- The review status "Pending documents" stays: it now means the accountants
  are waiting for a document, outside the platform.
