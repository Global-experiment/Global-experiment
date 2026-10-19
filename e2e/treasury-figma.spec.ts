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

test("p12 list (2026-10-19: no currency switch, search, sort or filter): header, pills, stats, rows", async ({ page }) => {
  await page.goto("/treasury");
  await expect(page.locator("[data-amount]").first()).toBeVisible();
  await capture(page, "p12-list");

  // Header (decision 2026-10-19): back glyph at x 8, the title at x 32, the share glyph ending 8px from the edge, all at Figma's y 116.
  const back = await box(page.locator("header").getByRole("link", { name: "Back" }).locator("svg"));
  near(back.x, 8, "back glyph x");
  near(back.y + back.height / 2, fy(124), "back glyph centre");
  const title = await box(page.getByRole("heading", { level: 1, name: "Treasury" }));
  near(title.x, 32, "title x");
  const share = await box(page.locator("header").getByRole("button", { name: "Share" }).locator("svg"));
  near(share.x + share.width, 404, "share glyph right edge");
  near(share.y + share.height / 2, fy(124), "share glyph centre");
  // The pills take the toolbar's place: 32px at Figma's y 148.
  const pill = await box(page.getByRole("button", { name: "Expenses", exact: true }));
  near(pill.y, fy(148), "pills y");
  near(pill.height, 32, "pill height");
  near(pill.x, 8, "pills x");
  // History rows: 40px, full bleed rule.
  const row = await box(page.locator("main ul li a").first());
  near(row.height, 40, "row height");
  near(row.x, 0, "row x");
  near(row.width, 412, "row width");
});

test("p23–p24 expense and its ⋮ sheet", async ({ page }) => {
  await page.goto("/treasury");
  await page.getByRole("link", { name: /USD 5,675/ }).click();
  await expect(page.getByText("Paid Apr 6 2:07 PM")).toBeVisible();
  // Figma p22: the time line at y≈156 with the share glyph on it; the amount at y≈244.
  const paid = await box(page.getByText("Paid Apr 6 2:07 PM"));
  near(paid.y + paid.height / 2, fy(156), "time line", 3);
  // The row's own share button (the header has one too, client feedback 2026-10-19).
  const share = await box(page.locator("main").getByRole("button", { name: "Share" }).nth(1).locator("svg"));
  near(share.y + share.height / 2, paid.y + paid.height / 2, "share aligned with the time", 2);
  await capture(page, "p23-expense");
  await page.getByRole("button", { name: "Page actions" }).click();
  await sheetCapture(page, "p24-menu");
});

test("p27–p28 anonymous donation and its ⋮ sheet", async ({ page }) => {
  await page.goto("/treasury");
  await page.getByRole("link", { name: /^Donation USD 5 / }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Donation" })).toBeVisible();
  const donated = await box(page.getByText(/^Donated /));
  near(donated.y + donated.height / 2, fy(156), "time line", 3);
  await capture(page, "p27-donation");
  await page.getByRole("button", { name: "Page actions" }).click();
  await sheetCapture(page, "p28-menu");
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
    ["p12-list", "cp-12", "Treasury — list"],
    ["p23-expense", "cp-23", "Expense"],
    ["p27-donation", "cp-27", "Anonymous donation"],
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
    ["p13-menu", "cp-13"],
    ["p14-sort", "cp-14"],
    ["p15-filter", "cp-15"],
    ["p17-dates", "cp-17"],
    ["p24-menu", "cp-24"],
    ["p28-menu", "cp-28"],
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
