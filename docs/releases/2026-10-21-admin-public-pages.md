# Public pages in the admin — 21 October 2026

## What changed

- **Home, Documentation and Treasury** in the admin menu now open the page
  exactly as visitors see it, inside the admin. At the top right are
  **Administrate**, **Share** and **⋮**.
- **Share** copies the address of the public page. **⋮** opens the public
  page in a new tab, or the Administrate view.
- **Administrate** opens the page's management view:
  - **Home:** the Home content, read-only, marked **"Managed in Notion"**
    with a link to the Notion page. Home is still edited in Notion.
  - **Documentation:** the list of articles with the columns Title,
    Status, Display order, Expertise, Last edited by, Updated and
    Published, with search, sort and filters. It is read-only and marked
    "Managed in Notion" with a link to Notion.
  - **Treasury:** the admin Treasury list, as before.
- **Each documentation article** in the admin has its own
  **Administrate** button (next to Send feedback and Report issue). It
  opens that article in the Documentation list.
- **The browser tab** shows the page title (Home, Documentation,
  Treasury, Home content).

## Please test

1. In the admin, click Home, Documentation and Treasury in the menu: each
   shows the public page.
2. Press Share, then paste: you get the public address.
3. Press Administrate on each page.
4. In Documentation, open an article and press its Administrate button.
5. In Treasury, switch between Expenses and Donations: you stay in the
   admin.

## Known limitations

- Home and Documentation are still edited in Notion; the admin shows them
  read-only until the content moves into the admin.
- "Last edited by" shows "Notion" for now: Notion's editor names aren't
  imported yet.
- On the Treasury view, opening an entry goes to its public page.
- The Home buttons follow today's public page; the Figma frame still shows
  the older four-button grid.
