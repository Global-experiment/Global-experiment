import { expect, test, type Page } from "@playwright/test";

/**
 * Page centering with classic (space-taking) scrollbars, as on Windows or
 * macOS "always show scroll bars" — runs in the chromium AND webkit
 * projects (playwright.config.ts). Chromium hides scrollbars by default,
 * which would hide the bug; WebKit shows them. The client's bug: expanding
 * a Documentation article made the scrollbar appear and the centered
 * column move ~6px (see the centering note in src/app/globals.css).
 */
test.use({
  viewport: { width: 1280, height: 800 },
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});

/** The page column's gaps to the window's left and right edges (scrollbar width included on the right). */
const columnGaps = (page: Page, selector = "main .mx-auto") =>
  page.evaluate((query) => {
    const rect = document.querySelector(query)!.getBoundingClientRect();
    return {
      left: rect.left,
      right: window.innerWidth - rect.right,
      scrollbar: window.innerWidth - document.documentElement.clientWidth,
    };
  }, selector);

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("expanding/collapsing a long Documentation article never moves the centered column", async ({ page }) => {
  await page.goto("/documentation", { waitUntil: "load" });
  const before = await columnGaps(page);
  expect(before.scrollbar).toBe(0); // short page: no scrollbar yet

  // Short page → long page (the scrollbar appears) → short again.
  const rows = page.locator("h2 > button[aria-expanded]");
  for (const index of [0, 1, 2]) await rows.nth(index).click();
  const expanded = await columnGaps(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(expanded.scrollbar).toBeGreaterThan(0); // the bug's precondition: a space-taking scrollbar
  expect(expanded.left).toBe(before.left);

  for (const index of [0, 1, 2]) await rows.nth(index).click();
  expect((await columnGaps(page)).left).toBe(before.left);
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test("the column is centered in the window with and without the scrollbar", async ({ page }) => {
  await page.goto("/documentation", { waitUntil: "load" });
  let gaps = await columnGaps(page);
  expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(1);

  const rows = page.locator("h2 > button[aria-expanded]");
  for (const index of [0, 1, 2]) await rows.nth(index).click();
  gaps = await columnGaps(page);
  expect(gaps.scrollbar).toBeGreaterThan(0);
  // Window edge to column on the left == column to window edge on the right
  // (the scrollbar sits inside the right gap and isn't added on top of it).
  expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(1);
});

test("the fixed bottom bar and an open sheet line up with the centered column", async ({ page }) => {
  await page.goto("/treasury", { waitUntil: "load" });
  // Make the page scroll so a classic scrollbar is showing.
  await page.evaluate(() => {
    document.querySelector("main")!.style.minHeight = "3000px";
  });
  const column = await columnGaps(page);
  expect(column.scrollbar).toBeGreaterThan(0);
  const bar = await columnGaps(page, "[data-action-bar] .mx-auto");
  expect(Math.abs(bar.left - column.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(bar.right - column.right)).toBeLessThanOrEqual(1);

  // Opening a sheet locks page scrolling (the scrollbar disappears): nothing shifts, and the sheet is centered.
  await page.getByRole("button", { name: "Page actions" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const locked = await columnGaps(page);
  expect(locked.scrollbar).toBe(0);
  expect(Math.abs(locked.left - column.left)).toBeLessThanOrEqual(1);
  const sheet = await columnGaps(page, "dialog[open]");
  expect(Math.abs(sheet.left - sheet.right)).toBeLessThanOrEqual(1);
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test.describe("narrow window (full-width column)", () => {
  // The column fills the window here, so there's no free space to center
  // it in: its left edge must simply stay put while the scrollbar comes and
  // goes (expanding articles, a sheet locking scroll).
  test.use({ viewport: { width: 500, height: 700 } });

  test("expanding articles and opening a sheet never move the content's left edge", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    const heading = page.locator("main h2").first();
    const x = async () => (await heading.boundingBox())!.x;
    const startX = await x();

    const rows = page.locator("h2 > button[aria-expanded]");
    for (const index of [0, 1, 2]) await rows.nth(index).click();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    expect(await x()).toBe(startX);

    await page.getByRole("button", { name: "Page actions" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await x()).toBe(startX);
    // The bottom sheet spans the whole window, with no uncovered scrollbar strip.
    const sheet = await columnGaps(page, "dialog[open]");
    expect([sheet.left, sheet.right]).toEqual([0, 0]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    for (const index of [0, 1, 2]) await rows.nth(index).click();
    expect(await x()).toBe(startX);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test("the fixed bottom bar lines up with the content", async ({ page }) => {
    await page.goto("/treasury", { waitUntil: "load" });
    await page.evaluate(() => {
      document.querySelector("main")!.style.minHeight = "3000px";
    });
    const column = await columnGaps(page);
    const bar = await columnGaps(page, "[data-action-bar] .mx-auto");
    expect(Math.abs(bar.left - column.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(bar.right - column.right)).toBeLessThanOrEqual(1);
  });
});

// Window widths around the column's own width (41rem = 656px), where the
// free space beside it is smaller than the scrollbar: the column must not
// move there either.
for (const width of [640, 656, 662, 668, 674, 680, 700]) {
  test(`at ${width}px the column doesn't move when the scrollbar appears`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/documentation", { waitUntil: "load" });
    const before = await columnGaps(page);
    const rows = page.locator("h2 > button[aria-expanded]");
    for (const index of [0, 1, 2]) await rows.nth(index).click();
    const after = await columnGaps(page);
    expect(after.scrollbar).toBeGreaterThan(0);
    expect(after.left).toBe(before.left);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}

test("public pages have no horizontal overflow with classic scrollbars", async ({ page }) => {
  for (const path of ["/", "/documentation", "/treasury", "/donate", "/waitlist", "/contribute", "/feedback", "/issue"]) {
    await page.goto(path, { waitUntil: "load" });
    expect(await noHorizontalOverflow(page), path).toBe(true);
  }
});
