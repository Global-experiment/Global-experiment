import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setSetting } from "./testSettings";

/**
 * One-off card donations paid on the donate page (decided 2026-10-19,
 * donations.checkout = embedded): Stripe's card fields in a sheet, no email,
 * then the thank-you page with a reference instead of an email receipt.
 * Stripe.js is stubbed (the browser never reaches Stripe): the stub mounts
 * placeholder card fields and answers confirmPayment as the test asks. The
 * API runs its Stripe fixture (pi_e2e… payments). Also PayPal on
 * Monthly behind donations.paypal_monthly. Serial, in the settings project.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the API isn't running.");
test.use({ viewport: { width: 412, height: 900 } });
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await setSetting(request, "donations.checkout", "embedded");
});
test.afterAll(async ({ request }) => {
  for (const key of ["donations.checkout", "donations.monthly", "donations.extra_methods", "donations.paypal_monthly"]) await setSetting(request, key, null);
});

const amounts = (page: Page) => page.getByRole("group", { name: "Amount" });
const methods = (page: Page) => page.getByRole("group", { name: "Payment method" });

/**
 * A stand-in for https://js.stripe.com: window.Stripe with elements() and
 * confirmPayment(). Anything else react-stripe-js asks for is a no-op.
 * `window.__stripeOutcome` (set per test) picks the confirmPayment result.
 */
const STRIPE_STUB = `
(() => {
  const noop = () => undefined;
  // Unknown members are no-ops, except "then" (the object would look like a promise) and symbols.
  const tolerant = (target) => new Proxy(target, { get: (object, key) => (key in object ? object[key] : key === "then" || typeof key === "symbol" ? undefined : noop) });
  window.Stripe = function Stripe(key) {
    window.__stripeCalls = (window.__stripeCalls || 0) + 1;
    window.__stripeKey = key;
    return tolerant({
      _registerWrapper: noop,
      registerAppInfo: noop,
      elements(options) {
        window.__stripeElementsOptions = { clientSecret: options && options.clientSecret };
        return tolerant({
          create(type, elementOptions) {
            window.__stripeElementType = type;
            window.__stripeElementOptions = elementOptions;
            const handlers = {};
            return tolerant({
              mount(node) {
                const target = typeof node === "string" ? document.querySelector(node) : node;
                target.innerHTML = '<div data-stub-card-fields>Card number · MM / YY · CVC</div>';
                setTimeout(() => handlers.ready && handlers.ready({ elementType: type }), 0);
              },
              on(event, handler) { handlers[event] = handler; },
              off: noop, update: noop, destroy: noop, unmount: noop, focus: noop, blur: noop, clear: noop,
            });
          },
          getElement: () => null,
          update: noop,
          submit: async () => ({}),
          fetchUpdates: async () => ({}),
        });
      },
      async confirmPayment(params) {
        window.__stripeConfirm = { redirect: params.redirect, returnUrl: params.confirmParams && params.confirmParams.return_url };
        if (window.__stripeOutcome === "decline") return { error: { type: "card_error", message: "Your card was declined." } };
        return { paymentIntent: { id: "pi_e2esucceeded000000001", status: "succeeded" } };
      },
    });
  };
  window.Stripe.version = "endive";
})();`;

