import { expect, test, type Page } from "@playwright/test";

/**
 * Public website conventions from the client's 2026-10-19 feedback and the
 * 2026-10-21 review, on every page: one sticky header with exactly two icons
 * on the right — Share (desktop: copy, check icon and "Link copied to
 * clipboard"; mobile: the native share sheet) and ⋮, whose menu always has
 * Send feedback and Report issue; copy rows in sheets (copy, check, toast,
 * close); toasts above sticky bars and open sheets; footer bar padding (half
 * a rem and one rem); 1.5rem checkboxes; a mobile sheet that slides down on
 * every close; and the public size scale (18px root on phones, 17px from
 * 768px, the admin at 16px).
 */

const PAGES = ["/", "/documentation", "/treasury", "/donate", "/waitlist", "/contribute", "/feedback", "/issue"];
const header = (page: Page) => page.locator("[data-nav-header]").first();

test.describe("headers", () => {
  test("every public header is sticky, with exactly Share and ⋮ on the right; the menu has Send feedback and Report issue", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_ENABLED, "Treasury and Donate need the API.");
    test.setTimeout(180_000);
    const expense = await (await page.request.get("/api/treasury/entries?type=expense")).json();
    for (const width of [412, 1280]) {
      await page.setViewportSize({ width, height: 700 });
      for (const path of [...PAGES, `/treasury/expense/${expense.items[0].number}`]) {
        await page.goto(path);
        if (path === "/feedback" || path === "/issue") {
          // These open their type picker on load: close it first.
          await expect(page.locator("dialog[open]")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.locator("dialog[open]")).toHaveCount(0);
        }
        const box = header(page);
        await expect(box, path).toBeVisible();
        expect(await box.evaluate((element) => [getComputedStyle(element).position, getComputedStyle(element).top]), path).toEqual(["sticky", "0px"]);
        // The right side: Share, then ⋮ — nothing else (no theme toggle, currency or chart link).
        const actions = box.locator("[data-header-actions] > :is(a, button)");
        expect(await actions.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))), `${path} @${width}`).toEqual(["Share", "Page actions"]);
        await box.getByRole("button", { name: "Page actions" }).click();
        const menu = page.getByRole("dialog", { name: "Page actions" });
        await expect(menu.getByRole("link", { name: "Send feedback" }), path).toBeVisible();
        await expect(menu.getByRole("link", { name: "Report issue" }), path).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("dialog[open]")).toHaveCount(0);
      }
    }
  });

  test("the menu's Report issue opens the issue form with this page as context", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto("/contribute");
    await header(page).getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("dialog", { name: "Page actions" }).getByRole("link", { name: "Report issue" }).click();
    const picker = page.getByRole("dialog", { name: "Issue type" });
    await expect(picker).toBeVisible();
    await picker.getByText("Visual bug").click();
    await picker.getByRole("button", { name: "Report issue" }).click();
    await expect(page).toHaveURL(/\/issue\?source=%2Fcontribute/);
  });

  test("Donate keeps its currency switch and Treasury link, in the menu", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_ENABLED, "Donate needs the API.");
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto("/donate");
    await header(page).getByRole("button", { name: "Page actions" }).click();
    const menu = page.getByRole("dialog", { name: "Page actions" });
    await expect(menu.getByRole("link", { name: "Treasury" })).toHaveAttribute("href", "/treasury");
    await menu.getByRole("button", { name: "Currency: USD" }).click();
    const currencies = page.getByRole("dialog", { name: "Choose a currency" });
    await currencies.getByRole("button", { name: "Euro (EUR)" }).click();
    await expect(page).toHaveURL(/currency=EUR/);
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
  test("footer bar: half a rem around the button on mobile, one rem on desktop (8px and 16px at Figma's scale)", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_ENABLED, "Treasury needs the API.");
    for (const [width, padding] of [
      [412, "9px"], // 0.5rem at the 18px phone root
      [1280, "17px"], // 1rem at the 17px desktop root
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/treasury");
      const bar = page.locator("[data-action-bar]");
      expect(await bar.evaluate((element) => [getComputedStyle(element).paddingTop, getComputedStyle(element).paddingBottom]), String(width)).toEqual([padding, padding]);
    }
  });

  test("checkboxes are 1.5rem (24px at Figma's scale); other icons stay 1rem", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto("/feedback");
    const box = page.getByRole("dialog").locator("[data-icon^=check_box]").first();
    await expect(box).toBeVisible();
    // 1.5rem and 1rem at the 18px phone root.
    expect(await box.evaluate((svg) => [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height])).toEqual([27, 27]);
    const other = page.getByRole("dialog").locator("svg[data-icon]:not([data-icon^=check_box])").first();
    expect(await other.evaluate((svg) => svg.getBoundingClientRect().width)).toBe(18);
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
      const element = document.querySelector("dialog.sheet[data-closing]") as HTMLDialogElement;
      return { open: element.open, closing: element.hasAttribute("data-closing"), translate: element.style.translate };
    });
    expect(midway).toMatchObject({ open: true, closing: true });
    expect(midway.translate).toMatch(/^0(px)? 100%$/);
    // …then closed.
    await expect(page.locator("dialog.sheet[open]")).toHaveCount(0);
  });
});

