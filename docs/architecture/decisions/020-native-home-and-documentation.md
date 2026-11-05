# 020 — Native Home and Documentation: documents, revisions, publication

## Status

Accepted — 2026-11-04 (Delivery 6; OPS-26, OPS-27, OPS-28). Supersedes
ADR 003; amends ADR 009. The editor is ADR 019.

## Context

Home and Documentation were read live from Notion (ADR 003, 009). The
client asked for them to be edited in the admin with a rich-text editor,
with real versions (OPS-28: "native edits must create genuine versions"),
every change in the History, and a structure that a later "an admin
submits, Superadmins validate" step can extend without rework.

## Decision

**Documents and revisions** (migration 0016):

- `cms_documents`: one row per page — Home (exactly one) or a
  Documentation article — with its Display order, `latest_revision_id`,
  `published_revision_id`, and its first publication, unpublished and
  archived times.
- `cms_revisions`: every save is a new row: number (1, 2, 3…), status,
  title, slug, expertise tags, content, an optional summary, author and
  time, who published it and when, and the version it restores, if any.
  A database trigger refuses any change to a revision's content and any
  delete: a revision is never rewritten.
- The published revision is what visitors see. The newest one may be a
  draft; the record says so ("Version 3 is a draft; visitors see version 2").
- Status goes **draft → published**. The review step plugs in as more
  revision statuses between them (submitted, approved) and a rule on who
  may publish; the tables keep their shape.
- Restore = a new revision copying an old one (never a rewind). Archive is
  the only removal (ADR 017); nothing is deleted.

**Rights** follow the existing keys: `cms.read` sees the admin pages and
drafts, `cms.update` saves revisions (drafts), `cms.create` makes a
document, `cms.publish` publishes, unpublishes, and archives or restores a
published page. A role with `cms.update` only saves drafts.

**Content** is a block model, stored as JSON, never HTML: headings 1–4,
paragraphs, bulleted and numbered lists, images; text runs and links. The
API validates every save (unknown blocks or fields refused; links only
https, http, mailto, site paths and anchors; control characters dropped).
The website renders with React text nodes and checks links again.

**Images** go through the file storage (content-addressed, never deleted):
PNG, JPEG, WebP or GIF up to 5 MB, judged from the bytes; never SVG. An
image is public (`/api/cms/images/:id`, immutable caching, `nosniff`,
sandboxed) only once a published revision of a page on the website uses
it; before that, only `cms.read` sees it.

**Public pages** keep their URLs, slugs and anchors (`/`,
`/documentation`, `/documentation#slug`, `/documentation/slug`,
`/documentation/slug/history`). The website fetches `/api/cms/home` and
`/api/cms/documentation`, cached under the `home` and `documentation`
tags. Every publication, unpublication, archive or restore of a published
page revalidates them (5-minute fallback). A renamed article's old slug
redirects to its new one. Document history lists the published versions
only, with dates, never author names.

**History**: every change is an event on the document (`created`,
`updated` with the changed fields and the content block by block,
`published`, `unpublished`, `archived`, `restored`, `duplicated`,
`imported`), with comments and views like other records.

**The one-time import** (run on production on 2026-11-05: Home and 10
articles, then removed from the code with its npm script) read Notion
only, maps the pages with the same rules the website used, and writes
revision 1 of each page attributed to "Notion import" (published pages
published, others as drafts or archived). It was a dry run by default,
with a report; `--apply` needed a fresh backup and empty tables, and ran
in one transaction.

## Consequences

- Notion is no longer needed at run time; the website's Notion code,
  settings and SDK are removed. The import script stays until it has run on
  production, then goes in a later cleanup.
- Between deploying this and running the import on production, Home and
  Documentation have no content (Home answers with an error page): the
  release runs the import right after the deploy.
- Documentation tags stay free text (as in Notion), not links to the
  expertise taxonomy; linking them is a later decision.
