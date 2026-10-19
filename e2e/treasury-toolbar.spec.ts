import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setSetting } from "./testSettings";

/**
 * The public Treasury's search, sort, filter and currency controls (Common
 * pages p12–p17), kept behind the treasury.public_toolbar setting since
 * 2026-10-19 (off by default). Their own project, after every other suite
 * (playwright.config.ts): it switches the setting on in the shared test
 * database and off again, and refreshes the website's Treasury cache.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the API isn't running.");
test.use({ viewport: { width: 412, height: 900 } });
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await setSetting(request, "treasury.public_toolbar", true);
});
test.afterAll(async ({ request }) => {
  await setSetting(request, "treasury.public_toolbar", null);
});

const rows = (page: Page) => page.locator("main ul li a");
const amountsShown = (page: Page) => rows(page).locator("[data-amount]").allInnerTexts();

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("Treasury toolbar (treasury.public_toolbar on)", () => {
  test("with the toolbar on, the header has the currency switch, chart link and ⋮, and the history is the chosen currency (USD)", async ({ page }) => {
    await page.goto("/treasury");
    await expect(page.getByRole("heading", { level: 2, name: /History/ })).toContainText("8");
    await expect(page.getByText("EUR 12.50")).toHaveCount(0);
    await expect(page.locator("header").getByRole("button", { name: /^Currency: USD/ })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Treasury" })).toHaveAttribute("href", "/treasury");
    await axe(page);
  });

  test("sort by amount (largest first, then smallest first) and back to date", async ({ page }) => {
    await page.goto("/treasury");
    await page.getByRole("button", { name: /^Sort: Date, Latest first/ }).click();
    const sheet = page.getByRole("dialog", { name: "Sort by" });
    await expect(sheet.getByRole("button", { name: /Date/ })).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("button", { name: "Amount" }).click();
    await expect(page).toHaveURL("/treasury?sort=amount_desc");
    await expect.poll(async () => (await amountsShown(page))[0]).toBe("- USD 5,675");
    await expect(page.getByRole("button", { name: /^Sort: Amount, Largest first/ })).toBeVisible();

    await page.getByRole("button", { name: /^Sort: Amount/ }).click();
    await page.getByRole("dialog", { name: "Sort by" }).getByRole("button", { name: /Amount/ }).click();
    await expect(page).toHaveURL("/treasury?sort=amount_asc");
    await expect.poll(async () => (await amountsShown(page))[0]).toBe("+ USD 2");
  });

  test("the filter sheet offers only filters with data, applies them, counts them and erases them", async ({ page }) => {
    await page.goto("/treasury");
    await page.getByRole("button", { name: "Filter the history" }).click();
    let sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet.getByRole("button", { name: "Erase filters" })).toBeVisible();
    // Location, Expertise and Amount aren't Treasury data.
    for (const row of ["Date", "Currency", "Expense type"]) await expect(sheet.getByRole("button", { name: new RegExp(`^${row}`) })).toBeVisible();
    for (const row of ["Location", "Expertise", "Amount"]) await expect(sheet.getByRole("button", { name: new RegExp(`^${row}`) })).toHaveCount(0);
    await axe(page);

    // Currency: the same choice as the header switch (one of the currencies with data, or all of them).
    await expect(sheet.getByRole("button", { name: /^Currency/ })).toContainText("Dollar");
    await sheet.getByRole("button", { name: /^Currency/ }).click();
    sheet = page.getByRole("dialog", { name: "Filter currencies" });
    await expect(sheet.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(sheet.getByRole("radio")).toHaveCount(3); // All currencies, Dollar, Euro — no public CHF entry
    await sheet.getByRole("radio", { name: "Euro" }).check();
    await sheet.getByRole("button", { name: "Apply filter" }).click();
    await expect(page).toHaveURL("/treasury?currency=EUR");
    await expect(page.getByRole("button", { name: /^Currency: EUR/ })).toHaveText("EUR");
    await expect.poll(() => amountsShown(page)).toEqual(["- EUR 12.50"]);
    sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet.getByRole("button", { name: /^Currency/ })).toContainText("Euro");

    // Expense type on top.
    await sheet.getByRole("button", { name: /^Expense type/ }).click();
    await page.getByRole("dialog", { name: "Filter expense types" }).getByText("Development and engineering").click();
    await page.getByRole("dialog", { name: "Filter expense types" }).getByRole("button", { name: "Apply filter" }).click();
    await expect.poll(() => amountsShown(page)).toEqual([]);
    await expect(page.getByText("No entries match these filters.")).toBeVisible();

    // Erase (the currency stays: it's the header's), then a date range in all currencies: September only.
    await page.getByRole("dialog", { name: "Filter" }).getByRole("button", { name: "Erase filters" }).click();
    await expect(page).toHaveURL("/treasury?currency=EUR");
    await page.goto("/treasury?currency=all");
    await page.getByRole("button", { name: "Filter the history" }).click();
    await page.getByRole("dialog", { name: "Filter" }).getByRole("button", { name: /^Date/ }).click();
    sheet = page.getByRole("dialog", { name: "Filter dates" });
    for (const preset of ["This week", "This month", "Last 6 months", "This year", "All"]) await expect(sheet.getByRole("button", { name: preset })).toBeVisible();
    await sheet.getByLabel("From").fill("2026-09-01");
    await sheet.getByLabel("To").fill("2026-09-30");
    await sheet.getByRole("button", { name: "Apply filter" }).click();
    await expect(page).toHaveURL("/treasury?currency=all&from=2026-09-01&to=2026-09-30");
    await expect.poll(() => amountsShown(page)).toEqual(["- EUR 12.50"]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Filter the history, 1 active" })).toHaveText("Filter (1)");

    // Donations unchecked leaves expenses; the last one checked can't be unchecked.
    await page.goto("/treasury");
    await page.getByRole("button", { name: "Filter the history" }).click();
    sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByText("Donations", { exact: true }).click();
    await expect(page).toHaveURL("/treasury?type=expense");
    await expect(sheet.getByRole("checkbox", { name: "Expenses" })).toBeDisabled();
  });

  test("the currency switch changes the stats and the history; 'All currencies' lists every one, never converted", async ({ page }) => {
    await page.goto("/treasury");
    await page.getByRole("button", { name: /^Currency: USD/ }).click();
    await page.getByRole("dialog", { name: "Choose a currency" }).getByRole("button", { name: "Euro (EUR)" }).click();
    await expect(page).toHaveURL("/treasury?currency=EUR");
    await expect(page.getByRole("button", { name: /^Currency: EUR/ })).toHaveText("EUR");
    await expect(page.locator("[data-stat-value]")).toHaveText(["–", "12.5"]);
    await expect.poll(() => amountsShown(page)).toEqual(["- EUR 12.50"]);
    await expect(page.getByRole("heading", { level: 2, name: /History/ })).toContainText("1");

    await page.getByRole("button", { name: /^Currency: EUR/ }).click();
    await page.getByRole("dialog", { name: "Choose a currency" }).getByRole("button", { name: "All currencies" }).click();
    await expect(page).toHaveURL("/treasury?currency=all");
    await expect(page.getByRole("button", { name: /^Currency: All/ })).toHaveText("All");
    // The stats stay in the default currency (amounts are never added across currencies).
    await expect(page.locator("[data-stat-value]")).toHaveText(["$6.4", "5.8K"]);
    await expect.poll(() => amountsShown(page)).toHaveLength(9);
    await expect(page.getByText("- EUR 12.50")).toBeVisible();
    // Kept in the URL: a reload shows the same view.
    await page.reload();
    await expect(page.getByRole("button", { name: /^Currency: All/ })).toBeVisible();
    await expect.poll(() => amountsShown(page)).toHaveLength(9);
  });

  test("the search button (p11) opens a field: public text and entry numbers, in the URL; × closes it", async ({ page }) => {
    await page.goto("/treasury");
    await page.getByRole("button", { name: "Search the history" }).click();
    const field = page.getByRole("searchbox", { name: "Search descriptions, expense types and entry numbers" });
    await expect(field).toBeFocused();
    await field.fill("contribution flow");
    await expect(page).toHaveURL(/\/treasury\?q=contribution\+flow$/);
    await expect.poll(() => amountsShown(page)).toEqual(["- USD 5,675"]);
    await axe(page);

    // An expense type's label matches too; a search with no result says so and can be erased.
    await field.fill("General operations");
    await expect.poll(() => amountsShown(page)).toEqual(["- USD 5,675"]);
    await field.fill("nothing like this");
    await expect(page.getByText("No entries match “nothing like this”.")).toBeVisible();

    // A reload keeps the search; × clears it and brings Sort and Filter back.
    await page.reload();
    await expect(field).toHaveValue("nothing like this");
    await page.getByRole("button", { name: "Close the search" }).click();
    await expect(page).toHaveURL(/\/treasury$/);
    await expect(page.getByRole("button", { name: /^Sort:/ })).toBeVisible();
    await expect.poll(() => amountsShown(page)).toHaveLength(8);
  });
});