test.describe("toasts float above bottom bars and sheets (client review 2026-10-21)", () => {
  const gapAbove = async (page: Page, selector: string) =>
    page.evaluate((target) => {
      const toast = document.querySelector("[data-toast]")!.getBoundingClientRect();
      const bottom = document.querySelector(target)!.getBoundingClientRect();
      return bottom.top - toast.bottom;
    }, selector);

  for (const [label, width] of [
    ["mobile", 412],
    ["desktop", 1280],
  ] as const) {
    test(`${label}: above the sticky Donate bar, and above an open bottom sheet`, async ({ page }) => {
      test.skip(!process.env.E2E_ADMIN_ENABLED, "Treasury needs the API.");
      // No native share sheet, so Share copies and shows the toast at every width.
      await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/treasury");
      await header(page).getByRole("button", { name: "Share" }).click();
      await expect(page.locator("[data-toast]")).toHaveText("Link copied to clipboard");
      expect(await gapAbove(page, "[data-action-bar]")).toBeGreaterThanOrEqual(4);
      // Drawn on top: the toast layer is an open popover, in the browser's top layer above sheets and bars.
      expect(await page.locator("[data-toast-layer]").evaluate((element) => element.matches(":popover-open"))).toBe(true);

      if (label === "mobile") {
        // A copy row in the ⋮ sheet: the toast shows above the sheet while it is still open.
        await header(page).getByRole("button", { name: "Page actions" }).click();
        const sheet = page.getByRole("dialog", { name: "Page actions" });
        await page.waitForTimeout(400);
        await sheet.getByRole("button", { name: "Share page" }).click();
        await expect(page.locator("[data-toast]")).toBeVisible();
        expect(await gapAbove(page, "dialog.sheet[open]")).toBeGreaterThanOrEqual(4);
      }
    });
  }
});

test.describe("size scale (client review 2026-10-21)", () => {
  test("the public root is 18px on phones and 17px from 768px; the admin stays at 16px; one variable", async ({ page }) => {
    const root = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    for (const [width, size] of [
      [375, "18px"],
      [767, "18px"],
      [768, "17px"],
      [1440, "17px"],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/contribute");
      expect(await root(), String(width)).toBe(size);
    }
    // Text follows: the 0.875rem body is 14.875px at 17px.
    expect(await page.locator("main p").last().evaluate((element) => getComputedStyle(element).fontSize)).toBe("14.875px");
    // Adjustable in one place.
    await page.evaluate(() => document.documentElement.style.setProperty("--public-root-size", "125%"));
    expect(await root()).toBe("20px");
    await page.goto("/admin/login");
    expect(await root()).toBe("16px");
  });
});
