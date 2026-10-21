# Detail pages and History — 21 October 2026

## What changed

- **Person, organization and Treasury entry pages** follow the person
  record prototype:
  - The right panel has **Duplicate**, **Submit changes** and **More
    options** (Discard changes, Duplicate as a draft, Archive or Restore,
    Delete permanently), then **Views** and **Edits**.
  - These stay in place. Only the **History** list under them scrolls.
- **Nothing is saved until you press Submit changes.**
  - After submitting, you go back to the page you came from, with a
    confirmation message.
  - Discard changes puts the saved values back.
  - If you try to leave with unsaved changes, the admin asks you first.
- **History on every record**, newest first, with its count ("History 12").
  It shows:
  - created, imported (by "Automation", with the import source),
    duplicated ("Duplicated from PER-12"), archived and restored;
  - "viewed this page", at most once per person per day;
  - comments: anyone can comment; you can edit or delete your own
    comments, and earlier versions stay in the history;
  - changes: one entry per Submit, for example "updated 3 fields". The old
    value is struck through, then the new one. Linked records appear as
    chips and choices as pills;
  - added and cleared fields, and linked, unlinked or replaced records.
- **Privacy in the history:**
  - Email, phone and other contact details are masked
    (s•••@example.org).
  - The personal note's text is never shown, only "Private note updated".
  - The server applies these rules, so they can't be bypassed from the
    page.
- **Person fields in the prototype's order**, with the new fields:
  - Do not contact (a checkbox);
  - AI relevance score and Relevance score (0 to 10);
  - Other socials and Contact channels (Email, Phone, WhatsApp, Signal,
    Telegram, LinkedIn, X, Matrix, Workana);
  - Organizations (up to 5) and Expenses (linked Treasury expenses);
  - First contact, Last contact, and Follow-up date with a time;
  - at the end: Person ID, Updated, Last edited by, Created and Created
    by.
- **Archive instead of delete:**
  - Archived records leave the normal lists and appear in the new
    **Archived** view of People, Organizations and Treasury, where you can
    restore them.
  - Archived Treasury entries also leave the public Treasury.
  - Only the owner can **delete permanently**, after typing the record's
    name (or EXP number). The deletion stays in the history.
- **Monitoring → History** is now open. It lists every change in the admin
  (people, organizations, Treasury, Expertise, Fields, Domains, settings and
  imports). You can filter it by record type, person, source (admin, Notion
  import, Stripe) and dates.
- **Dates and numbers** follow the rules in Notion ("Date and time",
  "Numbers") and use your own time zone:
  - "Oct 14 9:24 PM" in the history;
  - "October 14 at 9:24 PM" on the record;
  - the full date with the year when you hover over it.

## Please test

1. Open a person, change a few fields and press **Submit changes**. You go
   back to the list. Open the person again: History shows one entry
   ("updated N fields"), with the old values struck through.
2. Change a field, then click a menu item. The admin asks before leaving.
   Choose to stay, then use More options → Discard changes.
3. Leave a comment, edit it, then delete it.
4. Archive a test person (More options → Archive). Find them in the
   **Archived** view, open them and Restore.
5. Open an organization and a Treasury entry: same panel and History. On
   an expense, change the review status, then Submit.
6. Open **Monitoring → History** and try the filters.

## Known limitations

- **History starts with this release.** Earlier changes weren't
  recorded, so older records show "Not recorded" under Created by or Last
  edited by until they are next changed or imported.
- **Expertise, Fields and Domains:** their changes appear in Monitoring →
  History. They are still edited in their tables and have no detail page
  with a panel yet.
- **Not shown yet:**
  - Permissions and Contracting on the person page, and the access
    events (granted, changed, revoked): they appear when those modules
    exist.
  - The Phone and Wise recipient ID fields: their data is kept.
- **Privacy:** contact details are masked in the history for every account
  today, as in the prototype. Showing them to some roles is a setting that
  will be used once roles exist.
- **Publishing:** Treasury entries are published and unpublished with
  their own button, which takes effect right away. Treasury entries can't
  be duplicated.
- **Notion entries:** Notion-managed Treasury entries stay read-only.
  Stripe and Notion entries can be archived but not deleted.
- **Calendar icon:** the date fields use a temporary icon until the Figma
  file includes its own.
