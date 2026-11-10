import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Admin Treasury (roadmap 1b) through the real stack, on the test-only
 * fixtures: five Stripe test-mode donations (EXP-1…5), four expenses copied
 * from Notion earlier and one native EUR expense (EXP-6…10). Serial, on one signed-in
 * page; every change it makes is undone before it ends. Runs after the public
 * suites (playwright.config.ts): publishing changes what they read.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

let page: Page;
const rows = () => page.locator("tbody tr");
/** Sessions the other admin suites saved (same owner, same API), freshest first: admin-figma runs just before this project. */
const SAVED_SESSIONS = ["admin-figma", "admin-table", "admin-directory-v2", "admin"].map((name) => `test-results/.auth/${name}.json`);

async function axe() {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function openRecord(search: string) {
  await page.goto(`/admin/treasury/manage?q=${encodeURIComponent(search)}`);
  await expect(rows()).toHaveCount(1);
  await rows().first().click();
  await expect(page).toHaveURL(/\/admin\/treasury\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("EXP-");
}

test.beforeAll(async ({ browser }, testInfo) => {
  // Logins are rate-limited (5 per 15 minutes): reuse a saved session that is still valid, sign in only if none is.
  const signIn = () => page.getByRole("heading", { name: /^Sign in/ });
  for (const state of [...SAVED_SESSIONS.filter((path) => existsSync(path)), undefined]) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 900 }, storageState: state });
    page = await context.newPage();
    await page.goto("/admin/treasury/manage");
    // An expired session is sent to the login page by the client after the first load.
    await expect(signIn().or(page.locator("tbody tr").first())).toBeVisible({ timeout: 30_000 });
    if (!(await signIn().isVisible()) || state === undefined) break;
    await context.close();
  }
  if (await signIn().isVisible()) {
    await page.getByLabel("Email address").fill(E2E_ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page).toHaveURL("/admin/treasury/manage");
});
test.afterAll(async () => {
  await page.context().close();
});

test("the sidebar opens the public Treasury; Administrate opens the list: every entry, its columns, views and search", async () => {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Treasury" }).click();
  await expect(page).toHaveURL("/admin/treasury");
  await page.locator("[data-public-view-header]").getByRole("link", { name: "Administrate" }).click();
  await expect(page).toHaveURL("/admin/treasury/manage");
  await expect(rows()).toHaveCount(10);
  const headers = await page.locator("thead th").allInnerTexts();
  for (const column of [
    "Number",
    "Date",
    "Type",
    "Amount",
    "Gross / fee / net",
    "Recipient",
    "Expense types",
    "Review status",
    "Publication",
    "Source",
    "Mode",
  ]) {
    expect(headers.map((header) => header.trim())).toContain(column);
  }
  await expect(rows().first()).toContainText("EXP-5");
  await axe();

  const view = (name: string) => page.getByRole("button", { name, exact: true });
  await view("Expenses").click();
  await expect(rows()).toHaveCount(5);
  await view("To review").click();
  await expect(rows()).toHaveCount(2);
  await view("Test mode").click();
  await expect(rows()).toHaveCount(5);
  await view("Unpublished").click();
  await expect(rows()).toHaveCount(1);
  await expect(rows().first()).toContainText("Legal advice");
  await view("All").click();
  await expect(rows()).toHaveCount(10);

  await page.getByRole("searchbox", { name: "Search entries" }).fill("EXP-8");
  await expect(rows()).toHaveCount(1);
  await expect(rows().first()).toContainText("Platform development");
});

