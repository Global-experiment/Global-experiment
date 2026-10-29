# CSV import for People and Organizations — 30 October 2026

What you decided on 23 October: People and Organizations can be filled
from a spreadsheet, and everything else is edited in the admin only.

## Importing a CSV file

On **People** or **Organizations**, open **More options → Import CSV**.
Only accounts that can add people and organizations see it (Rootadmin,
Admin, Operation admin); the server refuses everyone else too.

1. **Upload** a CSV file: "CSV UTF-8" from Excel, Numbers or Google
   Sheets, or Notion's own export. Commas or semicolons both work. The
   first row names the columns. Up to 2 MB and 5,000 rows.
   If the file can't be read (wrong format, wrong encoding, no header row),
   a window explains why and what to do.
2. **Columns:** each column is matched to a field by its name ("E-mail",
   "Full name", "Personal note"… are recognised). You can change any match
   or skip a column. Name is required. Numbers like PER-12 or ORG-3 are
   never imported.
3. **Check:** before anything is written, you see
   - the rows that will be **added**;
   - the **possible duplicates**: rows with the same email, website, name
     or record ID as someone already in the admin (or an earlier row of the
     file), with a link to the existing record. They are **skipped**; tick
     one to add it anyway as a new record. An existing record is never
     changed;
   - the rows with **errors**, each with the reason (an invalid email, an
     unknown state, an organization that doesn't exist yet…). The same
     rules as on a person's or an organization's page apply.
4. **Import:** everything is added at once, or nothing if something goes
   wrong. A message says how many were added and how many were not
   (already existing), with a link to the **report**.

The **report** lists who imported which file and when, the records added
(each linked), the duplicates with the record they matched (linked), and
the rows left out with their errors. You find it from that message, in
**Monitoring → History**, and on the Imports page.

Every new person or organization's history says it came from the CSV
import and who imported it.

Tip: import Organizations first, then People, so people can be linked to
their organizations by name.

## Notion

- **People and Organizations** can still be imported from Notion: More
  options → Import Notion (Rootadmin and Admin).
- The **Treasury** and **Expertise, Fields and Domains** imports from
  Notion are gone. There is no import or export for the Treasury or any
  other table.
- "Managed in Notion" is gone everywhere outside People and Organizations.
  Expenses that came from Notion are now ordinary entries: you can review,
  publish and annotate them in the admin.
- Nothing already in the admin was changed or deleted.

## Good to know

- Expertise, Fields and Domains can't be changed for now: their Notion
  import is gone and the admin has no editor for them yet. Tell us when
  you need one.
- Home and Documentation still show what is in Notion until their editor
  arrives; their admin pages stay read-only, without the label.
