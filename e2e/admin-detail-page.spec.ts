import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * The detail page of the person-record prototype (Figma p10/p14 and the
 * four prototype screenshots, 2026-10-21) through the real stack: the
 * right panel (Duplicate, Submit changes, More options, Views and Edits
 * fixed; only the History scrolls), every history event the admin can
 * cause, masking and the private note, comments, no autosave with the
 * leave confirmation, archive/restore/permanent delete, the same panel on
 * organizations and Treasury entries, Monitoring → History, and the
 * formatting rules (docs/architecture/formatting.md).
 *
 * Runs in its own project, last (playwright.config.ts): it archives and
 * deletes records, which would change the other suites' counts. Every
 * record it changes is one it creates.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const SHOTS = "test-results/figma";
mkdirSync(SHOTS, { recursive: true });
const FRAME = { width: 1440, height: 920 };
/** Sessions the other admin suites saved (same owner, same API), freshest first: logins are rate-limited. */
const SAVED_SESSIONS = ["admin-treasury", "admin-figma", "admin-table", "admin-directory-v2", "admin"].map((name) => `test-results/.auth/${name}.json`);
const LEAVE_MESSAGE = "You have changes that aren't submitted. Leave this page and lose them?";
/** The owner as the history names them (no display name: the email's local part). */
const ACTOR = E2E_ADMIN.email.split("@")[0]!;

let page: Page;
const rows = () => page.locator("tbody tr");
const panel = () => page.locator("[data-record-panel]");
const items = () => page.locator("[data-history-scroll] [data-history-item]");
const origin = () => new URL(page.url()).origin;

async function createPerson(data: Record<string, unknown>): Promise<{ id: string; personNumber: number }> {
  const response = await page.request.post("/api/admin/people", { data, headers: { origin: origin() } });
  expect(response.status()).toBe(201);
  return response.json();
}

/** Submit changes, then wait for the toast and the way back to the list. */
async function submit() {
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/people(\?|$)/);
}

async function openPerson(name: string) {
  await page.goto(`/admin/people?q=${encodeURIComponent(name)}`);
  await expect(rows()).toHaveCount(1);
  await rows().first().getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
  // The opening is counted, then the feed refreshes.
  await expect(panel().locator("[data-counter=views]")).not.toContainText("–");
}

test.beforeAll(async ({ browser }, testInfo) => {
  // The first visits compile their routes in `next dev`.
  test.setTimeout(180_000);
  for (const state of [...SAVED_SESSIONS.filter((path) => existsSync(path)), undefined]) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: FRAME, storageState: state });
    page = await context.newPage();
    await page.goto("/admin/people");
    const signIn = page.getByRole("heading", { name: /^Sign in/ });
    await expect(signIn.or(rows().first())).toBeVisible({ timeout: 30_000 });
    if (!(await signIn.isVisible())) return;
    if (state) {
      await context.close();
      continue;
    }
    await page.getByLabel("Email address").fill(E2E_ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(rows().first()).toBeVisible({ timeout: 30_000 });
    return;
  }
});

test.afterAll(async () => {
  await page.context().close();
});

test("the panel (p14): Duplicate, Submit changes, More options, Views and Edits, then the history; created and viewed", async () => {
  const person = await createPerson({ name: "Dana Detail", email: "dana@example.org", website: "https://dana.example", description: "Met at the assembly" });
  await openPerson("Dana Detail");
  await expect(page).toHaveTitle("Dana Detail");

  const top = panel().locator("[data-record-panel-top]");
  await expect(top.getByRole("button")).toHaveText(["Duplicate", "Submit changes", "More options"]);
  await expect(page.getByRole("button", { name: "Submit changes" })).toBeDisabled();
  await expect(panel().locator("[data-counter=views]")).toContainText("1");
  await expect(panel().locator("[data-counter=edits]")).toContainText("0");
  await expect(panel().getByRole("heading", { name: /^History/ })).toHaveText(/^History\s*2$/);
  // Newest first: this opening, then the creation.
  await expect(items()).toHaveCount(2);
  await expect(items().nth(0)).toContainText("viewed this page");
  await expect(items().nth(1)).toContainText("created this record");
  // More options: Discard changes, Duplicate as a draft, Archive, Delete permanently.
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("button", { name: "Discard changes" })).toBeDisabled();
  for (const name of ["Duplicate as a draft", "Archive", "Delete permanently"]) await expect(page.getByRole("button", { name })).toBeVisible();
  await page.getByRole("button", { name: "More options" }).click();

  // The record's own rows: Person ID, Updated, Last edited by, Created, Created by.
  const main = page.locator("[data-record-main]");
  await expect(main).toContainText(`Person IDPER-${person.personNumber}`);
  await expect(main).toContainText(`Created by${ACTOR}`);
  // Permissions shows the person's access (Delivery 2); Contracting waits for its module.
  await expect(main.getByText("Permissions", { exact: true })).toHaveCount(1);
  await expect(main).toContainText("No access to any service.");
  await expect(main.getByText("Contracting", { exact: true })).toHaveCount(0);

  // A second opening the same day counts as a view but adds no "viewed" row.
  await page.reload();
  await expect(panel().locator("[data-counter=views]")).toContainText("2");
  await expect(items().filter({ hasText: "viewed this page" })).toHaveCount(1);
});

