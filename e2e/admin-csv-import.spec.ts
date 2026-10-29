import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * The CSV import of People (Delivery 3) through the real stack: More
 * options → Import CSV, a file it can't read (the error modal), the column
 * matching, the check (to add, possible duplicates linked to the existing
 * record, rows with errors and why), the import with its toast, the report
 * page, and the "imported" event on the new person — at 1440 and 1024,
 * dark and light, with axe. Side-by-side Figma comparisons (p11–p13) when
 * FIGMA_PNG_DIR is set. Test fixtures only (the *_test database).
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const SHOTS = "test-results/figma";
mkdirSync(SHOTS, { recursive: true });
const FRAME = { width: 1440, height: 920 };
const TABLET = { width: 1024, height: 768 };
const RUN = Date.now().toString(36);
const NEW_NAME = `Nora Import ${RUN}`;

let page: Page;
let existing = { name: "", email: "" };
const consoleIssues: string[] = [];

async function axe() {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Dark and light, each checked with axe and captured. */
async function bothThemes(name: string) {
  await axe();
  await page.screenshot({ path: join(SHOTS, `${name}-dark.png`) });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await axe();
  await page.screenshot({ path: join(SHOTS, `${name}-light.png`) });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
}

const file = (name: string, text: string | Buffer, mimeType = "text/csv") => ({ name, mimeType, buffer: typeof text === "string" ? Buffer.from(text, "utf8") : text });

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: FRAME });
  page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(E2E_ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#admin-sidebar")).toBeVisible({ timeout: 60_000 });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`[${message.type()}] ${new URL(page.url()).pathname} :: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => consoleIssues.push(`[pageerror] ${new URL(page.url()).pathname} :: ${error.message.slice(0, 300)}`));
  // A person of the test fixtures, to be met again as a possible duplicate.
  const first = (await (await page.request.get("/api/admin/people?pageSize=50&sort=name:asc")).json()) as { items: { name: string; email: string | null }[] };
  const withEmail = first.items.find((person) => person.email);
  expect(withEmail).toBeDefined();
  existing = { name: withEmail!.name, email: withEmail!.email! };
});

test.afterAll(async () => {
  await page.context().close();
});

