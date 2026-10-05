import { expect, test, type Page } from "@playwright/test";

/**
 * Frontend Review #3 (Candide): qualification over the origin page, session
 * drafts, mobile drag-to-close with real touch input, the fixed CTA,
 * sheet overflow and Documentation deep links. Scrollbar-gutter behaviour
 * with classic scrollbars lives in scrollbar.spec.ts (needs its own browser
 * launch options).
 */

const noPageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Real touch input through Chromium's DevTools protocol (not mouse emulation). */
async function touchDrag(page: Page, from: { x: number; y: number }, dy: number, steps: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= steps; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x, y: from.y + (dy * step) / steps }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.describe("qualification opens over the page you came from (item 5)", () => {
  test("Report issue on a Documentation article: picker over the article, then the composer with types + source", async ({ page }) => {
    await page.goto("/documentation#introduction", { waitUntil: "load" });
    const article = page.locator("#introduction");
    await expect(article.getByRole("button", { name: "Introduction" })).toHaveAttribute("aria-expanded", "true");

    await article.getByRole("link", { name: "Report issue" }).click();
    const picker = page.getByRole("dialog", { name: "Issue type" });
    await expect(picker).toBeVisible();
    // Still on the article, with its anchor.
    await expect(page).toHaveURL(/\/documentation#introduction$/);

    await picker.getByText("Visual bug").click();
    await picker.getByText("Broken link").click();
    await picker.getByRole("button", { name: "Report issue" }).click();

    await expect(page).toHaveURL(
      "/issue?source=%2Fdocumentation%23introduction&qualified=1&type=Visual+bug&type=Broken+link",
    );
    // The composer opens straight to the paragraph: no second qualification.
    await expect(page.getByLabel("Your issue report")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const main = page.locator("main");
    await expect(main).toHaveAttribute("data-source-page", "/documentation#introduction");
    await expect(main).toHaveAttribute("data-report-types", "Visual bug|Broken link");
  });

  test("dismissing the picker stays on the origin page", async ({ page }) => {
    await page.goto("/documentation#introduction", { waitUntil: "load" });
    await page.locator("#introduction").getByRole("link", { name: "Send feedback" }).click();
    const picker = page.getByRole("dialog", { name: "Feedback type" });
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(page).toHaveURL(/\/documentation#introduction$/);
  });

  test("the same launcher serves Treasury's stat sheets", async ({ page }) => {
    await page.goto("/treasury");
    await page.getByRole("button", { name: /Balance/ }).click();
    await page.getByRole("dialog", { name: "Balance" }).getByRole("link", { name: "Report issue" }).click();
    const picker = page.getByRole("dialog", { name: "Issue type" });
    await expect(picker).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Balance" })).toBeHidden();
    await expect(page).toHaveURL("/treasury");
    await picker.getByRole("button", { name: "Report issue" }).click();
    await expect(page).toHaveURL("/issue?source=%2Ftreasury&qualified=1");
  });

  test("a direct visit still qualifies on the composer, and records it so a reload doesn't ask again", async ({ page }) => {
    await page.goto("/feedback?source=%2Fdonate");
    const picker = page.getByRole("dialog", { name: "Feedback type" });
    await expect(picker).toBeVisible();
    await picker.getByText("Praise").click();
    await picker.getByRole("button", { name: "Send feedback" }).click();
    await expect(page).toHaveURL("/feedback?source=%2Fdonate&qualified=1&type=Praise");
    await page.reload();
    await expect(page.getByLabel("Your feedback")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("external sources are never carried", async ({ page }) => {
    await page.goto("/issue?source=https%3A%2F%2Fevil.example%2F&qualified=1");
    await expect(page.locator("main")).not.toHaveAttribute("data-source-page");
    await expect(page.getByRole("link", { name: "Back", exact: true })).toHaveAttribute("href", "/");
  });
});

test.describe("unsent paragraphs survive within the session (item 6)", () => {
  test("restored on return, kept per kind + origin page, and not cleared by the inert CTA", async ({ page, browser }) => {
    const composer = "/feedback?source=%2Ftreasury&qualified=1&type=Praise";
    await page.goto(composer);
    // Hydrated (the source is read client-side) before typing, so the input reaches the draft store.
    await expect(page.locator("main")).toHaveAttribute("data-source-page", "/treasury");
    const field = page.getByLabel("Your feedback");
    await field.fill("Half-written feedback about Treasury.");

    await page.goto("/treasury");
    await page.goto(composer);
    await expect(page.getByLabel("Your feedback")).toHaveValue("Half-written feedback about Treasury.");

    // The M1 CTA is inert: it must not pretend a submission and clear the draft.
    await page.getByRole("button", { name: "Send feedback" }).click();
    await page.goto(composer);
    await expect(page.getByLabel("Your feedback")).toHaveValue("Half-written feedback about Treasury.");

    // Another origin page, or the other kind, has its own (empty) draft.
    await page.goto("/feedback?source=%2Fdonate&qualified=1");
    await expect(page.getByLabel("Your feedback")).toHaveValue("");
    await page.goto("/issue?source=%2Ftreasury&qualified=1");
    await expect(page.getByLabel("Your issue report")).toHaveValue("");

    // sessionStorage only: a new browser session starts empty.
    const fresh = await browser.newPage();
    await fresh.goto(composer);
    await expect(fresh.getByLabel("Your feedback")).toHaveValue("");
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
    await fresh.close();
  });
});

/**
 * Mobile runs with real mobile emulation (overlay scrollbars, as on phones);
 * desktop with Playwright's default desktop Chromium.
 */
for (const mode of ["desktop", "mobile"] as const) {
  test.describe(`qualification sheets have no horizontal scrollbar (item 2) — ${mode}`, () => {
    if (mode === "mobile") test.use({ viewport: { width: 412, height: 900 }, hasTouch: true, isMobile: true });
    else test.use({ viewport: { width: 1280, height: 800 } });
    const viewport = mode === "mobile" ? { width: 412 } : { width: 1280 };

    for (const [path, name] of [
      ["/feedback", "Feedback type"],
      ["/issue", "Issue type"],
    ] as const) {
      test(`${path}`, async ({ page }) => {
        await page.goto(path);
        const dialog = page.getByRole("dialog", { name });
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(350); // mobile slide-up
        const box = await dialog.evaluate((el) => {
          const row = el.querySelector("fieldset label")!.getBoundingClientRect();
          const sheet = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const border = parseFloat(style.borderLeftWidth);
          return {
            overflow: el.scrollWidth - el.clientWidth,
            rowLeft: row.left - (sheet.left + border),
            rowRight: sheet.right - border - row.right,
            sheetWidth: sheet.width,
          };
        });
        expect(box.overflow).toBe(0);
        // Full-width rules: rows run exactly edge to edge of the sheet's content box.
        expect(box.rowLeft).toBeCloseTo(0, 0);
        expect(box.rowRight).toBeCloseTo(0, 0);
        // Mobile sheet: exactly the viewport width; desktop dialog: Figma's 400px.
        expect(box.sheetWidth).toBe(viewport.width < 768 ? viewport.width : 400);
        expect(await noPageOverflow(page)).toBe(true);
      });
    }
  });
}

test.describe("Documentation deep links (item 7)", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 412, height: 900 },
  ]) {
    test(`/documentation#<slug> expands only the target and scrolls it to the top (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/documentation");
      const slugs = await page.locator("div[id]:has(> h2 > button)").evaluateAll((rows) => rows.map((row) => row.id));
      const target = slugs[slugs.length - 2]!;
      const other = slugs[0]!;

      // A shared link is a fresh document load (not a same-page hash change,
      // which navigation.spec.ts covers): leave the page first.
      await page.goto("about:blank");
      await page.goto(`/documentation#${target}`, { waitUntil: "load" });
      const row = page.locator(`[id="${target}"]`);
      await expect(row.locator("h2 > button")).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(`[id="${other}"] h2 > button`)).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("h2 > button[aria-expanded=true]")).toHaveCount(1);
      // Still on target once streamed article bodies have changed the layout.
      await expect
        .poll(async () => Math.round((await row.boundingBox())!.y), { timeout: 8000 })
        .toBe(0);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      expect(await noPageOverflow(page)).toBe(true);
    });
  }

  test("an unknown hash fails safely", async ({ page }) => {
    await page.goto("/documentation#not-an-article", { waitUntil: "load" });
    await expect(page.locator("h2 > button[aria-expanded=true]")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 412, height: 900 }, hasTouch: true, isMobile: true });

  test("dragging a sheet down closes it — no reload, no navigation; a short drag snaps back (item 3)", async ({ page }) => {
    await page.goto("/treasury");
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });
    const openMenu = async () => {
      await page.getByRole("button", { name: "Page actions" }).click();
      const dialog = page.getByRole("dialog", { name: "Page actions" });
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(350);
      return dialog;
    };

    // From the sheet's content (not just the tiny handle): short and slow → snaps back.
    let dialog = await openMenu();
    let box = (await dialog.boundingBox())!;
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 40 }, 30, 15);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.y).toBeCloseTo(box.y, 0);

    // Upward swipe never lifts or closes it.
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 60 }, -120, 10);
    await page.waitForTimeout(300);
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.y).toBeCloseTo(box.y, 0);

    // Long drag down → closes, same page, no reload.
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 40 }, 300, 10);
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL("/treasury");
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

    // From the handle strip as well.
    dialog = await openMenu();
    box = (await dialog.boundingBox())!;
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 4 }, 260, 8);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  test("a long sheet's own content still scrolls normally; a downward swipe while scrolled scrolls back instead of dragging", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 480 });
    await page.goto("/treasury");
    await page.getByRole("button", { name: /Sustainability/ }).click();
    const dialog = page.getByRole("dialog", { name: "Sustainability" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(350);
    const sizes = await dialog.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    const box = (await dialog.boundingBox())!;
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // Swipe up on the content: the sheet's content scrolls, the sheet stays put.
    await touchDrag(page, middle, -160, 10);
    await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const scrolled = await dialog.evaluate((el) => el.scrollTop);
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.y).toBeCloseTo(box.y, 0);

    // Swipe down while not at the top: scrolls the content back, doesn't drag or close.
    await touchDrag(page, middle, 120, 10);
    await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBeLessThan(scrolled);
    await page.waitForTimeout(300);
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.y).toBeCloseTo(box.y, 0);
  });

  test("the page behind an open sheet doesn't scroll, and is scrollable again after it closes", async ({ page }) => {
    await page.goto("/treasury");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
    await page.getByRole("button", { name: "Page actions" }).click();
    await expect(page.getByRole("dialog", { name: "Page actions" })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  });

  test("the bottom CTA is fixed to the visible bottom on Home, and never covers the end of the page (item 4)", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator("[data-action-bar]");
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: "Join waitlist" })).toBeVisible();

    const barBottom = async () =>
      bar.evaluate((el) => Math.round(innerHeight - el.getBoundingClientRect().bottom));
    expect(await barBottom()).toBe(0);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    expect(await barBottom()).toBe(0);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    expect(await barBottom()).toBe(0);
    // The last piece of content ends above the bar (the spacer reserves its height).
    const clear = await page.evaluate(() => {
      const barTop = document.querySelector("[data-action-bar]")!.getBoundingClientRect().top;
      const spacer = document.querySelector("[data-action-bar-spacer]")!;
      const lastContent = spacer.previousElementSibling!.getBoundingClientRect().bottom;
      return barTop - lastContent;
    });
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(await noPageOverflow(page)).toBe(true);
  });

  test("on the composer the CTA stays fixed and visible", async ({ page }) => {
    await page.goto("/issue?source=%2Ftreasury&qualified=1");
    const bar = page.locator("[data-action-bar]");
    await expect(bar).toHaveCSS("position", "fixed");
    await page.getByLabel("Your issue report").fill("Something broke.");
    await expect(bar.getByRole("button", { name: "Report issue" })).toBeEnabled();
    await expect(bar).toBeInViewport();
  });
});
