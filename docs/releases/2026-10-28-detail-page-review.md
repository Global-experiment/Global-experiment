# Detail page review — 28 October 2026

Your detail-page review of 22 October and the feedback of 23 October.

## What changed

**Detail pages (people, organizations, Treasury entries)**

- **Full width:** every field, including dates and scores, now fills its
  column. The search lists of linked records (Organizations, Expertise,
  Contact channels, Expenses) open at the full width of the field.
- **Spacing:** linked records sit 8px apart, across and between rows, and
  8px below the search line.
- **"Personal note" is now "Description".** It's shared information, so its
  changes show in the history like any other field (old text struck
  through, then the new one). Changes made before today keep showing
  "Private note updated". The Notion import reads the column under either
  name.
- **Errors appear when you leave a field,** not only when you submit, in the
  design system's error state: a white outline, the warning icon and the
  message under the field. This covers the name, email, website, X,
  LinkedIn, other socials, the scores and the contact dates.
- **Links are checked like emails:** a website or social link must look
  like a web address ("example.org", "x.com/profile" or
  "https://…"). We check the address itself; we don't open the page to see
  whether it exists.
- **Expenses on a person:** the search works again. It lists expenses that
  have no recipient yet. Expenses still managed in Notion appear greyed
  out ("Managed in Notion"): their recipient is set in Notion until the
  Treasury moves fully into the admin.
- **Contact channels:** an info card says "The first value is the
  preferred way of contact."
- **Reordering:** contact channels, organizations and expertise can be put
  in any order: drag a tag with the mouse, or click it and use Alt + ← / →
  on the keyboard. The order is saved with "Submit changes", and the
  history shows "reordered contact channels".
- **Date picker:** dates (first and last contact, follow-up, and the
  History filters) open a calendar under the field. Figma has no desktop
  calendar, so this one is **our own design**, built from the design
  system's date field and colours: weeks start on Monday, today is
  outlined, the chosen day is white, and the follow-up date has a time.
  It works with the keyboard (arrows, Page Up / Page Down, Enter, Esc).
  Please tell us if you'd like it drawn differently.
- **Comments:** even 8px spacing around the comment box and its button.
  Editing a comment adds a new "edited a comment" event that keeps the old
  text; the original comment stays as it was written.
- **Duplicates** are named "<name> DUPLICATE", whether made with
  Duplicate or with "Duplicate as a draft".

**Lists, tabs and History**

- **Table headers** use the Figma paddings ("Scrolling page"): the icon 4px
  from the column's edge, the label in regular weight. The text in the
  cells starts 4px from the edge too, so values line up under their
  header.
- **Browser tabs** show only the page title: "People", "Treasury", a
  person's name.
- **Monitoring → History:**
  - the events use the full width of the page;
  - each event reads "<who> <did what> <record title>", for example
    "Candide updated 3 fields on Stanley Qiang", with the title linked to
    the record (a deleted record keeps its title, without a link);
  - each event has a ⋮ menu with "Report issue" and "Send feedback".

## What to test

1. Open a person. Type an invalid email or a website like "not a link",
   then click elsewhere: the error appears straight away.
2. Rename the description, submit, and look at the history: the old and
   new text are shown.
3. Add three contact channels, drag the last one to the front (or click it
   and press Alt + ←), submit, and open the person again: the order is
   kept.
4. Link an expense from a person (Expenses → Search).
5. Open a date field and pick a day, with the mouse and with the keyboard.
6. Duplicate a person: the copy opens as "<name> DUPLICATE".
7. In Monitoring → History, check the wording and open an event's ⋮ menu.
8. Look at the browser tab titles and the table headers.

## Known limitations

- The date picker is our own design (see above).
- Expenses managed in Notion can't be linked from a person until the
  Treasury import is removed (next delivery).
- "Report issue" and "Send feedback" open the website's forms, which don't
  send anything yet: the Feedbacks and issues module comes later.
