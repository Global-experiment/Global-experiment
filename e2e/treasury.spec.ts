import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The public Treasury (Common pages p11–p16, p22–p27) through the real
 * stack (Next → NestJS → PostgreSQL 17 test database) with the test-only
 * fixtures (apps/api/src/testing/fixtures/load-treasury-fixtures.ts):
 * five USD test-mode donations (public: the e2e API isn't production),
 * four published expenses — one unqualified, one with five tags, the p22
 * example (USD 5,675), one in EUR — and an unpublished CHF one that must
 * never appear. Settings in the test database: unqualified entries may be
 * published, and the "Cry for donation" banner is on.
 *
 * The default page (decided 2026-10-19, treasury.public_toolbar off): the
 * header is back, title and share; the stats are in the stats currency
 * setting (USD); the history lists every currency, latest first. The
 * search, sort, filter and currency controls are kept behind the setting
 * and tested in treasury-toolbar.spec.ts.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the API isn't running.");
test.use({ viewport: { width: 412, height: 900 } });

const rows = (page: Page) => page.locator("main ul li a");
const amountsShown = (page: Page) => rows(page).locator("[data-amount]").allInnerTexts();

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

test.describe("Treasury list", () => {
  test("lists every public entry in every currency, latest first; the header is back, title and share (decided 2026-10-19)", async ({ page }) => {
    const response = await page.goto("/treasury");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Treasury" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /History/ })).toContainText("9");
    expect(await amountsShown(page)).toEqual([
      "+ USD 50",
      "+ USD 10",
      "+ USD 6.40",
      "+ USD 5",
      "+ USD 2",
      "- USD 50",
      "- USD 50",
      "- EUR 12.50",
      "- USD 5,675",
    ]);
    await expect(page.getByText("CHF 700")).toHaveCount(0); // unpublished
    await expect(rows(page).nth(5)).toContainText("Not qualified yet");
    // Screen readers hear the kind, not a dash.
    await expect(rows(page).nth(8)).toContainText("Expense");

    // The header: back, title, share — no currency switch, chart link or ⋮.
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Back" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Share" })).toBeVisible();
    await expect(header.getByRole("button", { name: /^Currency/ })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Treasury" })).toHaveCount(0);
    await expect(header.getByRole("button", { name: "Page actions" })).toHaveCount(0);
    // No search, sort or filter controls.
    for (const name of [/^Sort:/, /^Filter the history/, "Search the history"]) await expect(page.getByRole("button", { name })).toHaveCount(0);

    // Stats in the stats currency setting (USD); Balance and Sustainability wait for Wise.
    await expect(page.locator("[data-stat-label]")).toHaveText(["Med. donation", "Expenses"]);
    await expect(page.locator("[data-stat-value]")).toHaveText(["$6.4", "5.8K"]);
    await page.getByRole("button", { name: /Expenses$/ }).filter({ has: page.locator("[data-stat-value]") }).click();
    const sheet = page.getByRole("dialog", { name: "Expenses" });
    await expect(sheet.getByText("USD 5,775", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Total expenses in USD")).toBeVisible();
    await page.keyboard.press("Escape");
    await axe(page);
    await noHorizontalScroll(page);

    // Toolbar parameters in a URL are ignored while the toolbar is off.
    await page.goto("/treasury?currency=EUR&sort=amount_asc&q=hosting&from=2026-01-01");
    await expect.poll(() => amountsShown(page)).toHaveLength(9);
    await expect(page.locator("[data-stat-value]").first()).toHaveText("$6.4");
  });

  test("the pills show expenses or donations (refunds and disputes count as donations), and back to all; Back leaves the page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Treasury" }).first().click();
    await expect(page).toHaveURL("/treasury");
    const expenses = page.getByRole("button", { name: "Expenses", exact: true });
    const donations = page.getByRole("button", { name: "Donations", exact: true });
    await expenses.click();
    await expect(page).toHaveURL("/treasury?type=expense");
    await expect(expenses).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => amountsShown(page)).toEqual(["- USD 50", "- USD 50", "- EUR 12.50", "- USD 5,675"]);
    await donations.click();
    await expect(page).toHaveURL("/treasury?type=donation");
    await expect.poll(() => amountsShown(page)).toHaveLength(5);
    // A pill replaces the URL (client feedback 2026-10-19): Back returns to the previous page, not the previous pill.
    await page.locator("header").getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL("/");
    await page.goForward();
    await expect(page).toHaveURL("/treasury?type=donation");
    await donations.click();
    await expect(page).toHaveURL("/treasury");
    await expect.poll(() => amountsShown(page)).toHaveLength(9);
  });

  test("the 'Cry for donation' banner explains sustainability, links to Donate and can be dismissed for the visit", async ({ page }) => {
    await page.goto("/treasury");
    const banner = page.getByRole("region", { name: "Cry for donation" });
    await expect(banner).toContainText("The sustainability of the experiment is currently low, please consider donating to help the platform run.");
    await expect(banner.getByRole("link", { name: "donating" })).toHaveAttribute("href", "/donate");
    await banner.getByRole("button", { name: "sustainability" }).click();
    await expect(page.getByRole("dialog", { name: "Sustainability" }).getByText("How it is calculated")).toBeVisible();
    await page.keyboard.press("Escape");
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Cry for donation" })).toHaveCount(0);
  });

  test("tags: as many as fit, +N for the rest, recomputed on resize; one line per row", async ({ page }) => {
    // The fixture with five expense types (7th row); screen readers hear all five, whatever fits.
    const row = rows(page).nth(6);
    const chips = row.locator(":scope > div > span[aria-hidden=true]").filter({ visible: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/treasury");
    await expect(row).toHaveAccessibleName(/Software and subscriptions, Hosting and infrastructure, Development and engineering, Design and product, Research and consulting/);
    const wide = await chips.count();
    await page.setViewportSize({ width: 320, height: 700 });
    await expect(row.locator("[data-more-tags]")).toBeVisible();
    await expect(row).toHaveAccessibleName(/Research and consulting/);
    const narrow = await chips.count();
    expect(narrow).toBeLessThanOrEqual(wide);
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(41);
  });

  test("no horizontal scroll from 320px to desktop", async ({ page }) => {
    for (const width of [320, 375, 412, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/treasury");
      await noHorizontalScroll(page);
    }
  });
});

test.describe("Treasury entries", () => {
  test("expense page (p22–p23): time, all tags, amount, description, the menu's sentence", async ({ page }) => {
    await page.goto("/treasury");
    await page.getByRole("link", { name: /USD 5,675/ }).click();
    await expect(page).toHaveURL(/\/treasury\/expense\/\d+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Expense" })).toBeVisible();
    await expect(page.getByText("Paid Apr 6 2:07 PM")).toBeVisible();
    // p22: the chart glyph before ⋮, to the same place as on Donate.
    await expect(page.locator("header").getByRole("link", { name: "Treasury" })).toHaveAttribute("href", "/treasury");
    for (const tag of ["Development and engineering", "Design and product", "Research and consulting", "General operations"]) await expect(page.getByText(tag)).toBeVisible();
    await expect(page.getByText("USD 5,675", { exact: true })).toBeVisible();
    await expect(page.getByText("Development of the contribution flow")).toBeVisible();
    // Recipient names are off by default.
    await expect(page.getByText(/^Paid to/)).toHaveCount(0);
    await axe(page);
    await page.getByRole("button", { name: "Page actions" }).click();
    await expect(page.getByRole("dialog")).toContainText("This expense of five thousand six hundred seventy-five American dollars was made on April 6 at 2:07 PM.");
  });

  test("an unqualified expense shows 'Not qualified yet' and no description", async ({ page }) => {
    await page.goto("/treasury?type=expense");
    await page.getByRole("link", { name: /Not qualified yet/ }).click();
    await expect(page).toHaveURL(/\/treasury\/expense\/\d+$/, { timeout: 15_000 });
    await expect(page.getByText("Not qualified yet")).toBeVisible();
    await expect(page.getByText("USD 50", { exact: true })).toBeVisible();
  });

  test("anonymous donation page (p26–p27): no donor, the two explanations, the menu's sentence", async ({ page }) => {
    await page.goto("/treasury");
    await page.getByRole("link", { name: /USD 6\.40/ }).click();
    await expect(page).toHaveURL(/\/treasury\/donation\/\d+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Donation" })).toBeVisible();
    await expect(page.getByText("Donated Oct 15 2:07 PM")).toBeVisible();
    await expect(page.getByText("USD 6.40", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why donations matter" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it is spent" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Read more" })).toHaveAttribute("href", "/documentation");
    await axe(page);
    await page.getByRole("button", { name: "Page actions" }).click();
    await expect(page.getByRole("dialog")).toContainText("This anonymous donation of six American dollars and forty cents was made on October 15, 2026.");
  });

  test("an entry that isn't public, a wrong kind or a malformed number is a 404", async ({ page }) => {
    // The fixtures' unpublished CHF expense is the last entry written.
    const expenses = await (await page.request.get("/api/treasury/entries?type=expense&sort=date_asc")).json();
    const numbers = expenses.items.map((entry: { number: number }) => entry.number);
    const unpublished = Math.max(...numbers) + 1;
    for (const path of [`/treasury/expense/${unpublished}`, `/treasury/donation/${numbers[0]}`, "/treasury/expense/abc", "/treasury/expense/0"]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });
});
