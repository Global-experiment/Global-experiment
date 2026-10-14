import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DONATIONS_PREVIEW } from "./donations-preview";

/**
 * Donate and Thank you against Common pages.pdf p28–p34 (412px-wide phone
 * frames; the browser chrome takes the top 104px, so the page is 412×900),
 * through the real stack with the test-only fixtures (see donate.spec.ts).
 *
 * Figma draws every option on: Once/Monthly, PayPal and SEPA. This spec turns
 * the `donations.monthly` and `donations.extra_methods` settings on in the
 * *_test database (rows removed afterwards), which also covers the flags.
 * Decided differences from the frames: Donors is never shown (anonymous
 * donations), SEPA only in EUR, PayPal one-off only, no bottom navigation bar
 * in the app (so the toast sits 24px from the bottom).
 *
 * Captures go to test-results/figma-donate/; with FIGMA_COMMON_DIR set (PNG
 * renders of Common pages.pdf at 72 dpi, cp-NN.png), side-by-side
 * comparisons are written too. Runs after the other suites (playwright.config.ts).
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the API isn't running.");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 412, height: 900 } });

const SHOTS = "test-results/figma-donate";
const CHROME = 104;
mkdirSync(SHOTS, { recursive: true });

const box = async (locator: Locator) => {
  const value = await locator.boundingBox();
  if (!value) throw new Error("element not rendered");
  return value;
};
const near = (actual: number, expected: number, label: string, tolerance = 1) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} ≈ ${expected}`).toBeLessThanOrEqual(tolerance);
/** Figma y (page incl. browser chrome) → page y. */
const fy = (figmaY: number) => figmaY - CHROME;

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgres://unused@127.0.0.1:1/unused", { max: 1, onnotice: () => {} });
async function setFlags(flags: { monthly: boolean; extraMethods: boolean }) {
  await sql`delete from settings where key in ('donations.monthly', 'donations.extra_methods')`;
  await sql`insert into settings (key, value) values ('donations.monthly', ${sql.json(flags.monthly)}), ('donations.extra_methods', ${sql.json(flags.extraMethods)})`;
}
test.beforeAll(async () => {
  await setFlags({ monthly: true, extraMethods: true });
});
test.afterAll(async () => {
  await sql`delete from settings where key in ('donations.monthly', 'donations.extra_methods', 'donations.enabled')`;
  await sql.end({ timeout: 5 });
});

const capture = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const amounts = (page: Page) => page.getByRole("group", { name: "Amount" });
const methods = (page: Page) => page.getByRole("group", { name: "Payment method" });

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