test("one Submit = one event: updated N fields, old struck → new, contact masked, the description shown like any field, relations as chips, selects as pills", async () => {
  await openPerson("Dana Detail");
  await page.getByLabel("Name", { exact: true }).fill("Dana Detailed");
  await page.getByLabel("Email", { exact: true }).fill("dana@example.net");
  await page.getByLabel("Description").fill("Prefers email");
  await page.getByRole("group", { name: "State" }).getByRole("button", { name: "Contacted" }).click();
  await page.getByLabel("Search organizations").fill("Harbor");
  await page.getByRole("list", { name: "Organizations results" }).getByRole("button", { name: "Harbor Legal Collective" }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("Relevance score", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/people\?q=Dana/);

  await openPerson("Dana Detailed");
  await expect(panel().locator("[data-counter=edits]")).toContainText("1");
  const updated = page.locator("[data-history-item=updated]");
  await expect(updated).toHaveCount(1);
  await expect(updated).toContainText("updated 6 fields");
  // Old value struck through, then the new one.
  const name = updated.locator("[data-change=name]");
  await expect(name.locator(".line-through")).toHaveText("Dana Detail");
  await expect(name).toContainText("Dana Detailed");
  // Contact details masked for this role (config: HISTORY_FIELD_ACCESS).
  const email = updated.locator("[data-change=email]");
  await expect(email).toContainText("d•••@example.org");
  await expect(email).toContainText("d•••@example.net");
  await expect(email).not.toContainText("dana@example");
  // The description is shared information (client, 2026-10-22): old struck → new, never masked.
  const note = updated.locator("[data-change=description]");
  await expect(note.locator(".line-through")).toHaveText("Met at the assembly");
  await expect(note).toContainText("Prefers email");
  // A relation as a chip, a select as a pill, a number as text.
  await expect(updated.locator("[data-change=organizations]")).toContainText("Harbor Legal Collective");
  await expect(updated.locator("[data-change=state]")).toContainText("Contacted");
  await expect(updated.locator("[data-change=relevanceScore]")).toContainText("8");
  await expect(page.locator("[data-record-main]")).toContainText(`Last edited by${ACTOR}`);
  await page.screenshot({ path: join(SHOTS, "detail-person-history-1440.png") });

  // The organization recorded the link too.
  await page.locator("[data-record-main]").getByRole("link", { name: "Harbor Legal Collective" }).click();
  await expect(page).toHaveURL(/\/admin\/organizations\/[0-9a-f-]{36}$/);
  await expect(page.locator("[data-history-item=updated]").first()).toContainText("linked a person");
});

test("added and cleared fields; one-field headlines", async () => {
  await openPerson("Dana Detailed");
  await page.getByLabel("X", { exact: true }).fill("https://x.com/dana");
  await submit();
  await openPerson("Dana Detailed");
  await expect(page.locator("[data-history-item=updated]").first()).toContainText("added an X");
  await expect(page.locator("[data-history-item=updated]").first()).toContainText("x.com/dana");

  await page.getByLabel("Website", { exact: true }).fill("");
  await submit();
  await openPerson("Dana Detailed");
  const cleared = page.locator("[data-history-item=updated]").first();
  await expect(cleared).toContainText("cleared a field");
  await expect(cleared.locator(".line-through")).toHaveText("dana.example");
  await expect(cleared).toContainText("Not set");
});

test("no autosave: leaving with changes asks first; Discard restores; nothing is saved without Submit", async () => {
  await openPerson("Dana Detailed");
  await page.getByLabel("Name", { exact: true }).fill("Not saved");

  // Dismiss: stay, with the edit.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe(LEAVE_MESSAGE);
    void dialog.dismiss();
  });
  await page.locator("#admin-sidebar").getByRole("link", { name: "Organizations" }).first().click();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Not saved");

  // The back arrow asks too; accepting leaves without saving.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("link", { name: "Back to People" }).click();
  await expect(page).toHaveURL(/\/admin\/people(\?|$)/);
  await openPerson("Dana Detailed");

  // Discard (More options) puts the saved values back; then leaving doesn't ask.
  await page.getByLabel("Name", { exact: true }).fill("Not saved either");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Dana Detailed");
  let asked = false;
  page.once("dialog", (dialog) => {
    asked = true;
    void dialog.dismiss();
  });
  await page.getByRole("link", { name: "Back to People" }).click();
  await expect(page).toHaveURL(/\/admin\/people(\?|$)/);
  expect(asked).toBe(false);
});