test("an expense copied from Notion earlier is an ordinary entry now: no Notion badge, edited here (decision of 2026-10-23)", async () => {
  await openRecord("Platform development");
  await expect(page.locator("[data-managed=notion]")).toHaveCount(0);
  await expect(page.getByText(/Managed in Notion|Open in Notion/)).toHaveCount(0);
  // The Treasury is edited in the admin only: the internal note, the review and the publication.
  await expect(page.locator("#treasury-note")).toBeEditable();
  await expect(page.getByRole("group", { name: "Review status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: /^History/ })).toBeVisible();
  // No import or export here.
  await expect(page.getByRole("button", { name: /Import|Export/ })).toHaveCount(0);
  await axe();
});

test("the expense detail page (OPS-155): Recipient, Expense types, Name, Description and Review status first; every field editable by the Rootadmin; no documents", async () => {
  await openRecord("Platform development");
  const properties = await page.locator("[data-property]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-property")));
  expect(properties.slice(0, 5)).toEqual(["Recipient", "Expense types", "Name", "Public description", "Review status"]);
  expect(properties).toEqual(expect.arrayContaining(["Type", "Date", "Amount", "Fee", "Net", "Cadence", "Publication", "Source", "Internal note"]));
  // Accounting documents are handled outside the platform now (ADR 021).
  expect(properties).not.toContain("Documents");
  await expect(page.locator("input[type=file]")).toHaveCount(0);

  // The Rootadmin edits every business field; the net is worked out.
  // One recipient, as a removable chip in the picker.
  await expect(page.locator("[data-property=Recipient]").getByRole("button", { name: /^Remove / })).toHaveCount(1);
  await expect(page.locator("#treasury-name")).toHaveValue("Platform development");
  await expect(page.locator("#treasury-amount")).toHaveValue("5675.00");
  await expect(page.locator("#treasury-fee")).toHaveValue("0.00");
  await expect(page.getByRole("group", { name: "Cadence" })).toBeVisible();
  await axe();

  await page.locator("#treasury-name").fill("Platform development, phase 2");
  await page.locator("#treasury-amount").fill("5,700.50");
  await page.locator("#treasury-fee").fill("12.25");
  await expect(page.locator("[data-property=Net]")).toContainText("5,712.75");
  await page.getByRole("group", { name: "Cadence" }).getByRole("button", { name: "Monthly" }).click();
  await axe();
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByText("Treasury entry updated")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/treasury\/manage\?q=/);
  await page.goto("/admin/treasury/manage?q=phase%202");
  await expect(rows()).toHaveCount(1);
  await rows().first().click();
  await expect(page.locator("#treasury-amount")).toHaveValue("5700.50");
  await expect(page.locator("#treasury-fee")).toHaveValue("12.25");
  await expect(page.locator("[data-property=Net]")).toContainText("5,712.75");
  await expect(page.getByRole("group", { name: "Cadence" }).getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-history-item=updated]").first()).toContainText("Amount");

  // Errors appear under their field: a name is required (checked here), a qualified expense keeps its recipient (the API).
  await page.locator("#treasury-name").fill("");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.locator("[data-property=Name] [data-field-error]")).toHaveText("Give the entry a name.");
  await expect(page.locator("#treasury-name")).toHaveAttribute("aria-invalid", "true");
  await axe();
  await page.locator("#treasury-name").fill("Platform development, phase 2");
  await page
    .locator("[data-property=Recipient]")
    .getByRole("button", { name: /^Remove / })
    .click();
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.locator("[data-property=Recipient] [data-field-error]")).toHaveText("Qualified and Not required need exactly one recipient.");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();

  // Back to the fixture's values (the suite leaves the data as it found it).
  await page.goto("/admin/treasury/manage?q=phase%202");
  await rows().first().click();
  await page.locator("#treasury-name").fill("Platform development");
  await page.locator("#treasury-amount").fill("5675.00");
  await page.locator("#treasury-fee").fill("0.00");
  await page.getByRole("group", { name: "Cadence" }).getByRole("button", { name: "One-off" }).click();
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByText("Treasury entry updated")).toBeVisible();
  await openRecord("Platform development");
  await expect(page.locator("#treasury-amount")).toHaveValue("5675.00");

  // The old document routes are gone.
  expect((await page.request.get("/api/admin/treasury/documents/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
});

test("a Stripe donation: only the internal note and the publication change", async () => {
  await openRecord("EXP-1");
  await expect(page.locator("[data-managed=stripe]")).toContainText("From Stripe");
  await expect(page.getByText("Stripe test mode: a sandbox payment, shown on the public Treasury (marked Test in production, until go-live).")).toBeVisible();
  await expect(page.getByText("Donations, refunds and disputes need no review.")).toBeVisible();

  await page.getByLabel("Internal note").fill("Thank-you email sent");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByText("Treasury entry updated")).toBeVisible();
  // Submit goes back to the list; the entry kept the note.
  await expect(page).toHaveURL(/\/admin\/treasury\/manage\?q=EXP-1/);
  await rows().first().click();
  await expect(page.getByLabel("Internal note")).toHaveValue("Thank-you email sent");

  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
  await expect(page.getByText("Stripe test mode: a sandbox payment, not real money.")).toBeVisible();
  expect((await page.request.get("/api/treasury/entries/1")).status()).toBe(404);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeEnabled();
  expect((await page.request.get("/api/treasury/entries/1")).status()).toBe(200);

  await page.getByLabel("Internal note").fill("");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByText("Treasury entry updated")).toBeVisible();
});

test("a native expense can be reviewed; Qualified needs its recipient", async () => {
  await openRecord("Association bank fees");
  const review = page.getByRole("group", { name: "Review status" });
  await expect(review.getByRole("button", { name: "Qualified", exact: true })).toHaveAttribute("aria-pressed", "true");
  // No autosave: the pill only changes the draft; Submit changes saves it.
  await review.getByRole("button", { name: "Pending documents" }).click();
  await expect(review.getByRole("button", { name: "Pending documents" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByText("Treasury entry updated")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/treasury\/manage\?q=/);
  await rows().first().click();
  await expect(review.getByRole("button", { name: "Pending documents" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Last reviewed/)).toBeVisible();
  await expect(page.locator("[data-history-item=updated]").first()).toContainText("Review status");
  await review.getByRole("button", { name: "Qualified", exact: true }).click();
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page).toHaveURL(/\/admin\/treasury\/manage\?q=/);
  await rows().first().click();
  await expect(review.getByRole("button", { name: "Qualified", exact: true })).toHaveAttribute("aria-pressed", "true");
  await axe();
  // OPS-147: a manual entry is archived, never deleted — for the Rootadmin too.
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
  await page.getByRole("button", { name: "More options" }).click();
});
