import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Donate and Thank you through the real stack (Next → NestJS → PostgreSQL 17
 * test database). The API runs with STRIPE_FIXTURE (scripted Checkout
 * sessions, NODE_ENV=test only) and test-only Treasury rows: five USD
 * donations (median $6.40), nothing in EUR or CHF. Donation settings are at
 * their defaults here — monthly and the extra methods off; donate-figma.spec
 * covers them switched on. The redirect to checkout.stripe.com is
 * intercepted: real Stripe is the manual test-mode run (docs/operations/stripe.md).
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the API isn't running.");
test.use({ viewport: { width: 412, height: 900 } });

const STRIPE = /^https:\/\/checkout\.stripe\.com\//;
const amounts = (page: Page) => page.getByRole("group", { name: "Amount" });
const methods = (page: Page) => page.getByRole("group", { name: "Payment method" });
const notice = (page: Page) => page.locator("[data-notice]");
/** The donate warning banner (Next's route announcer is a role=alert too). */
const warning = (page: Page) => page.locator("[data-notice=warning][role=alert]");

/** The header keeps only Share and ⋮ (client review 2026-10-21): the currency switch is the menu's first row. */
async function openMenu(page: Page) {
  await page.locator("[data-nav-header]").getByRole("button", { name: "Page actions" }).click();
  return page.getByRole("dialog", { name: "Page actions" });
}
async function expectCurrency(page: Page, currency: string) {
  const menu = await openMenu(page);
  await expect(menu.getByRole("button", { name: `Currency: ${currency}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

/** Stripe's hosted page, stubbed: the test only needs to see the browser get there. */
async function stubStripe(page: Page) {
  await page.route(STRIPE, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Stripe Checkout (stub)</title>" }));
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("Donate page", () => {
  test("default state: USD, real figures, presets, card and wallet rows, approved legal text", async ({ page }) => {
    const response = await page.goto("/donate");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Donate" })).toBeVisible();
    await expectCurrency(page, "USD");

    // Test-only fixtures: 2 + 5 + 6.40 + 10 + 50 = $73.40, median $6.40. Donors never shown; Monthly donors only with monthly on.
    await expect(page.getByRole("button", { name: /Donations/ })).toContainText("$ 73.4");
    await expect(page.getByRole("button", { name: /Med\. donation/ })).toContainText("$6.4");
    await expect(page.getByText("Donors", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Monthly donors")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Frequency" })).toHaveCount(0);

    await expect(amounts(page).getByRole("button")).toHaveText(["$2", "$5", "$10", "$20", "$50", "Other"]);
    for (const button of await amounts(page).getByRole("button").all()) await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(methods(page).getByRole("button")).toHaveText(["Secure payment via Stripe", "", ""]);
    await expect(methods(page).getByRole("button", { name: "Apple Pay" })).toBeVisible();
    await expect(methods(page).getByRole("button", { name: "Google Pay" })).toBeVisible();
    await expect(methods(page).getByRole("button", { name: "PayPal" })).toHaveCount(0);
    await expect(methods(page).getByRole("button", { name: "Direct debit SEPA" })).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
    await expect(page.getByText("The Global Experiment is a Swiss non-profit association")).toBeVisible();
    // Policy links stay hidden; the subscription link only appears with monthly donations.
    await expect(page.getByRole("link", { name: /Privacy Policy|refund policy|subscription-management/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "donations@globalexperiment.org" })).toHaveAttribute("href", "mailto:donations@globalexperiment.org");
    await expect(notice(page)).toHaveCount(0);
    await axe(page);
  });

  test("light theme: the wallet marks and row labels use the text colour (no white on white)", async ({ page }) => {
    await page.goto("/donate");
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    // Wait for the theme's colour transition to settle.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).color)).toBe("rgb(0, 0, 0)");
    const text = await page.evaluate(() => getComputedStyle(document.body).color);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(text).not.toBe(background);
    for (const name of ["Apple Pay", "Google Pay"]) {
      const mark = methods(page).getByRole("button", { name }).locator("svg").first();
      await expect.poll(() => mark.evaluate((svg) => getComputedStyle(svg).color), { message: name }).toBe(text);
    }
    expect(await methods(page).getByRole("button", { name: "Card payment via Stripe" }).evaluate((row) => getComputedStyle(row).color)).toBe(text);
  });

  test("the currency switch is kept in the URL and changes presets and figures", async ({ page }) => {
    await page.goto("/donate");
    await (await openMenu(page)).getByRole("button", { name: "Currency: USD" }).click();
    const sheet = page.getByRole("dialog", { name: "Choose a currency" });
    await expect(sheet.getByRole("button")).toHaveText(["Euro (EUR)", "US dollar (USD)", "Swiss franc (CHF)"]);
    await sheet.getByRole("button", { name: "Euro (EUR)" }).click();
    await expect(page).toHaveURL(/\/donate\?currency=EUR$/);
    await expect(amounts(page).getByRole("button")).toHaveText(["€2", "€5", "€10", "€20", "€50", "Other"]);
    // Nothing donated in EUR yet: the empty state.
    await expect(page.getByRole("button", { name: /Donations/ })).toContainText("€ 0");
    await expect(page.getByRole("button", { name: /Med\. donation/ })).toContainText("–");

    await page.reload();
    await expectCurrency(page, "EUR");
    await expect(amounts(page).getByRole("button").first()).toHaveText("€2");

    await page.goto("/donate?currency=chf");
    await expect(amounts(page).getByRole("button").first()).toHaveText("CHF 2");
  });

  test("a payment row without an amount shows the 'Select an amount' warning (p31), dismissible", async ({ page }) => {
    await page.goto("/donate");
    await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
    const banner = warning(page);
    await expect(banner).toContainText("Select an amount");
    await expect(banner).toContainText("Please select an amount");
    await axe(page);
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toHaveCount(0);

    // Choosing an amount clears it too.
    await methods(page).getByRole("button", { name: "Google Pay" }).click();
    await expect(warning(page)).toBeVisible();
    await amounts(page).getByRole("button", { name: "$5", exact: true }).click();
    await expect(warning(page)).toHaveCount(0);
    await expect(amounts(page).getByRole("button", { name: "$5", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/currency=USD&amount=5$/);
  });

  test("Other: numeric input only, Validate checks 1 to 10,000, then shows the amount", async ({ page }) => {
    await page.goto("/donate");
    await amounts(page).getByRole("button", { name: "Other" }).click();
    const input = page.getByLabel("Other amount");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveAttribute("inputmode", "decimal");
    await expect(input).toHaveAttribute("autocomplete", "off");
    const validate = page.getByRole("button", { name: "Validate" });
    await expect(validate).toBeVisible();

    await input.pressSequentially("0.5abc");
    await expect(input).toHaveValue("0.5");
    await validate.click();
    await expect(warning(page)).toContainText("The minimum donation is $1.");
    await expect(input).toBeFocused();

    await input.fill("10000.01");
    await input.press("Enter");
    await expect(warning(page)).toContainText("The maximum donation is $10,000.");

    await input.fill("12,50");
    await validate.click();
    await expect(warning(page)).toHaveCount(0);
    await expect(validate).toHaveCount(0);
    const chosen = amounts(page).getByRole("button", { name: "Other amount: $12.50" });
    await expect(chosen).toHaveText("$12.50");
    await expect(chosen).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/amount=12\.50/);
  });

  test("a payment row opens Stripe Checkout: loading state, then the redirect", async ({ page }) => {
    await stubStripe(page);
    let body: Record<string, unknown> | null = null;
    // Hold the API answer a moment so the loading state can be seen.
    await page.route("**/api/donations/checkout", async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.goto("/donate?currency=CHF");
    await amounts(page).getByRole("button", { name: "CHF 20" }).click();
    await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();

    await expect(methods(page).getByRole("button", { name: /Redirecting to Stripe/ })).toBeVisible();
    await expect(methods(page)).toHaveAttribute("aria-busy", "true");
    await expect(methods(page).getByRole("button", { name: "Apple Pay" })).toBeDisabled();
    await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_e2ecreated\d+\?mode=payment&currency=CHF&amount=2000&methods=card$/);
    expect(body).toMatchObject({ amount: "20", currency: "CHF", frequency: "once", method: "card" });
    expect(String(body!.attemptId)).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("Stripe's cancel link returns with the same currency and amount", async ({ page }) => {
    // What Stripe redirects to (built by the API from the choice).
    await page.goto("/donate?currency=EUR&amount=12.50&frequency=once&canceled=1");
    await expectCurrency(page, "EUR");
    await expect(amounts(page).getByRole("button", { name: "Other amount: €12.50" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: "Donation canceled" })).toContainText("No payment was made");
    // The one-time flag leaves the address bar; the choice stays.
    await expect(page).toHaveURL(/\/donate\?currency=EUR&amount=12\.50$/);

    await page.goto("/donate?currency=USD&amount=10&canceled=1");
    await expect(amounts(page).getByRole("button", { name: "$10" })).toHaveAttribute("aria-pressed", "true");
  });

  test("errors: Stripe unavailable and too many attempts, nothing charged", async ({ page }) => {
    await page.goto("/donate");
    await amounts(page).getByRole("button", { name: "$10" }).click();

    await page.route("**/api/donations/checkout", (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "provider_unavailable", message: "Stripe is temporarily unavailable." } }) }),
    );
    await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
    await expect(warning(page)).toContainText("Stripe is unavailable");
    await expect(warning(page)).toContainText("Nothing was charged");
    // Ready again: the rows are enabled.
    await expect(methods(page).getByRole("button", { name: "Card payment via Stripe" })).toBeEnabled();
    await axe(page);

    await page.unroute("**/api/donations/checkout");
    await page.route("**/api/donations/checkout", (route) =>
      route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "Too many requests." } }) }),
    );
    await methods(page).getByRole("button", { name: "Apple Pay" }).click();
    await expect(warning(page)).toContainText("Too many attempts");

    await page.unroute("**/api/donations/checkout");
    await page.route("**/api/donations/checkout", (route) => route.abort("internetdisconnected"));
    await methods(page).getByRole("button", { name: "Google Pay" }).click();
    await expect(warning(page)).toContainText("Stripe is unavailable");
  });

  test("the API refuses a validation the page let through, and the page says why", async ({ page }) => {
    await page.goto("/donate");
    await amounts(page).getByRole("button", { name: "$10" }).click();
    await page.route("**/api/donations/checkout", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "validation_failed", message: "The request is invalid.", details: { issues: [{ path: "method", message: "This payment method is not available for this currency right now." }] } } }),
      }),
    );
    await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
    await expect(warning(page)).toContainText("Payment method unavailable");
    await expect(warning(page)).toContainText("not available for this currency right now");
  });

  test("keyboard: every control is reachable, operable and visibly focused", async ({ page }) => {
    await stubStripe(page);
    await page.goto("/donate");
    const five = amounts(page).getByRole("button", { name: "$5", exact: true });
    await five.focus();
    await expect(five).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(five).toHaveAttribute("aria-pressed", "true");

    // Tab order: amounts → Other → payment rows.
    await page.keyboard.press("Tab"); // $10
    await page.keyboard.press("Tab"); // $20
    await page.keyboard.press("Tab"); // $50
    await page.keyboard.press("Tab"); // Other
    await expect(amounts(page).getByRole("button", { name: "Other" })).toBeFocused();
    await page.keyboard.press("Tab");
    const card = methods(page).getByRole("button", { name: "Card payment via Stripe" });
    await expect(card).toBeFocused();
    await expect(card).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(STRIPE);
  });
});

test.describe("Thank you page", () => {
  test("a completed donation shows the page and the 'Donation sent' toast (p33)", async ({ page }) => {
    const response = await page.goto("/donate/thank-you?currency=USD&amount=10&frequency=once&session_id=cs_test_e2ecompletepaid0001");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Donate" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Treasury update" })).toBeVisible();
    await expect(page.getByText("as soon as Stripe confirms the payment")).toBeVisible();
    await expect(page.getByRole("link", { name: "treasury page" })).toHaveAttribute("href", "/treasury");
    await expect(page.getByRole("heading", { name: "How it is spent" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Donation sent" })).toBeVisible();
    // No back arrow on this page (p33).
    await expect(page.getByRole("link", { name: /back/i })).toHaveCount(0);
    await axe(page);

    // The toast goes away by itself.
    await expect(page.locator("[data-toast]")).toHaveCount(0, { timeout: 8000 });

    // p34: the actions only.
    await page.getByRole("button", { name: "Page actions" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link").or(sheet.getByRole("button"))).toHaveText(["Donate", "Send feedback", "Report issue", "Documentation", "Treasury"]);
  });

  test("a delayed payment (SEPA) is thanked without promising it's already on the treasury", async ({ page }) => {
    await page.goto("/donate/thank-you?currency=EUR&amount=10&session_id=cs_test_e2ecompletepending01");
    await expect(page.getByText("once the payment has cleared")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Donation sent" })).toBeVisible();
  });

  test("an unfinished, unknown or missing session goes back to Donate with the same choice", async ({ page }) => {
    await page.goto("/donate/thank-you?currency=CHF&amount=20&frequency=once&session_id=cs_test_e2eopensession00001");
    await expect(page).toHaveURL(/\/donate\?currency=CHF&amount=20$/);
    await page.goto("/donate/thank-you?currency=EUR&amount=5&session_id=cs_test_doesnotexist00000");
    await expect(page).toHaveURL(/\/donate\?currency=EUR&amount=5$/);
    await page.goto("/donate/thank-you");
    await expect(page).toHaveURL(/\/donate$/);
    await page.goto("/donate/thank-you?session_id=<script>");
    await expect(page).toHaveURL(/\/donate$/);
  });
});