async function stubStripeJs(page: Page, outcome: "succeed" | "decline" = "succeed") {
  await page.addInitScript((value) => {
    (window as unknown as { __stripeOutcome: string }).__stripeOutcome = value;
  }, outcome);
  await page.route("https://js.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: STRIPE_STUB }));
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("a one-off card donation is paid in a sheet on the page (card fields only, no email), then thanked with a reference", async ({ page }) => {
  await stubStripeJs(page);
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/donations/payment-intent", async (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue();
  });
  await page.goto("/donate");
  await amounts(page).getByRole("button", { name: "$20" }).click();
  await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();

  const sheet = page.getByRole("dialog", { name: "Card payment" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("One-off donation of $20. Your card details go straight to Stripe; no email address is needed.");
  await expect(sheet.locator("[data-stub-card-fields]")).toBeVisible();
  expect(body).toMatchObject({ amount: "20", currency: "USD" });
  expect(body).not.toHaveProperty("frequency");
  // Card fields only: Stripe.js got the publishable key, the PaymentIntent's secret, and no email/wallet fields.
  const stripe = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return { key: w.__stripeKey, elements: w.__stripeElementsOptions, type: w.__stripeElementType, options: w.__stripeElementOptions };
  });
  expect(stripe).toMatchObject({
    key: "pk_test_e2estubkeynotarealstripekey",
    elements: { clientSecret: expect.stringMatching(/^pi_e2ecreated\d+_secret_e2eUSD2000$/) },
    type: "payment",
    options: { fields: { billingDetails: { email: "never", phone: "never", name: "never" } }, wallets: { applePay: "never", googlePay: "never" } },
  });
  await axe(page);

  await sheet.getByRole("button", { name: "Donate $20" }).click();
  await expect(page).toHaveURL(/\/donate\/thank-you\?currency=USD&amount=20&frequency=once&payment_intent=pi_e2esucceeded000000001$/);
  await expect(page.getByRole("heading", { name: "Your reference" })).toBeVisible();
  await expect(page.locator("[data-donation-reference]")).toContainText("GE-00000001");
  await expect(page.locator("[data-donation-reference]")).toContainText("No email receipt is sent");
  await expect(page.locator("[data-toast]")).toHaveText("Donation sent");
});

test("a declined card says so in the sheet and charges nothing; the donor can try again", async ({ page }) => {
  await stubStripeJs(page, "decline");
  await page.goto("/donate?currency=EUR");
  await amounts(page).getByRole("button", { name: "€10" }).click();
  await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
  const sheet = page.getByRole("dialog", { name: "Card payment" });
  await sheet.getByRole("button", { name: "Donate €10" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Your card was declined.");
  await expect(sheet.getByRole("button", { name: "Donate €10" })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { __stripeConfirm: { redirect: string } }).__stripeConfirm.redirect)).toBe("if_required");
  await expect(page).toHaveURL(/\/donate/);
});

test("an unfinished or failed embedded payment goes back to Donate with the same choice; a processing one is thanked", async ({ page }) => {
  await page.goto("/donate/thank-you?currency=USD&amount=20&frequency=once&payment_intent=pi_e2efailed000000000001");
  await expect(page).toHaveURL(/\/donate\?currency=USD&amount=20/);
  await page.goto("/donate/thank-you?currency=USD&amount=20&frequency=once&payment_intent=pi_unknownpayment000000");
  await expect(page).toHaveURL(/\/donate\?currency=USD&amount=20/);
  await page.goto("/donate/thank-you?currency=USD&amount=20&frequency=once&payment_intent=pi_e2eprocessing00000001");
  await expect(page.getByRole("heading", { name: "Your reference" })).toBeVisible();
});

test("Monthly keeps hosted Checkout for cards; PayPal shows on Monthly only behind donations.paypal_monthly", async ({ page, request }) => {
  await setSetting(request, "donations.monthly", true);
  await setSetting(request, "donations.extra_methods", true);
  await page.goto("/donate?currency=EUR");
  await page.getByRole("button", { name: "Monthly", exact: true }).click();
  await expect(methods(page).getByRole("button", { name: "PayPal" })).toHaveCount(0);
  await setSetting(request, "donations.paypal_monthly", true);
  await page.goto("/donate?currency=EUR&frequency=monthly");
  await expect(methods(page).getByRole("button", { name: "PayPal" })).toBeVisible();
  // A monthly card donation still opens Stripe Checkout (Stripe needs an email for subscriptions).
  let checkoutCalled = false;
  await page.route("**/api/donations/checkout", async (route) => {
    checkoutCalled = true;
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "provider_unavailable", message: "x" } }) });
  });
  await amounts(page).getByRole("button", { name: "€10" }).click();
  await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
  await expect.poll(() => checkoutCalled).toBe(true);
  await expect(page.getByRole("dialog", { name: "Card payment" })).toHaveCount(0);
});