test("comments: add, edit and delete your own; every version stays in the history", async () => {
  await openPerson("Dana Detailed");
  const box = page.getByLabel("Leave a comment");
  await box.fill("Asked about availability in November.");
  // The comment box never submits the record.
  await expect(page.getByRole("button", { name: "Submit changes" })).toBeDisabled();
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const comment = page.locator("[data-history-item=comment_added]").first();
  await expect(comment).toContainText("left a comment");
  await expect(comment).toContainText("Asked about availability in November.");

  await comment.getByRole("button", { name: "Edit" }).click();
  await comment.getByLabel("Edit your comment").fill("Available from November 10.");
  await comment.getByRole("button", { name: "Save comment" }).click();
  await expect(page.locator("[data-history-item=comment_edited]").first()).toContainText("edited a comment");
  // The edit is its own entry, old text struck → new; the original entry keeps what was first written.
  const edited = page.locator("[data-history-item=comment_edited]").first();
  await expect(edited.locator(".line-through")).toHaveText("Asked about availability in November.");
  await expect(edited).toContainText("Available from November 10.");
  await expect(page.locator("[data-history-item=comment_added]").first().locator("[data-comment-body]")).toContainText("Asked about availability in November.");

  await page.locator("[data-history-item=comment_added]").first().getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("[data-history-item=comment_deleted]").first()).toContainText("deleted a comment");
  await expect(page.locator("[data-history-item=comment_added]").first()).toContainText("Deleted.");
});

test("the panel's actions and counters stay fixed; only the History list scrolls, with the menu's scrollbar padding", async () => {
  await openPerson("Dana Detailed");
  const path = new URL(page.url()).pathname.split("/").pop()!;
  for (let index = 1; index <= 14; index++) {
    const response = await page.request.post(`/api/admin/history/person/${path}/comments`, { data: { body: `Note ${index}: a longer comment so the list needs scrolling.` }, headers: { origin: origin() } });
    expect(response.status()).toBe(204);
  }
  await page.reload();
  await expect(items().first()).toBeVisible();
  const scroller = page.locator("[data-history-scroll]");
  const topBefore = await panel().locator("[data-record-panel-top]").boundingBox();
  const heading = panel().getByRole("heading", { name: /^History/ });
  const headingBefore = await heading.boundingBox();
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await scroller.hover();
  await page.mouse.wheel(0, 800);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await panel().locator("[data-record-panel-top]").boundingBox()).toEqual(topBefore);
  expect(await heading.boundingBox()).toEqual(headingBefore);
  // Neither the page nor the fields moved.
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  expect(await page.locator("[data-record-main]").evaluate((el) => el.scrollTop)).toBe(0);
  // Same right padding as the left menu's scroll area (8px).
  expect(await scroller.evaluate((el) => getComputedStyle(el).paddingRight)).toBe("8px");
  await page.screenshot({ path: join(SHOTS, "detail-person-scrolled-1440.png") });
});

