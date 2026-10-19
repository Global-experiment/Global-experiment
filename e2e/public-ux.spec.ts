import { expect, test, type Page } from "@playwright/test";

/**
 * Public website conventions from the client's 2026-10-19 feedback, on every
 * page: sticky headers with a share button (desktop: copy, check icon and
 * "Link copied to clipboard"; mobile: the native share sheet), the same
 * behaviour for copy rows in sheets (copy, check, toast, close), footer bar
 * padding (8px mobile, 16px desktop), 24px checkboxes, and a mobile sheet
 * that slides down on every close like a drag-down close.
 */

const PAGES = ["/", "/documentation", "/treasury", "/donate", "/waitlist", "/contribute", "/feedback", "/issue"];
const header = (page: Page) => page.locator("[data-nav-header]").first();

test.describe("headers", () => {
  test("every public header is sticky and has the share button", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_ENABLED, "Treasury and Donate need the API.");
    await page.setViewportSize({ width: 412, height: 700 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.keyboard.press("Escape"); // /feedback and /issue open their type picker on load
      const box = header(page);
      await expect(box, path).toBeVisible();
      expect(await box.evaluate((element) => [getComputedStyle(element).position, getComputedStyle(element).top]), path).toEqual(["sticky", "0px"]);
      await expect(box.getByRole("button", { name: "Share" }), path).toBeVisible();
    }
  });

  test("the header stays at the top while a long page scrolls", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_ENABLED, "Treasury needs the API.");
    await page.setViewportSize({ width: 412, height: 500 });
    await page.goto("/treasury");
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const top = await header(page).evaluate((element) => element.getBoundingClientRect().top);
    expect(top).toBe(0);
    await expect(header(page).getByRole("heading", { level: 1, name: "Treasury" })).toBeInViewport();
  });

  test("desktop: Share copies the page URL, turns into a check and shows 'Link copied to clipboard'", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/contribute");
    await header(page).getByRole("button", { name: "Share" }).click();
    await expect(page.locator("[data-toast]")).toHaveText("Link copied to clipboard");
    await expect(header(page).getByRole("button", { name: "Link copied" }).locator("[data-icon=check_circle]")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL("/contribute", page.url()).toString());
    // The check goes back to the share icon after a moment.
    await expect(header(page).getByRole("button", { name: "Share" })).toBeVisible({ timeout: 5000 });
  });

  test("desktop: a copy row in a sheet copies, shows the check and the toast, and closes the sheet", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/documentation");
    await header(page).getByRole("button", { name: "Page actions" }).click();
    const sheet = page.getByRole("dialog", { name: "Page actions" });
    await sheet.getByRole("button", { name: "Share page" }).click();
    await expect(sheet.getByRole("button", { name: "Share page" }).locator("[data-icon=check_circle]")).toBeVisible();
    await expect(page.locator("[data-toast]")).toHaveText("Link copied to clipboard");
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL("/documentation", page.url()).toString());
  });
});

test.describe("mobile share", () => {
  test.use({ viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true });

  test("Share opens the native share sheet (unchanged), no copy and no toast", async ({ page }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      (window as unknown as { __shares: unknown[] }).__shares = calls;
      Object.defineProperty(navigator, "share", { configurable: true, value: async (data: unknown) => void calls.push(data) });
    });
    await page.goto("/contribute");
    await header(page).getByRole("button", { name: "Share" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shares: { url: string }[] }).__shares.map((share) => share.url))).toEqual([
      new URL("/contribute", page.url()).toString(),
    ]);
    await expect(page.locator("[data-toast]")).toHaveCount(0);
  });
});

test.describe("layout details", () => {
  test("footer bar: 8px around the button on mobile, 16px on desktop", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_ENABLED, "Treasury needs the API.");
    for (const [width, padding] of [
      [412, "8px"],
      [1280, "16px"],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/treasury");
      const bar = page.locator("[data-action-bar]");
      expect(await bar.evaluate((element) => [getComputedStyle(element).paddingTop, getComputedStyle(element).paddingBottom]), String(width)).toEqual([padding, padding]);
    }
  });

  test("checkboxes are 24px; other icons stay 16px", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto("/feedback");
    const box = page.getByRole("dialog").locator("[data-icon^=check_box]").first();
    await expect(box).toBeVisible();
    expect(await box.evaluate((svg) => [svg.getAttribute("width"), svg.getAttribute("height")])).toEqual(["24", "24"]);
    const other = page.getByRole("dialog").locator("svg[data-icon]:not([data-icon^=check_box])").first();
    expect(await other.getAttribute("width")).toBe("16");
  });

  test("mobile: closing a sheet with ✕ slides it down like a drag-down close", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_ENABLED, "Treasury needs the API.");
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto("/treasury");
    await page.getByRole("button", { name: /Expenses$/ }).filter({ has: page.locator("[data-stat-value]") }).click();
    const dialog = page.locator("dialog.sheet[open]");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400); // opening slide done
    await dialog.getByRole("button", { name: "Close" }).click();
    // Still on screen, sliding down (same 0.25s translate as a drag-down close)…
    const midway = await page.evaluate(() => {
      const element = document.querySelector("dialog.sheet") as HTMLDialogElement;
      return { open: element.open, closing: element.hasAttribute("data-closing"), translate: element.style.translate };
    });
    expect(midway).toMatchObject({ open: true, closing: true });
    expect(midway.translate).toMatch(/^0(px)? 100%$/);
    // …then closed.
    await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
  });
});