test("p28 default: geometry of the header, segment, amounts and payment rows", async ({ page }) => {
  await page.goto("/donate");
  await expect(page.getByRole("group", { name: "Frequency" })).toBeVisible();
  await noHorizontalScroll(page);
  await capture(page, "p28-default-usd");

  // Stats with monthly on: Donations, Med. donation, Monthly donors (Donors hidden by decision).
  await expect(page.locator("[data-stat-label]")).toHaveText(["Donations", "Med. donation", "Monthly donors"]);
  await expect(page.getByRole("button", { name: /Monthly donors/ })).toContainText("1");

  // Header: USD ends 8px before the Treasury glyph (Common pages p28: text 326–355.6, glyph 365.33–378.67).
  const usd = await box(page.getByRole("button", { name: /^Currency: USD/ }));
  near(usd.x + usd.width - 8, 356, "USD text right edge");
  const treasury = await box(page.getByRole("link", { name: "Treasury" }).locator("svg"));
  near(treasury.x, 364, "Treasury glyph x");
  near(treasury.y, fy(116), "Treasury glyph y");

  // Segment 8–404 × 266–306; selected "Once".
  const once = await box(page.getByRole("button", { name: "Once", exact: true }));
  const monthly = await box(page.getByRole("button", { name: "Monthly", exact: true }));
  near(once.x, 8, "Once x");
  near(once.y, fy(266), "segment y");
  near(once.height, 40, "segment height");
  near(monthly.x + monthly.width, 404, "Monthly right");

  // Amounts: 3 columns 126.67 wide, 8px gaps; rows at 314 and 362.
  const presets = amounts(page).getByRole("button");
  const two = await box(presets.nth(0));
  const ten = await box(presets.nth(2));
  const twenty = await box(presets.nth(3));
  near(two.x, 8, "$2 x");
  near(two.y, fy(314), "$2 y");
  near(two.width, 126.67, "preset width");
  near(two.height, 40, "preset height");
  near(ten.x, 277.33, "$10 x");
  near(twenty.y, fy(362), "$20 y");

  // Payment rows from 410, 48px pitch, 396 wide; card marks from x=16, label at x=100.
  const rows = methods(page).getByRole("button");
  await expect(rows).toHaveCount(4); // card, Apple Pay, Google Pay, PayPal — SEPA is EUR only
  const card = await box(rows.nth(0));
  near(card.x, 8, "card row x");
  near(card.y, fy(410), "card row y");
  near(card.width, 396, "card row width");
  near(card.height, 40, "card row height");
  near((await box(rows.nth(1))).y, fy(458), "Apple Pay row y");
  const marks = rows.nth(0).locator("img");
  near((await box(marks.nth(0))).x, 16, "Visa x");
  near((await box(marks.nth(1))).x, 44, "Mastercard x");
  near((await box(marks.nth(2))).x, 72, "Amex x");
  near((await box(rows.nth(0).getByText("Secure payment via Stripe"))).x, 100, "card label x");
  near((await box(rows.nth(1).locator("img"))).x, 16, "Apple Pay mark x");
});

test("p28 in EUR: Direct debit SEPA appears with the bank glyph", async ({ page }) => {
  await page.goto("/donate?currency=EUR");
  const rows = methods(page).getByRole("button");
  await expect(rows).toHaveCount(5);
  const sepa = rows.nth(4);
  await expect(sepa).toHaveAccessibleName("Direct debit SEPA");
  near((await box(sepa)).y, fy(602), "SEPA row y");
  const glyph = await box(sepa.locator("svg[data-icon='account_balance']"));
  near(glyph.x, 16, "bank glyph x");
  near((await box(sepa.getByText("Direct debit SEPA"))).x, 40, "SEPA label x");
  // Rule 12px under the rows (654), "Details" 12px under it.
  near((await box(page.locator("hr").first())).y, fy(654), "rule y");
  await capture(page, "p28-default-eur");
});

test("p29 Other: the typed amount, outlined, with Validate at the bottom", async ({ page }) => {
  await page.goto("/donate");
  await amounts(page).getByRole("button", { name: "Other" }).click();
  await page.getByLabel("Other amount").fill("500");
  const input = await box(page.getByLabel("Other amount"));
  near(input.x, 277.33, "Other x");
  near(input.y, fy(362), "Other y");
  const validate = page.getByRole("button", { name: "Validate" });
  await expect(validate).toBeVisible();
  const bar = await box(validate);
  near(bar.x, 8, "Validate x");
  near(bar.width, 396, "Validate width");
  near(bar.height, 40, "Validate height");
  await capture(page, "p29-other");
});

