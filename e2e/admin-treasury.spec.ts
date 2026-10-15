import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Admin Treasury (roadmap 1b) through the real stack, on the test-only
 * fixtures: five Stripe test-mode donations (EXP-1…5), four Notion-managed
 * expenses and one native EUR expense (EXP-6…10). Serial, on one signed-in
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
const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

async function axe() {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function openRecord(search: string) {
  await page.goto(`/admin/treasury?q=${encodeURIComponent(search)}`);
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
    await page.goto("/admin/treasury");
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
  await expect(page).toHaveURL("/admin/treasury");
});
test.afterAll(async () => {
  await page.context().close();
});

test("the sidebar opens the Treasury list: every entry, its columns, views and search", async () => {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Treasury" }).click();
  await expect(page).toHaveURL("/admin/treasury");
  await expect(rows()).toHaveCount(10);
  const headers = await page.locator("thead th").allInnerTexts();
  for (const column of ["Number", "Date", "Type", "Amount", "Gross / fee / net", "Recipient", "Expense types", "Review status", "Publication", "Source", "Mode"]) {
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

test("a Notion-managed expense is read-only, with the badge and the Notion link", async () => {
  await openRecord("Platform development");
  const badge = page.locator("[data-managed=notion]");
  await expect(badge).toContainText("Managed in Notion");
  await expect(badge.getByRole("link", { name: /Open in Notion/ })).toHaveAttribute("href", /^https:\/\/www\.notion\.so\/de0000006000400080000000000/);
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeDisabled();
  await expect(page.getByText("Managed in Notion: unpublish it there.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Review status" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit changes" })).toHaveCount(0);
  await axe();
});

test("supporting documents: upload, list, download and delete (private, admins only)", async () => {
  await openRecord("Platform development");
  await expect(page.getByText("No documents yet.")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({ name: "invoice-april.pdf", mimeType: "application/pdf", buffer: PDF });
  const documents = page.getByRole("list", { name: "Supporting documents" });
  await expect(documents.getByRole("link", { name: "invoice-april.pdf" })).toBeVisible();

  const download = page.waitForEvent("download");
  await documents.getByRole("link", { name: "invoice-april.pdf" }).click();
  expect((await download).suggestedFilename()).toBe("invoice-april.pdf");

  // A file that isn't a PDF, PNG or JPEG is refused before upload.
  await page.locator("input[type=file]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "Only PDF, PNG or JPEG" })).toBeVisible();

  await documents.getByRole("button", { name: "Delete invoice-april.pdf" }).click();
  await documents.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No documents yet.")).toBeVisible();

  // The download route itself needs a session.
  const anonymous = await page.context().browser()!.newContext();
  expect((await anonymous.request.get("/api/admin/treasury/documents/00000000-0000-4000-8000-000000000000", { headers: { origin: "http://localhost" } })).status()).toBe(401);
  await anonymous.close();
});

test("a document over 10 MB reaches the API whole through the website's proxy (up to 20 MB)", async () => {
  await openRecord("Platform development");
  const big = Buffer.concat([PDF, Buffer.alloc(15 * 1024 * 1024, 0x20)]);
  await page.locator("input[type=file]").setInputFiles({ name: "scan-15mb.pdf", mimeType: "application/pdf", buffer: big });
  const documents = page.getByRole("list", { name: "Supporting documents" });
  await expect(documents.getByRole("link", { name: "scan-15mb.pdf" })).toBeVisible({ timeout: 30_000 });
  await documents.getByRole("button", { name: "Delete scan-15mb.pdf" }).click();
  await documents.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No documents yet.")).toBeVisible();
});

test("a Stripe donation: only the internal note and the publication change", async () => {
  await openRecord("EXP-1");
  await expect(page.locator("[data-managed=stripe]")).toContainText("From Stripe");
  await expect(page.getByText("Stripe test mode: a sandbox payment, shown on the public Treasury (marked Test in production, until go-live).")).toBeVisible();
  await expect(page.getByText("Donations, refunds and disputes need no review.")).toBeVisible();

  await page.getByLabel("Internal note").fill("Thank-you email sent");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByText("Internal note saved")).toBeVisible();
  await page.reload();
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
  await expect(page.getByText("Internal note saved")).toBeVisible();
});

test("a native expense can be reviewed; Qualified needs its recipient", async () => {
  await openRecord("Association bank fees");
  const review = page.getByRole("group", { name: "Review status" });
  await expect(review.getByRole("button", { name: "Qualified", exact: true })).toHaveAttribute("aria-pressed", "true");
  await review.getByRole("button", { name: "Pending documents" }).click();
  await expect(review.getByRole("button", { name: "Pending documents" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Last reviewed/)).toBeVisible();
  await review.getByRole("button", { name: "Qualified", exact: true }).click();
  await expect(review.getByRole("button", { name: "Qualified", exact: true })).toHaveAttribute("aria-pressed", "true");
  await axe();
});
