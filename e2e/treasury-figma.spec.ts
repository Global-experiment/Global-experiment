import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Treasury against Common pages.pdf (412px-wide phone frames; the browser
 * chrome takes the top 104px, so the page is 412×900): the list p11, its
 * sheets p12–p14 and the date filter p16, the expense p22–p23 and the
 * anonymous donation p26–p27 — through the real stack on the test-only
 * fixtures (see treasury.spec.ts).
 *
 * Decided differences from the frames: Balance and Sustainability wait for
 * Wise (Q22), no "+2.1%" trends (no history of the figures yet), no search
 * field (no public search), no roadmap link, reactions or timeline on the
 * expense (no data yet), no donor names (anonymous only), no bottom
 * navigation bar in the app.
 *
 * Captures go to test-results/figma-treasury/; with FIGMA_COMMON_DIR set (PNG
 * renders of Common pages.pdf at 72 dpi, cp-NN.png), side-by-side
 * comparisons are written too.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the API isn't running.");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 412, height: 900 } });

const SHOTS = "test-results/figma-treasury";
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
const capture = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const sheetCapture = async (page: Page, name: string) => {
  await page.waitForTimeout(400); // the slide-up
  await page.getByRole("dialog").screenshot({ path: join(SHOTS, `${name}.png`) });
};

test("p11 list: header, sort and filter fields, pills, stats, banner, rows", async ({ page }) => {
  await page.goto("/treasury");
  await expect(page.locator("[data-amount]").first()).toBeVisible();
  await capture(page, "p11-list");

  // Sort and Filter fields: 32px tall at y 148 (Figma), 8px apart, inside the 8px gutters.
  const sort = await box(page.getByRole("button", { name: /^Sort:/ }));
  const filter = await box(page.getByRole("button", { name: /^Filter the history/ }));
  near(sort.y, fy(148), "sort y");
  near(sort.height, 32, "sort height");
  near(sort.x, 8, "sort x");
  near(filter.x + filter.width, 404, "filter right edge");
  near(filter.x - (sort.x + sort.width), 8, "gap");
  // Pills: 32px at y 188.
  const pill = await box(page.getByRole("button", { name: "Expenses", exact: true }));
  near(pill.y, fy(188), "pills y");
  near(pill.height, 32, "pill height");
  // History rows: 40px, full bleed rule.
  const row = await box(page.locator("main ul li a").first());
  near(row.height, 40, "row height");
  near(row.x, 0, "row x");
  near(row.width, 412, "row width");
  // Header: "USD" ends 8px before the chart glyph (364–378.67 at y 116, as on Donate p28), then ⋮.
  const usd = await box(page.getByRole("button", { name: /^Currency: USD/ }));
  near(usd.x + usd.width - 8, 356, "USD text right edge");
  const chart = await box(page.locator("header").getByRole("link", { name: "Treasury" }).locator("svg"));
  near(chart.x, 364, "chart glyph x");
  near(chart.y, fy(116), "chart glyph y");
  // The overflow glyph ending 8px from the edge.
  const more = await box(page.getByRole("button", { name: "Page actions" }).locator("svg"));
  near(more.x + more.width, 404, "⋮ right edge");
});

test("p12 the ⋮ sheet: refresh line, last update, five actions", async ({ page }) => {
  await page.goto("/treasury");
  await page.getByRole("button", { name: "Page actions" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("The treasury page is updated within minutes.");
  await expect(sheet).toContainText(/Last updated at \d{1,2}:\d{2}(AM|PM)/);
  for (const action of ["Donate", "Share page", "Send feedback", "Report issue", "Documentation"]) await expect(sheet.getByRole("link", { name: action }).or(sheet.getByRole("button", { name: action }))).toBeVisible();
  await sheetCapture(page, "p12-menu");
});

test("p13 sort sheet and p14 filter sheet", async ({ page }) => {
  await page.goto("/treasury");
  await page.getByRole("button", { name: /^Sort:/ }).click();
  await expect(page.getByRole("dialog", { name: "Sort by" })).toContainText("Latest first");
  await sheetCapture(page, "p13-sort");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Filter the history/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter" })).toContainText("Erase filters");
  await sheetCapture(page, "p14-filter");
  await page.getByRole("dialog", { name: "Filter" }).getByRole("button", { name: /^Date/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter dates" })).toContainText("Apply filter");
  await sheetCapture(page, "p16-dates");
});

test("p22–p23 expense and its ⋮ sheet", async ({ page }) => {
  await page.goto("/treasury");
  await page.getByRole("link", { name: /USD 5,675/ }).click();
  await expect(page.getByText("Paid Apr 6 2:07 PM")).toBeVisible();
  // Figma p22: the time line at y≈156 with the share glyph on it; the amount at y≈244.
  const paid = await box(page.getByText("Paid Apr 6 2:07 PM"));
  near(paid.y + paid.height / 2, fy(156), "time line", 3);
  const share = await box(page.getByRole("button", { name: "Share" }).locator("svg"));
  near(share.y + share.height / 2, paid.y + paid.height / 2, "share aligned with the time", 2);
  await capture(page, "p22-expense");
  await page.getByRole("button", { name: "Page actions" }).click();
  await sheetCapture(page, "p23-menu");
});

test("p26–p27 anonymous donation and its ⋮ sheet", async ({ page }) => {
  await page.goto("/treasury");
  await page.getByRole("link", { name: /^Donation USD 5 / }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Donation" })).toBeVisible();
  const donated = await box(page.getByText(/^Donated /));
  near(donated.y + donated.height / 2, fy(156), "time line", 3);
  await capture(page, "p26-donation");
  await page.getByRole("button", { name: "Page actions" }).click();
  await sheetCapture(page, "p27-menu");
});

test("desktop: the same column, centred (no desktop frame in Figma)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/treasury");
  await expect(page.locator("[data-amount]").first()).toBeVisible();
  await capture(page, "desktop-list");
});

/** PNG width × height from its header. */
const pngSize = (path: string) => {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

test("side-by-side comparisons", async ({ page }) => {
  const figmaDir = process.env.FIGMA_COMMON_DIR;
  test.skip(!figmaDir, "Set FIGMA_COMMON_DIR to the PNG renders of Common pages.pdf (cp-NN.png) to write the comparisons.");
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const pages: [string, string, string][] = [
    ["p11-list", "cp-11", "Treasury — list"],
    ["p22-expense", "cp-22", "Expense"],
    ["p26-donation", "cp-26", "Anonymous donation"],
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
  // The sheets: the app's sheet (left) and the partial Figma frame (right).
  for (const [shot, frame] of [
    ["p12-menu", "cp-12"],
    ["p13-sort", "cp-13"],
    ["p14-filter", "cp-14"],
    ["p16-dates", "cp-16"],
    ["p23-menu", "cp-23"],
    ["p27-menu", "cp-27"],
  ] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    const { height } = pngSize(figma);
    await page.setContent(`<body style="margin:0;background:#333;color:#fff;font:12px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0;align-items:flex-start">
        <figure style="margin:0"><figcaption style="height:24px">App — ${shot}</figcaption><img src="${data(app)}" width="412"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma Common pages ${frame.replace("cp-", "p")}</figcaption><img src="${data(figma)}" width="412" height="${height}"></figure>
      </div></body>`);
    await page.screenshot({ path: join(SHOTS, `compare-${shot}.png`), fullPage: true });
  }
});