test("p30 Monthly with $5 selected (PayPal is one-off only, so it leaves)", async ({ page }) => {
  await page.goto("/donate");
  await page.getByRole("button", { name: "Monthly", exact: true }).click();
  await amounts(page).getByRole("button", { name: "$5", exact: true }).click();
  await expect(page.getByRole("button", { name: "Monthly", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/currency=USD&frequency=monthly&amount=5|currency=USD&amount=5&frequency=monthly/);
  await expect(methods(page).getByRole("button", { name: "PayPal" })).toHaveCount(0);
  await expect(amounts(page).getByRole("button", { name: "$5", exact: true })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(amounts(page).getByRole("button", { name: "$5", exact: true })).toHaveCSS("color", "rgb(0, 0, 0)");
  // Monthly on: the customer portal link is offered when configured; not configured in the e2e API.
  await capture(page, "p30-monthly");

  // A monthly Checkout is a subscription.
  await page.route(/^https:\/\/checkout\.stripe\.com\//, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" }));
  await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com\/c\/pay\/cs_test_e2ecreated\d+\?mode=subscription&currency=USD&amount=500&methods=card/);
});

test("p31 'Select an amount': the banner's box, glyphs and the rows pushed down", async ({ page }) => {
  await page.goto("/donate");
  await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
  const banner = page.locator("[data-notice=warning][role=alert]");
  await expect(banner).toBeVisible();
  const frame = await box(banner);
  near(frame.x, 8, "banner x");
  near(frame.y, fy(410), "banner y");
  near(frame.width, 396, "banner width");
  near(frame.height, 52, "banner height");
  await expect(banner).toHaveCSS("background-color", "rgb(31, 31, 31)");
  const warning = await box(banner.locator("svg[data-icon='warning']"));
  near(warning.x, 16, "warning glyph x");
  near(warning.y, fy(418), "warning glyph y");
  const close = await box(banner.getByRole("button", { name: "Dismiss" }).locator("svg"));
  near(close.x, 380, "close glyph x");
  near(close.y, fy(418), "close glyph y");
  near((await box(methods(page).getByRole("button").first())).y, fy(470), "card row y under the banner");
  await capture(page, "p31-select-amount");
});

test("p32 the ⋮ sheet: update line, partners, five actions", async ({ page }) => {
  await page.goto("/donate");
  await page.getByRole("button", { name: "Page actions" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400); // slide-up
  // One paragraph, the two sentences on consecutive lines (p32).
  const lead = sheet.locator("p").first();
  await expect(lead).toHaveText(/^This page was updated on [A-Z][a-z]+ \d{1,2} at \d{1,2}:\d{2}(AM|PM)\.Stripe and Wise are the banking partners of the experiment\.$/);
  await expect(lead.locator("br")).toHaveCount(1);
  await expect(sheet.getByRole("link").or(sheet.getByRole("button"))).toHaveText(["Stripe", "Wise", "Donate", "Share page", "Send feedback", "Report issue", "Documentation"]);
  await sheet.screenshot({ path: join(SHOTS, "p32-menu.png") });
  await capture(page, "p32-menu-page");
});

test("p33/p34 thank you: sections, rule, toast; then its ⋮ sheet", async ({ page }) => {
  await page.goto("/donate/thank-you?currency=USD&amount=5&frequency=once&session_id=cs_test_e2ecompletepaid0001");
  const toast = page.locator("[data-toast]");
  await expect(toast).toHaveText("Donation sent");
  const pill = await box(toast);
  near(pill.height, 34, "toast height");
  await expect(toast).toHaveCSS("background-color", "rgb(31, 31, 31)");
  near(pill.x + pill.width / 2, 206, "toast centred");
  near((await box(page.locator("hr").first())).y, fy(272), "rule y");
  near((await box(page.getByRole("heading", { name: "Thank you" }))).y, fy(148), "Thank you y");
  near((await box(page.getByRole("heading", { name: "Treasury update" }))).y, fy(285), "Treasury update y");
  await capture(page, "p33-thank-you");

  await page.getByRole("button", { name: "Page actions" }).click();
  const sheet = page.getByRole("dialog");
  await page.waitForTimeout(400);
  await sheet.screenshot({ path: join(SHOTS, "p34-menu.png") });
});

test("responsive: no horizontal scroll from 320px to desktop; the column stays centred", async ({ page }) => {
  for (const width of [320, 360, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/donate?currency=EUR");
    await noHorizontalScroll(page);
    const rows = methods(page).getByRole("button");
    const card = await box(rows.first());
    expect(card.width, `card row at ${width}`).toBeGreaterThan(200);
    await capture(page, `responsive-${width}`);
  }
});

test("closed: 'Donations open soon', no payment rows; the private preview link opens Checkout", async ({ page }) => {
  await sql`insert into settings (key, value) values ('donations.enabled', ${sql.json(false)}) on conflict (key) do update set value = excluded.value`;
  try {
    await page.goto("/donate?currency=EUR");
    const soon = page.locator("[data-notice=info][role=status]");
    await expect(soon).toContainText("Donations open soon");
    await expect(methods(page).getByRole("button")).toHaveCount(0);
    // The figures and amounts stay visible.
    await expect(amounts(page).getByRole("button").first()).toHaveText("€2");
    await capture(page, "closed-open-soon");

    // A wrong token changes nothing.
    await page.goto("/donate?currency=EUR&preview=not-the-token");
    await expect(soon).toContainText("Donations open soon");

    await page.route(/^https:\/\/checkout\.stripe\.com\//, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" }));
    await page.goto(`/donate?currency=EUR&preview=${E2E_DONATIONS_PREVIEW}`);
    await expect(page.locator("[data-notice]")).toHaveCount(0);
    await amounts(page).getByRole("button", { name: "€10", exact: true }).click();
    // The token stays in the address bar through choices (and is never in the share link).
    await expect(page).toHaveURL(new RegExp(`preview=${E2E_DONATIONS_PREVIEW}`));
    await methods(page).getByRole("button", { name: "Card payment via Stripe" }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com\/c\/pay\/cs_test_e2ecreated\d+\?mode=payment&currency=EUR&amount=1000/);
  } finally {
    await sql`delete from settings where key = 'donations.enabled'`;
  }
});

test("side-by-side comparisons", async ({ page }) => {
  const figmaDir = process.env.FIGMA_COMMON_DIR;
  test.skip(!figmaDir, "Set FIGMA_COMMON_DIR to the PNG renders of Common pages.pdf (cp-NN.png) to write the comparisons.");
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const pages: [string, string, string][] = [
    ["p28-default-usd", "cp-28", "Donate — default (USD)"],
    ["p28-default-eur", "cp-28", "Donate — default (EUR, with SEPA)"],
    ["p29-other", "cp-29", "Donate — Other"],
    ["p30-monthly", "cp-30", "Donate — Monthly, $5"],
    ["p31-select-amount", "cp-31", "Donate — Select an amount"],
    ["p33-thank-you", "cp-33", "Thank you — Donation sent"],
  ];
  await page.setViewportSize({ width: 2 * 412 + 24, height: 900 + 40 });
  for (const [shot, frame, label] of pages) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await page.setContent(`<body style="margin:0;background:#333;color:#fff;font:12px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App — ${label}</figcaption><img src="${data(app)}" width="412" height="900"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma Common pages ${frame.replace("cp-", "p")}</figcaption>
          <div style="width:412px;height:900px;overflow:hidden"><img src="${data(figma)}" width="412" style="margin-top:-${CHROME}px"></div></figure>
      </div></body>`);
    await page.screenshot({ path: join(SHOTS, `compare-${shot}.png`) });
  }
  // The sheets: app sheet (left) and the partial Figma frame (right).
  for (const [shot, frame, height] of [["p32-menu", "cp-32", 328], ["p34-menu", "cp-34", 218]] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await page.setContent(`<body style="margin:0;background:#333;color:#fff;font:12px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0;align-items:flex-start">
        <figure style="margin:0"><figcaption style="height:24px">App — ${shot}</figcaption><img src="${data(app)}" width="412"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma Common pages ${frame.replace("cp-", "p")}</figcaption><img src="${data(figma)}" width="412" height="${height}"></figure>
      </div></body>`);
    await page.screenshot({ path: join(SHOTS, `compare-${shot}.png`), fullPage: true });
  }
});