test("duplicate ('Duplicated from PER-n') and duplicate as a draft (saved only on Submit)", async () => {
  await openPerson("Dana Detailed");
  const number = (await page.locator("[data-record-main]").getByText(/^PER-\d+$/).innerText()).trim();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Person duplicated" })).toBeVisible();
  const duplicated = page.locator("[data-history-item=duplicated]");
  // The copy is named "<name> DUPLICATE" (client, 2026-10-22), so it can't be mistaken for the original.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dana Detailed DUPLICATE");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Dana Detailed DUPLICATE");
  await expect(page).toHaveTitle("Dana Detailed DUPLICATE");
  await expect(duplicated).toContainText("duplicated a record");
  await expect(duplicated).toContainText("Duplicated from");
  await expect(duplicated).toContainText(number);
  // Clean up the copy: archive it (kept out of the default list).
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator("header").getByText("Archived", { exact: true })).toBeVisible();

  await openPerson("Dana Detailed");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Duplicate as a draft" }).click();
  await expect(page).toHaveURL(/\/admin\/people\/new$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Dana Detailed DUPLICATE");
  await page.getByLabel("Name", { exact: true }).fill("Dana Draft");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Person created" })).toBeVisible();
  // The new record opens.
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Dana Draft");
  await openPerson("Dana Draft");
  await expect(items().filter({ hasText: "created this record" })).toHaveCount(1);
});

test("archive and restore with the Archived view; permanent delete only with the name typed", async () => {
  await openPerson("Dana Draft");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Person archived" })).toBeVisible();
  await expect(page.locator("[data-history-item=archived]").first()).toContainText("archived this record");

  await page.goto("/admin/people?q=Dana%20Draft");
  // Out of the default list…
  await expect(page.getByText("No people match this search or these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page).toHaveURL(/view=archived/);
  await expect(rows()).toHaveCount(1);
  await rows().first().getByRole("link").click();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Person restored" })).toBeVisible();
  await expect(page.locator("[data-history-item=restored]").first()).toContainText("restored this record");

  await page.getByRole("button", { name: "Delete permanently" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete permanently?" });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Delete permanently" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type Dana Draft to confirm").fill("Dana");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type Dana Draft to confirm").fill("Dana Draft");
  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: "Person deleted" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/people$/);
  // Gone from both views.
  for (const query of ["", "&filter=archived:is:true"]) {
    const found = (await (await page.request.get(`/api/admin/people?search=Dana%20Draft${query}`)).json()) as { total: number };
    expect(found.total).toBe(0);
  }
});

test("organizations and Treasury entries have the same panel and history", async () => {
  await page.goto("/admin/organizations?q=harbor");
  await rows().first().getByRole("link").click();
  await expect(panel().locator("[data-record-panel-top]").getByRole("button")).toHaveText(["Duplicate", "Submit changes", "More options"]);
  await expect(page.locator("[data-record-main]")).toContainText(/Organization ID\s*ORG-\d+/);
  await expect(panel().getByRole("heading", { name: /^History/ })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "detail-organization-1440.png") });

  await page.goto("/admin/treasury/manage?q=Association%20bank%20fees");
  await rows().first().click();
  await expect(page).toHaveURL(/\/admin\/treasury\/[0-9a-f-]{36}$/);
  await expect(panel().getByRole("button", { name: /^(Publish|Unpublish)$/ })).toBeVisible();
  await expect(page.locator("[data-record-main]")).toContainText(/Entry ID\s*EXP-\d+/);
  // Money: currency code, two decimals, a real minus for expenses.
  await expect(page.locator("[data-record-main]")).toContainText(/Amount\s*\u2212[A-Z]{3}\u00a0\d[\d,]*\.\d{2}Fee/);
  await page.screenshot({ path: join(SHOTS, "detail-treasury-1440.png") });
});