test("More options → Import CSV (p11), the upload step, and the error modal for a file it can't read", async () => {
  await page.goto("/admin/people");
  await page.getByRole("button", { name: "More options" }).click();
  const menu = page.getByRole("menu", { name: "More options" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Import CSV", "Import Notion"]);
  await page.screenshot({ path: join(SHOTS, "csv-p11-more-options-1440.png") });
  await axe();
  await menu.getByRole("menuitem", { name: "Import CSV" }).click();
  await expect(page).toHaveURL(/\/admin\/imports\/csv\?table=people$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Import CSV · People");
  await expect(page.getByRole("list", { name: "Import steps" }).locator("[aria-current=step]")).toContainText("Upload");
  await bothThemes("csv-step1-upload-1440");

  // Not UTF-8 (an old "CSV (Windows)" export): explained in the modal, nothing else happens.
  await page.locator("input[type=file]").setInputFiles(file("latin1.csv", Buffer.from([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x52, 0xe9, 0x6d, 0x79, 0x0a])));
  const modal = page.getByRole("dialog", { name: "This file can't be imported" });
  await expect(modal.getByRole("alert")).toHaveText('The file isn\'t UTF-8 text. Export it again as "CSV UTF-8".');
  await page.screenshot({ path: join(SHOTS, "csv-error-modal-1440.png") });
  await axe();
  await modal.getByRole("button", { name: "Choose another file" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("list", { name: "Import steps" }).locator("[aria-current=step]")).toContainText("Upload");
});

test("columns matched by name (changeable, or skipped), then the check: to add, possible duplicates (linked), rows with errors", async () => {
  const csv =
    "Full name;E-mail;State;Organizations;Favourite colour;Person ID\n" +
    `${NEW_NAME};nora.${RUN}@example.net;Sourced;;green;PER-999\n` +
    `Someone Else;${existing.email};;;blue;PER-1\n` +
    `Olga Broken;not-an-email;Unknown state;Nowhere Ltd ${RUN};red;\n`;
  await page.locator("input[type=file]").setInputFiles(file("contacts.csv", csv));
  await expect(page.getByRole("heading", { name: "Match the columns of contacts.csv" })).toBeVisible();
  const field = (column: string) => page.getByLabel(`Field for ${column}`);
  await expect(field("Full name")).toHaveValue("name");
  await expect(field("E-mail")).toHaveValue("email");
  await expect(field("State")).toHaveValue("state");
  await expect(field("Organizations")).toHaveValue("organizations");
  await expect(field("Favourite colour")).toHaveValue(""); // no such field: skipped
  await expect(field("Person ID")).toHaveValue(""); // display numbers are never imported
  // Name is required: without it, the check can't run.
  await field("Full name").selectOption("");
  await expect(page.getByRole("button", { name: "Check the rows" })).toBeDisabled();
  await field("Full name").selectOption("name");
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await bothThemes(`csv-step2-columns-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);

  await page.getByRole("button", { name: "Check the rows" }).click();
  await expect(page.getByRole("heading", { name: "Check before importing" })).toBeVisible();
  await expect(page.locator("[data-counts]")).toContainText("1 to add");
  await expect(page.locator("[data-counts]")).toContainText("1 possible duplicate skipped");
  await expect(page.locator("[data-counts]")).toContainText("1 with an error");
  await expect(page.getByRole("heading", { name: "To add (1)" })).toBeVisible();
  const duplicate = page.locator("[data-duplicate-row='3']");
  await expect(duplicate).toContainText("Same email as");
  await expect(duplicate.getByRole("link", { name: existing.name })).toHaveAttribute("href", /^\/admin\/people\/[0-9a-f-]{36}$/);
  await expect(duplicate.getByRole("checkbox")).not.toBeChecked();
  const error = page.locator("[data-error-row='4']");
  await expect(error).toContainText('State: "Unknown state" isn\'t one of:');
  await expect(error).toContainText(`Organizations: no organization named "Nowhere Ltd ${RUN}"`);
  await expect(page.getByRole("button", { name: "Import 1 person" })).toBeEnabled();
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await bothThemes(`csv-step3-check-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);
});

test("import: the toast with the counts and the report link, then the report and the new person's history", async () => {
  await page.getByRole("button", { name: "Import 1 person" }).click();
  const toast = page.locator("[data-admin-toast]");
  await expect(toast).toContainText("1 person added · 1 not added (already existing)");
  await expect(page.getByRole("heading", { name: "Imported" })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "csv-step4-done-1440.png") });
  await axe();

  await toast.getByRole("link", { name: "See the report" }).click();
  await expect(page).toHaveURL(/\/admin\/imports\/csv\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Import report · contacts.csv");
  await expect(page.locator("dl")).toContainText(E2E_ADMIN.email);
  await expect(page.locator("dl")).toContainText("1 added · 1 not added (already existing) · 1 with errors");
  await expect(page.getByRole("heading", { name: "Added (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Possible duplicates, not added (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rows with errors, not added (1)" })).toBeVisible();
  await bothThemes("csv-report-1440");

  // The report is also reachable from Monitoring → History.
  const reportUrl = new URL(page.url()).pathname;
  await page.goto("/admin/history");
  await expect(page.locator(`a[href='${reportUrl}']`).first()).toBeVisible();

  await page.goto(reportUrl);
  await page.getByRole("link", { name: NEW_NAME }).click();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  const history = page.locator("[data-record-panel]");
  await expect(history).toContainText("imported this record");
  await expect(history).toContainText("CSV import");
  await page.screenshot({ path: join(SHOTS, "csv-imported-person-1440.png") });
});

test("Treasury and every other list offer no import or export", async () => {
  for (const path of ["/admin/treasury/manage", "/admin/expertise", "/admin/fields", "/admin/domains", "/admin/services", "/admin/permissions", "/admin/accounts"]) {
    await page.goto(path);
    // The list's toolbar is there (search box), so its actions are too.
    await expect(page.getByRole("searchbox", { name: /^Search (?!the menu)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "More options" }), path).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Import|Export/ }), path).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Import|Export/ }), path).toHaveCount(0);
  }
  // Organizations keep it, for organizations.
  await page.goto("/admin/organizations");
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("menuitem", { name: "Import CSV" })).toHaveAttribute("href", "/admin/imports/csv?table=organizations");
});

test("side by side with Figma p11–p13 (no CSV frame: the menu, the panel buttons and the toast follow them)", async () => {
  const figmaDir = process.env.FIGMA_PNG_DIR;
  test.skip(!figmaDir, "Set FIGMA_PNG_DIR to the PNG renders of admin-desktop.pdf (pN.png).");
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const compare = await page.context().newPage();
  await compare.setViewportSize({ width: 2 * 1440 + 24, height: 920 + 40 });
  for (const [shot, frame] of [
    ["csv-p11-more-options-1440", "p11"],
    ["csv-step3-check-1440-dark", "p12"],
    ["csv-step4-done-1440", "p13"],
  ] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await compare.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App</figcaption><img src="${data(app)}" width="1440" height="920"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma ${frame.toUpperCase()}</figcaption>
          <div style="width:1440px;height:920px;overflow:hidden"><img src="${data(figma)}" ${frame === "p11" ? "" : 'width="1440" height="1024" style="margin-top:-104px"'}></div></figure>
      </div></body>`);
    await compare.screenshot({ path: join(SHOTS, `compare-csv-${frame}.png`) });
  }
  await compare.close();
});

test("no console errors or warnings on any of the pages above", async () => {
  // The one expected: the browser logs the 400 of the unreadable file the first test uploads on purpose.
  const expected = "[error] /admin/imports/csv :: Failed to load resource: the server responded with a status of 400 (Bad Request)";
  expect(consoleIssues.filter((issue) => issue === expected)).toHaveLength(1);
  expect(consoleIssues.filter((issue) => issue !== expected)).toEqual([]);
});
