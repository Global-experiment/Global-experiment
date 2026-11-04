# Home and Documentation in the admin — November 2026

Home and Documentation are now written, versioned and published in the
admin. Nothing is deleted any more, not even a comment, a supporting
document or a profile picture. Cards OPS-26, OPS-28 and the OPS-147
follow-up.

## Nothing is deleted (OPS-147)

**Comments.** "Delete" is now **Archive**. An archived comment is hidden
from everyone else (they see "This comment was archived."), and you can
**Restore** it. Comments deleted before this release were kept, so they
can be restored too.

**Treasury supporting documents.** "Delete" is now **Archive**. An
archived document moves to **Archived documents** on the entry. You can
still download it there, and restore it. Uploading the same file again
also brings it back.

**Profile pictures.** Removing or replacing your picture keeps the old
one under **Previous pictures** in Profile settings. Click it to use it
again.

Every one of these is in the History. No file is ever removed from the
server.

## Home (OPS-26)

**Home → Administrate** opens Home's editor (Figma p7): the toolbar
(undo, redo, headings, text, bulleted and numbered lists, links, images),
the text, and on the right Last publish, Created, Discard changes and
Submit changes.
- **Submit changes** publishes at once for roles that can publish. For a
  role that can only edit, it saves a draft that someone who can publish
  then publishes.
- Every change is in Home's History, with the text that changed: new
  lines shown, old ones struck through.

## Documentation (OPS-26)

**Documentation → Administrate** lists every article (p9), drafts
included, with State, Expertise, Display order, Last edited by, Updated
and Last published. Archived articles are under **Archived**. **New
document** starts one.

An article's page (p10) has Title, Expertise (up to 10), Slug, Status,
Display order and its details, then the text in the same editor. The
**Status** you choose says what Submit changes does:
- **Published**: the changes go on the website at once.
- **Draft**: the changes are kept as a draft, and visitors keep seeing
  the published version until you publish.
- **Unpublished**: the article leaves the website. All its versions are
  kept.
- **Archived**: the article leaves the website and the list, and can be
  restored.

**More options** has Discard changes, Duplicate as a draft and Archive.
**Duplicate** makes a draft copy.

## Versions (OPS-28)

**Versions** (on Home and on every article) lists every saved version:
who saved it, when, what changed, and which one visitors see.
- Open any version to read it, or **compare it with the current one**:
  what was removed is struck through, and what is new is marked +.
- **Restore** a version, as a draft or published at once. Restoring makes
  a new version: nothing is overwritten.
- On the website, **Document history** now shows the real published
  versions of an article, with their dates.

## What stays the same for visitors

The same addresses, sections and anchors: shared links like
/documentation#introduction still open the right article. Search still
finds titles, tags and text. If you rename an article's slug, its old
address leads to the new one.

## Moving your pages from Notion

Your current Home and the 10 published articles are copied once into the
admin, with their text, order and tags, as **version 1 by "Notion
import"**. We tested this on a copy of the live data: 11 pages, nothing
missing, nothing else changed. After the copy, the website no longer reads
Notion, and edits made in Notion no longer appear on the site.