test("Monitoring → History: every event, filtered by record type, actor, source and date", async () => {
  await page.goto("/admin/people");
  await page.locator("#admin-sidebar").getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/admin\/history$/);
  await expect(page).toHaveTitle("History");
  await expect(page.locator("#admin-sidebar [aria-current=page]")).toHaveText("History");
  const list = page.getByRole("list", { name: "History, newest first" });
  await expect(list.locator("[data-history-item]").first()).toBeVisible();
  // The deleted person's event stays, named by its last title, without a link.
  const deleted = list.locator("[data-history-item=deleted]").filter({ hasText: "Dana Draft" });
  await expect(deleted).toContainText(`${ACTOR} deleted Dana Draft`);
  await expect(deleted.locator("[data-history-subject]")).toHaveText("Dana Draft");
  await expect(deleted.getByRole("link")).toHaveCount(0);

  await page.getByLabel("Record type").selectOption("organization");
  await expect(page).toHaveURL(/entity=organization/);
  await expect(list.locator("[data-history-item]").first()).toBeVisible();
  for (const href of await list.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")))) expect(href).toMatch(/^\/admin\/organizations\//);

  await page.getByLabel("Actor").selectOption({ label: ACTOR });
  await page.getByLabel("Source").selectOption("admin");
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  // From and To use the design-system date picker: it opens on today; Enter picks it.
  for (const id of ["history-from", "history-to"]) {
    await page.locator(`#${id}`).click();
    await expect(page.locator("[data-date-picker] [aria-current=date]")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-date-picker]")).toHaveCount(0);
  }
  await expect(page).toHaveURL(new RegExp(`from=${today}&to=${today}|to=${today}.*from=${today}|from=${today}.*to=${today}`));
  await expect(list.locator("[data-history-item]").first()).toBeVisible();
  await page.getByLabel("Actor").selectOption("automation");
  await expect(page.getByText("No events match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/history$/);
  await page.screenshot({ path: join(SHOTS, "history-page-1440.png") });
});

test("formatting: short times in the feed, full dates on the record, the reference on hover", async () => {
  await openPerson("Dana Detailed");
  const time = items().first().locator("time");
  await expect(time).toHaveText(/^[A-Z][a-z]{2}\s\d{1,2}\s\d{1,2}:\d{2}\s(AM|PM)$/);
  await expect(time).toHaveAttribute("title", /\d{4}/);
  const updated = page.locator("[data-record-main]").getByText(/^[A-Z][a-z]+\s\d{1,2}\sat\s\d{1,2}:\d{2}\s(AM|PM)$/).first();
  await expect(updated).toBeVisible();
});

test("side-by-side comparisons with p10, p14 and the four prototype screenshots", async () => {
  const figmaDir = process.env.FIGMA_PNG_DIR;
  const prototypeDir = "docs/design/figma/person-record-prototype";
  test.skip(!figmaDir || !existsSync(prototypeDir), "Set FIGMA_PNG_DIR to the PNG renders of admin-desktop.pdf (pN.png); the prototype screenshots must be in docs/design/.");
  // The app in the prototype's states: the top of a record, then its end.
  await openPerson("Dana Detailed");
  await page.screenshot({ path: join(SHOTS, "detail-p14-top-1440.png") });
  await page.locator("[data-record-main]").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: join(SHOTS, "detail-p14-end-1440.png") });
  await page.locator("[data-history-scroll]").evaluate((el) => el.scrollTo(0, 400));
  await page.screenshot({ path: join(SHOTS, "detail-p14-history-1440.png") });

  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const pairs: [string, string, string, string][] = [
    ["detail-p14-top-1440", join(figmaDir!, "p14.png"), "Figma P14", "margin-top:-104px"],
    ["detail-p14-history-1440", join(figmaDir!, "p10.png"), "Figma P10 (panel and history)", "margin-top:-104px"],
    ["detail-p14-end-1440", join(prototypeDir, "p14-prototype-1.png"), "Prototype 1", ""],
    ["detail-p14-top-1440", join(prototypeDir, "p14-prototype-2.png"), "Prototype 2", ""],
    ["detail-p14-history-1440", join(prototypeDir, "p14-prototype-3.png"), "Prototype 3", ""],
    ["detail-p14-history-1440", join(prototypeDir, "p14-prototype-4.png"), "Prototype 4 (panel)", ""],
  ];
  const compare = await page.context().newPage();
  await compare.setViewportSize({ width: 2 * 1440 + 24, height: 920 + 40 });
  for (const [index, [shot, reference, label, offset]] of pairs.entries()) {
    const app = join(SHOTS, `${shot}.png`);
    if (!existsSync(app) || !existsSync(reference)) continue;
    await compare.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App — person record</figcaption><img src="${data(app)}" width="1440" height="920"></figure>
        <figure style="margin:0"><figcaption style="height:24px">${label}</figcaption>
          <div style="width:1440px;height:920px;overflow:hidden"><img src="${data(reference)}" style="max-width:1440px;${offset}"></div></figure>
      </div></body>`);
    await compare.screenshot({ path: join(SHOTS, `compare-detail-${index + 1}.png`) });
  }
  await compare.close();
});
