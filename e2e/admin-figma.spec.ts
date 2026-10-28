import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * The admin against admin-desktop.pdf (12 frames, 1440×1024 device; the
 * browser chrome takes the top 104px, so the page itself is 1440×920),
 * through the real stack (Next → NestJS → PostgreSQL 17 test database with
 * test-only fixtures).
 *
 * - Visual: every screen is captured at the frame size and at 1024px
 *   (test-results/figma/), and its geometry is checked against the frame's
 *   measurements (positions and sizes, ±1px). With FIGMA_PNG_DIR set (PNG
 *   renders of the PDF, pN.png), side-by-side comparisons are written too.
 * - Interactions: login, sidebar, user card, popovers, columns, toasts,
 *   record pills, the 10/5 limits, Duplicate and the display name.
 *
 * Runs in its own project after the other admin specs (playwright.config.ts):
 * it duplicates a record, which would change their fixture counts.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const STATE = "test-results/.auth/admin-figma.json";
const SHOTS = "test-results/figma";
const FRAME = { width: 1440, height: 920 };
const TABLET = { width: 1024, height: 768 };

mkdirSync(SHOTS, { recursive: true });

const box = async (locator: Locator) => {
  const value = await locator.boundingBox();
  if (!value) throw new Error("element not rendered");
  return value;
};
/** Figma measurements are whole pixels; allow 1px for subpixel layout. */
const near = (actual: number, expected: number, tolerance = 1) => expect(Math.abs(actual - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(tolerance);

async function capture(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}-${page.viewportSize()!.width}.png`) });
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollX: window.scrollX,
  }));
  expect(overflow).toEqual({ page: 0, scrollX: 0 });
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Admin" });
const rows = (page: Page) => page.locator("tbody tr");

async function openPerson(page: Page, query: string) {
  await page.goto(`/admin/people?q=${encodeURIComponent(query)}`);
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(query.replace(/(^|\s)\S/g, (c) => c.toUpperCase()));
}

test.describe("login (p1)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("card, password eye, forgot-password message, then sign in", async ({ page }) => {
    for (const viewport of [TABLET, FRAME]) {
      await page.setViewportSize(viewport);
      await page.goto("/admin/login");
      await expect(page.getByRole("heading", { name: "Sign in to the Global experiment" })).toBeVisible();
      await capture(page, "p01-login");
    }

    // Geometry (p1): 400px card; 40px fields 384 wide; two 40px buttons; 8px gaps.
    const card = await box(page.locator("form"));
    near(card.width, 400);
    near(card.x, (FRAME.width - 400) / 2);
    const email = await box(page.getByLabel("Email address").locator(".."));
    const password = await box(page.getByLabel("Password", { exact: true }).locator(".."));
    expect([email.width, email.height, password.height]).toEqual([384, 40, 40]);
    near(password.y - (email.y + email.height), 8);
    near(email.y - card.y, 52); // 40px title row + 12px
    const forgot = await box(page.getByRole("button", { name: "Forgot password?" }));
    const signIn = await box(page.getByRole("button", { name: "Sign in" }));
    expect([forgot.height, signIn.height]).toEqual([40, 40]);
    near(signIn.x - (forgot.x + forgot.width), 8);
    near(card.y + card.height - (signIn.y + signIn.height), 8);
    // The primary button is filled white with black text.
    expect(await page.getByRole("button", { name: "Sign in" }).evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual([
      "rgb(255, 255, 255)",
      "rgb(0, 0, 0)",
    ]);

    // The eye shows and hides the password.
    const field = page.getByLabel("Password", { exact: true });
    await field.fill(E2E_ADMIN.password);
    await expect(field).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Show password" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "password");

    // No reset flow yet: the button says whom to ask.
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ask a Rootadmin for a password reset link" })).toBeVisible();

    await page.getByLabel("Email address").fill(E2E_ADMIN.email);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin\/people/, { timeout: 15_000 });
    mkdirSync("test-results/.auth", { recursive: true });
    await page.context().storageState({ path: STATE });
  });
});

test.describe("signed in", () => {
  test.use({ storageState: STATE, viewport: FRAME });

  test("shell (p2): sidebar groups, sizes, active row, user card", async ({ page }) => {
    await page.goto("/admin/people");
    await expect(rows(page).first()).toBeVisible();

    const sections = await nav(page).locator(":scope > div > p").allTextContents();
    expect(sections).toEqual(["Communication", "Admin", "Monitoring", "Other"]);
    // Group titles in the Figma font (client, 2026-10-19): plain 12px muted text, no rules between groups.
    const groupTitle = nav(page).locator(":scope > div > p").first();
    await expect(groupTitle).toHaveCSS("text-transform", "none");
    await expect(groupTitle).toHaveCSS("font-size", "12px");
    expect(Number(await groupTitle.evaluate((el) => getComputedStyle(el).fontWeight))).toBeLessThan(700);
    await expect(nav(page).locator("hr")).toHaveCount(0);
    const labels = (await nav(page).locator("li").allInnerTexts()).map((text) => text.replace(/\s*\(coming soon\)$/, "").trim());
    expect(labels).toEqual([
      "Home",
      "Documentation",
      "Treasury",
      "Feedbacks and issues",
      "People",
      "Organizations",
      "Contracting",
      "Messages",
      "Cloud",
      "Services",
      "Permissions",
      "Accounts",
      "History",
      "Analytics",
      "Technical dashboard",
      "Emails",
      "Expertise",
      "Fields",
      "Domains",
      "Organizations",
      "Waitlist",
    ]);

    // Geometry (p2): search at 8,8, 32 tall, with "Collapse menu" beside it (client, 2026-10-19; Figma's field is 224
    // wide alone); rows 224×32 at x=8, 4px apart; 64px user card 8px above the bottom.
    const search = await box(page.getByRole("searchbox", { name: "Search the menu" }).locator(".."));
    expect([search.x, search.y, search.width, search.height]).toEqual([8, 8, 184, 32]);
    const collapse = await box(page.getByRole("button", { name: "Collapse menu" }));
    expect([collapse.x, collapse.y, collapse.width, collapse.height]).toEqual([200, 8, 32, 32]);
    const home = await box(nav(page).locator("li").filter({ hasText: "Home" }).locator("> *"));
    expect([home.x, home.y, home.width, home.height]).toEqual([8, 80, 224, 32]);
    const documentation = await box(nav(page).locator("li").filter({ hasText: "Documentation" }).locator("> *"));
    expect(documentation.y).toBe(116);
    const people = nav(page).getByRole("link", { name: "People" });
    await expect(people).toHaveAttribute("aria-current", "page");
    expect(await people.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(["rgb(31, 31, 31)", "rgb(255, 255, 255)"]);
    const card = await box(page.locator("a[href=\"/admin/profile\"]").locator(".."));
    expect([card.x, card.width, card.height, card.y + card.height]).toEqual([8, 224, 64, FRAME.height - 8]);
    await expect(page.locator("[data-user-name]")).toHaveText("e2e-owner"); // no display name: the email's local part

    // The list page title and toolbar (p2).
    const title = await box(page.getByRole("heading", { name: "People", level: 1 }));
    expect(title.x).toBe(248);
    await capture(page, "p04-people");
    await page.setViewportSize(TABLET);
    await noHorizontalScroll(page);
    await capture(page, "p04-people");
  });

  test("the sidebar collapses to an icon rail, remembers it, and expands again (client, 2026-10-14)", async ({ page }) => {
    await page.goto("/admin/people");
    await expect(rows(page).first()).toBeVisible();
    const sidebar = page.locator("#admin-sidebar");
    expect((await box(sidebar)).width).toBe(240);

    await page.getByRole("button", { name: "Collapse menu" }).click();
    await expect(page.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await box(sidebar)).width).toBe(56);
    // Names stay available: as tooltips and for screen readers; group titles too.
    const people = nav(page).getByRole("link", { name: "People" });
    await expect(people).toHaveAttribute("title", "People");
    await expect(people).toHaveAttribute("aria-current", "page");
    await expect(nav(page).locator(":scope > div > p").first()).toHaveClass(/sr-only/);
    // The content column takes the freed width; nothing scrolls sideways.
    expect((await box(page.getByRole("heading", { name: "People", level: 1 }))).x).toBe(64);
    await noHorizontalScroll(page);
    await capture(page, "sidebar-collapsed");

    // Remembered across pages and reloads, from the first paint (server-rendered).
    await page.reload();
    expect((await box(sidebar)).width).toBe(56);
    await page.getByRole("link", { name: "Organizations" }).first().click();
    await expect(page).toHaveURL(/\/admin\/organizations$/);
    expect((await box(sidebar)).width).toBe(56);

    // The search glyph re-opens the menu with the search field focused.
    await page.getByRole("button", { name: "Search the menu" }).click();
    await expect.poll(async () => (await box(sidebar)).width).toBe(240);
    await expect(page.getByRole("searchbox", { name: "Search the menu" })).toBeFocused();
    await page.reload();
    expect((await box(sidebar)).width).toBe(240);
  });

  test("data table: column labels without a band (client, 2026-10-19), a rule under every row, row hover", async ({ page }) => {
    await page.goto("/admin/people");
    await expect(rows(page).first()).toBeVisible();
    const header = page.locator("thead th").first();
    await expect(header).toHaveCSS("background-color", "rgb(0, 0, 0)");
    // admin-desktop.pdf p2–p5 ("Scrolling page", client 2026-10-23): a 34px band and its rule, the glyph 12px
    // from the top and 4px from the column's edge, the regular muted label 4px after it; cells 4px in too.
    expect((await box(header)).height).toBe(35);
    await expect(header).toHaveCSS("padding-left", "4px");
    await expect(header).toHaveCSS("font-weight", "400");
    const glyph = await box(header.locator("svg").first());
    const cell = await box(header);
    expect([glyph.x - cell.x, glyph.y - cell.y]).toEqual([4, 12]);
    const label = await box(header.locator("button span").first());
    expect(label.x - (glyph.x + glyph.width)).toBe(4);
    await expect(rows(page).first().locator("td").first()).toHaveCSS("padding-left", "4px");
    const lastRowCell = rows(page).last().locator("td").first();
    await expect(lastRowCell).toHaveCSS("border-bottom-width", "1px");
    await rows(page).nth(1).hover();
    await expect(rows(page).nth(1).locator("td").first()).toHaveCSS("background-color", "rgb(18, 18, 18)");
    await expect(rows(page).nth(2).locator("td").first()).toHaveCSS("background-color", "rgb(0, 0, 0)");
  });

  test("sidebar search filters the menu; modules that don't exist are disabled, never pages", async ({ page }) => {
    await page.goto("/admin/people");
    const search = page.getByRole("searchbox", { name: "Search the menu" });
    await search.fill("perm");
    await expect(nav(page).locator("li")).toHaveText([/Permissions/]);
    await expect(nav(page).locator(":scope > div > p")).toHaveText(["Monitoring"]);
    // Organizations is listed in Admin and in Other (decision 16).
    await search.fill("organ");
    await expect(nav(page).locator(":scope > div > p")).toHaveText(["Admin", "Other"]);
    await search.fill("zzz");
    await expect(nav(page).getByRole("status")).toHaveText("No menu items match.");
    await search.press("Escape");
    await expect(nav(page).locator("li")).toHaveCount(21);

    const messages = nav(page).locator("[data-coming-soon]").filter({ hasText: "Messages" });
    await expect(messages).toHaveAttribute("title", "Coming soon");
    await expect(messages).toHaveAttribute("aria-disabled", "true");
    // Dimmed as in the Figma (#484848), darker than the live rows.
    await expect(messages).toHaveCSS("color", "rgb(72, 72, 72)");
    await expect(nav(page).getByRole("link", { name: /Messages/ })).toHaveCount(0);
    await messages.click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    // Only the existing modules link anywhere.
    const links = await nav(page).getByRole("link").evaluateAll((elements) => elements.map((el) => el.getAttribute("href")));
    expect(links).toEqual([
      "/admin/home",
      "/admin/documentation",
      "/admin/treasury",
      "/admin/people",
      "/admin/organizations",
      "/admin/services",
      "/admin/permissions",
      "/admin/accounts",
      "/admin/history",
      "/admin/expertise",
      "/admin/fields",
      "/admin/domains",
      "/admin/organizations",
    ]);
    // Decision 16: these stay "Coming soon" until built.
    for (const label of ["Waitlist", "Messages", "Cloud", "Analytics", "Technical dashboard", "Emails", "Contracting"]) {
      await expect(nav(page).locator("[data-coming-soon]").filter({ hasText: label }), label).toHaveCount(1);
    }
    // One page listed twice is highlighted once.
    await nav(page).getByRole("link", { name: "Organizations" }).last().click();
    await expect(page).toHaveURL(/\/admin\/organizations$/);
    await expect(nav(page).locator("[aria-current=page]")).toHaveCount(1);
    await expect(page.locator("li[data-module=organizations] a")).toHaveAttribute("aria-current", "page");
  });

  test("the menu keeps its search and collapse button at the top while it scrolls; the light appearance (Profile settings, p18)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto("/admin/people");
    await expect(rows(page).first()).toBeVisible();
    await nav(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect.poll(() => nav(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect((await box(page.getByRole("searchbox", { name: "Search the menu" }).locator(".."))).y).toBe(8);
    await expect(page.getByRole("button", { name: "Collapse menu" })).toBeInViewport();

    // What Appearance → Light applies (shared/ui/appearance.ts); the Profile flow itself is in admin-accounts.spec.ts.
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await expect(page.locator("[data-admin]")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect.poll(() => page.locator("[data-admin]").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(0, 0, 0)");
    await capture(page, "light-people");
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  });

  test("filter popover (p2): add, duplicate, reorder, remove; 'Filters applied' toast", async ({ page }) => {
    await page.goto("/admin/people");
    await page.getByRole("button", { name: "Filter" }).click();
    const popover = page.getByRole("dialog", { name: "Filters" });
    const items = popover.locator("li");
    await expect(items).toHaveCount(1); // a starter row
    await items.nth(0).getByLabel("Field").selectOption("state");
    await items.nth(0).getByLabel("Value").selectOption("sourced");
    await popover.getByRole("button", { name: "New filter" }).click();
    await items.nth(1).getByLabel("Field").selectOption("name");
    await items.nth(1).getByLabel("Value").fill("a");
    await expect(items).toHaveCount(2);
    await capture(page, "p02-filters");

    await popover.getByRole("button", { name: "Duplicate filter 1" }).click();
    await expect(items).toHaveCount(3);
    await expect(items.nth(1).getByLabel("Field")).toHaveValue("state");

    // Reorder by dragging the last row's handle onto the first row.
    await items.nth(2).locator("[draggable=true]").dragTo(items.nth(0));
    await expect(items.nth(0).getByLabel("Field")).toHaveValue("name");

    await popover.getByRole("button", { name: "Remove filter 1" }).click();
    await expect(items).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status").filter({ hasText: "Filters applied" })).toBeVisible();
    await expect(page.getByRole("button", { name: "2 filters" })).toBeVisible();

    await page.getByRole("button", { name: "2 filters" }).click();
    await popover.getByRole("button", { name: "Remove all filters" }).click();
    await expect(items).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Filter" })).toBeVisible();
  });

  test("sort popover (p3): several sorts, capped at 3", async ({ page }) => {
    await page.goto("/admin/people");
    await page.getByRole("button", { name: "Last created first" }).click();
    const popover = page.getByRole("dialog", { name: "Sort" });
    await popover.getByRole("button", { name: "New sort" }).click();
    await popover.getByRole("button", { name: "New sort" }).click();
    await expect(popover.locator("li")).toHaveCount(3);
    await expect(popover.getByRole("button", { name: "New sort" })).toBeDisabled();
    await expect(page).toHaveURL(/sort=created%3Adesc&sort=[a-z_]+%3A(asc|desc)&sort=[a-z_]+%3A(asc|desc)$/);
    await capture(page, "p03-sort");
    // Several sorts read as their count (p2 "2 sorts"); closing confirms with "People updated" (p4).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "3 sorts" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
    await page.getByRole("button", { name: "3 sorts" }).click();
    await popover.getByRole("button", { name: "Remove all sorts" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Last created first" })).toBeVisible();
  });

  test("browser tab titles follow the page header, record names included (client, 2026-10-19)", async ({ page }) => {
    await page.goto("/admin/people");
    await expect(page).toHaveTitle("People");
    await rows(page).first().locator("a").first().click();
    const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    expect(name).not.toBe("");
    await expect(page).toHaveTitle(`${name}`);
    await page.goto("/admin/organizations");
    await expect(page).toHaveTitle("Organizations");
    await page.goto("/admin/treasury");
    await expect(page).toHaveTitle("Treasury");
  });

  test("column menu (p11): freeze and hide a column; Import Notion button", async ({ page }) => {
    await page.goto("/admin/people");
    await expect(page.getByRole("link", { name: "Import Notion" })).toHaveAttribute("href", "/admin/imports");
    const state = page.getByRole("columnheader", { name: "State", exact: true });
    await state.getByRole("button").first().click();
    const menu = page.getByRole("dialog", { name: /State/ });
    await expect(menu.getByRole("button", { name: "Freeze column" })).toBeVisible();
    await capture(page, "p11-column-menu");
    await menu.getByRole("button", { name: "Freeze column" }).click();
    expect(await state.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");

    // The menu may stay open after Freeze; reopen it only if it closed.
    if (!(await page.getByRole("dialog", { name: /State/ }).isVisible())) await state.getByRole("button").first().click();
    await page.getByRole("dialog", { name: /State/ }).getByRole("button", { name: "Hide column" }).click();
    await expect(page.getByRole("columnheader", { name: "State", exact: true })).toHaveCount(0);
    // Back as it was, for the screenshots after this one.
    await page.evaluate(() => localStorage.clear());
  });

  test("person record (p12 layout, p14 prototype fields): pills, checkbox, follow-up, Submit goes back", async ({ page }) => {
    await openPerson(page, "lena sample");
    const main = page.locator("[data-record-main]");

    // Geometry (p12): back arrow + bold title; label cell 168px; values from x=416; right panel 400px.
    const heading = await box(page.getByRole("heading", { level: 1 }));
    expect(heading.x).toBe(272);
    const name = await box(page.getByLabel("Name", { exact: true }));
    expect(name.x).toBe(416);
    const panel = await box(page.locator("[data-record-panel]"));
    near(panel.x, FRAME.width - 400);
    near(panel.width, 400);
    const submit = await box(page.getByRole("button", { name: "Submit changes" }));
    near(submit.width, 384);
    near(submit.height, 32);
    // The prototype moves the number to the fields' end ("Person ID"); the panel holds actions, counters and history.
    await expect(main).toContainText(/Person ID\s*PER-\d+/);
    await expect(page.locator("[data-record-panel]").getByRole("heading", { name: /^History/ })).toBeVisible();
    await expect(main.locator("[data-hint]")).toHaveText([
      "People can have up to 10 expertise.",
      // Info card on Contact channels (client, 2026-10-22).
      "The first value is the preferred way of contact.",
      "People can have up to 5 organizations.",
    ]);
    await capture(page, "p12-person");

    // Pills: State and Source single-select, Do not contact as Contact / Do not contact.
    const state = page.getByRole("group", { name: "State" });
    await expect(state.getByRole("button")).toHaveText(["Sourced", "Contacted", "In discussion", "Collaborating", "On hold", "Rejected"]);
    await expect(page.getByRole("group", { name: "Source" }).getByRole("button")).toHaveText(["Candide", "AI", "Contribution email", "Other"]);
    await state.getByRole("button", { name: "In discussion" }).click();
    await expect(state.getByRole("button", { name: "In discussion" })).toHaveAttribute("aria-pressed", "true");
    // Fully rounded 32px pills (radius at least half the height).
    expect(
      await state.getByRole("button", { name: "In discussion" }).evaluate((el) => parseFloat(getComputedStyle(el).borderRadius) >= el.getBoundingClientRect().height / 2),
    ).toBe(true);
    await page.getByRole("group", { name: "Source" }).getByRole("button", { name: "Other" }).click();
    // Prototype: Do not contact is a checkbox.
    const doNotContact = page.getByRole("checkbox", { name: "Do not contact" });
    // A toggle: tick it only if the fixture doesn't already.
    if (!(await doNotContact.isChecked())) await page.locator("label[for=person-dnc]").click();
    await expect(doNotContact).toBeChecked();

    // Follow-up date and time: "Set a date" or "October 14 at 9:30 AM" — never the browser's mm/dd/yyyy mask.
    const followUp = page.locator("#person-followup");
    await expect(followUp).toHaveText("Set a date");
    // The design-system date picker (client, 2026-10-22): a calendar under the field.
    await followUp.click();
    const picker = page.locator("[data-date-picker]");
    await expect(picker).toBeVisible();
    for (let step = 0; step < 36 && !(await picker.getByRole("heading").innerText()).includes("October 2026"); step++) {
      const shown = await picker.getByRole("heading").innerText();
      const [month, year] = shown.replace(/^.*: /, "").split(" ");
      const later = Number(year) > 2026 || (Number(year) === 2026 && new Date(`${month} 1, 2000`).getMonth() > 9);
      await picker.getByRole("button", { name: later ? "Previous month" : "Next month" }).click();
    }
    await picker.getByRole("button", { name: "Wednesday, October 14, 2026", exact: false }).click();
    await picker.getByLabel("Time").fill("09:30");
    await picker.getByRole("button", { name: "Done" }).click();
    await expect(picker).toHaveCount(0);
    await expect(followUp).toBeFocused();
    await expect(followUp).toHaveText("October 14 at 9:30 AM");
    expect(await followUp.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    // Description: no resize handle; it grows with its text.
    const note = page.getByLabel("Description");
    expect(await note.evaluate((el) => getComputedStyle(el).resize)).toBe("none");
    const oneLine = (await box(note)).height;
    await note.fill("First line.\nSecond line.\nThird line.");
    expect((await box(note)).height).toBeGreaterThan(oneLine + 20);
    await page.getByRole("button", { name: "Submit changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
    // No autosave: one Submit saves, then the list it came from is back.
    await expect(page).toHaveURL(/\/admin\/people\?q=lena/);
    await rows(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);

    await expect(state.getByRole("button", { name: "In discussion" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "Source" }).getByRole("button", { name: "Other" })).toHaveAttribute("aria-pressed", "true");
    await expect(doNotContact).toBeChecked();
    await expect(followUp).toHaveText("October 14 at 9:30 AM");
    await expect(note).toHaveValue("First line.\nSecond line.\nThird line.");
    await page.getByRole("button", { name: "Clear Follow-up date" }).click();
    await expect(followUp).toHaveText("Set a date");
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(followUp).toHaveText("October 14 at 9:30 AM");

    // Discard changes puts the saved values back.
    await state.getByRole("button", { name: "Rejected" }).click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(state.getByRole("button", { name: "In discussion" })).toHaveAttribute("aria-pressed", "true");

    await page.setViewportSize(TABLET);
    await noHorizontalScroll(page);
    near((await box(page.locator("[data-record-panel]"))).width, 280);
    await capture(page, "p12-person");
  });

  test("limits: at most 10 expertise and 5 organizations per person, in the pickers and the API", async ({ page }) => {
    await openPerson(page, "kai example");

    const linked = (noun: string) => page.getByRole("list", { name: `Linked ${noun}` }).getByRole("listitem");
    const clear = async (noun: string) => {
      while ((await linked(noun).count()) > 0) await linked(noun).first().getByRole("button", { name: /^Remove / }).click();
    };
    const pickUntilFull = async (label: string, noun: string, max: number) => {
      await page.getByLabel(`Search ${noun}`).click();
      const results = page.getByRole("list", { name: `${label} results` });
      for (let picked = 0; picked < max; picked++) {
        const option = results.locator("button[data-option]:not([disabled])").first();
        await expect(option).toBeVisible();
        await option.click();
      }
      await expect(linked(noun)).toHaveCount(max);
      await expect(results.locator("[data-limit-reached]")).toContainText("Remove one to add another.");
      await page.keyboard.press("Escape");
    };

    await clear("expertise");
    await pickUntilFull("Expertise", "expertise", 10);
    await expect(page.getByRole("list", { name: "Expertise results" }).locator("[data-limit-reached]")).toHaveCount(0); // closed
    await clear("organization");
    await pickUntilFull("Organizations", "organization", 5);
    await page.getByRole("button", { name: "Submit changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/people\?q=kai/);
    await rows(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
    await expect(linked("expertise")).toHaveCount(10);
    await expect(linked("organization")).toHaveCount(5);

    // The API refuses an 11th / a 6th even when the UI is bypassed.
    const id = page.url().split("/").pop()!;
    const options = await page.request.get(`/api/admin/expertise/search?q=&pageSize=50`);
    const items = ((await options.json()) as { items: { id: string; selectable: boolean }[] }).items.filter((item) => item.selectable).slice(0, 11);
    const tooMany = await page.request.patch(`/api/admin/people/${id}`, {
      data: { expertiseIds: items.map((item) => item.id) },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(tooMany.status()).toBe(400);
    expect(JSON.stringify(await tooMany.json())).toContain("People can have up to 10 expertise.");

    // From an organization's record, Kai can't be added: the person's limit.
    await page.goto("/admin/organizations?q=quarry");
    await rows(page).first().getByRole("link").click();
    const linkedToQuarry = await page.getByRole("list", { name: "Linked people" }).getByText("Kai Example").count();
    if (linkedToQuarry === 0) {
      await page.getByLabel("Search people").fill("Kai Example");
      const kai = page.getByRole("list", { name: "People results" }).getByRole("button", { name: /Kai Example/ });
      await expect(kai).toBeDisabled();
      await expect(kai).toHaveAttribute("title", "Already in 5 organizations (the maximum)");
    }
    await capture(page, "org-record");
  });

  test("duplicate: a copy without Notion page or number, opened", async ({ page }) => {
    await openPerson(page, "pia example");
    const originalUrl = page.url();
    const originalNumber = await page.locator("[data-record-main]").getByText(/^PER-\d+$/).innerText();
    await page.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Person duplicated" })).toBeVisible();
    await expect(page).not.toHaveURL(originalUrl);
    await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
    // The copy is named "<name> DUPLICATE" (client, 2026-10-22).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pia Example DUPLICATE");
    const copyNumber = await page.locator("[data-record-main]").getByText(/^PER-\d+$/).innerText();
    expect(copyNumber).not.toBe(originalNumber);
  });

  test("toast 'Notion imported' when an apply finishes on the Imports page", async ({ page }) => {
    // The apply itself is mocked here: a real one would change the shared test taxonomy.
    const job = (status: string) => ({
      id: "11111111-2222-4333-8444-555555555555",
      kind: "taxonomy",
      mode: "apply",
      status,
      phase: status === "running" ? "applying" : "done",
      startedAt: new Date().toISOString(),
      finishedAt: status === "running" ? null : new Date().toISOString(),
      triggeredBy: E2E_ADMIN.email,
      runId: null,
      dryRunId: null,
      changes: 3,
      applicable: false,
      report: "TAXONOMY IMPORT — APPLIED (one transaction)",
    });
    await page.route("**/api/admin/imports/status", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), activeJob: job("running") } });
    });
    await page.route("**/api/admin/imports/jobs/*", (route) => route.fulfill({ json: job("succeeded") }));
    await page.goto("/admin/imports");
    const toast = page.getByRole("status").filter({ hasText: "Notion imported" });
    await expect(toast).toBeVisible({ timeout: 5_000 });
    // Bottom centre of the content area (p8: 24px above the bottom edge).
    const pill = await box(toast.locator("p"));
    near(pill.x + pill.width / 2, 240 + (FRAME.width - 240) / 2);
    near(FRAME.height - (pill.y + pill.height), 24);
  });

  test("display name: set in Profile settings, shown on the user card, cleared back to the email", async ({ page }) => {
    await page.goto("/admin/profile");
    await page.getByLabel("Display name").fill("Candide Test");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
    await expect(page.locator("[data-user-name]")).toHaveText("Candide Test");
    await page.getByLabel("Display name").fill("x".repeat(81));
    await expect(page.getByLabel("Display name")).toHaveValue("x".repeat(80)); // maxLength
    await page.getByLabel("Display name").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("[data-user-name]")).toHaveText("e2e-owner");
  });

  test("other list screens fit 1024px without horizontal page scroll", async ({ page }) => {
    for (const [path, name] of [
      ["/admin/organizations", "organizations"],
      ["/admin/expertise", "expertise"],
      ["/admin/imports", "imports"],
      ["/admin/profile", "profile"],
    ] as const) {
      for (const viewport of [FRAME, TABLET]) {
        await page.setViewportSize(viewport);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await noHorizontalScroll(page);
        await capture(page, name);
      }
    }
  });

  test("the user card signs out", async ({ page }) => {
    await page.goto("/admin/people");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect((await page.request.get("/api/admin/people")).status()).toBe(401);
  });
});

/** Side by side: the app (left) and the Figma frame without the browser chrome (right). */
test("side-by-side comparisons", async ({ page }) => {
  const figmaDir = process.env.FIGMA_PNG_DIR;
  test.skip(!figmaDir, "Set FIGMA_PNG_DIR to the PNG renders of admin-desktop.pdf (pN.png) to write the comparisons.");
  await page.setViewportSize({ width: 2 * FRAME.width + 24, height: FRAME.height + 40 });
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  for (const [shot, frame, label] of [
    // Frames of admin-desktop.pdf as updated on 19 Oct (the captures keep their earlier names).
    ["p01-login-1440", "p1", "Login"],
    ["p04-people-1440", "p2", "People"],
    ["p02-filters-1440", "p3", "People — filters"],
    ["p03-sort-1440", "p4", "People — sort"],
    ["p11-column-menu-1440", "p13", "People — column menu"],
    ["p12-person-1440", "p14", "Person record"],
  ] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await page.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App — ${label}</figcaption><img src="${data(app)}" width="1440" height="920"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma ${frame.toUpperCase()}</figcaption>
          <div style="width:1440px;height:920px;overflow:hidden"><img src="${data(figma)}" width="1440" height="1024" style="margin-top:-104px"></div></figure>
      </div></body>`);
    await page.screenshot({ path: join(SHOTS, `compare-${frame}.png`) });
  }
});
