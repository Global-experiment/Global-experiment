import { expect, test } from "@playwright/test";

test.describe("No CSP violations or hydration failures on any page", () => {
  // Regression test for a real bug found during M1 QA: a too-strict CSP
  // silently broke client-side hydration site-wide (see ADR 010).
  // `curl`-based verification cannot catch this class of bug — it never
  // executes JavaScript.
  for (const path of ["/", "/documentation", "/waitlist", "/contribute", "/donate", "/treasury", "/feedback", "/issue"]) {
    test(`${path} has zero console errors and hydrates successfully`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(`Uncaught: ${err.message}`));

      await page.goto(path, { waitUntil: "load" });
      expect(errors).toEqual([]);
    });
  }

  test("Documentation accordion is actually interactive after hydration", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    const toggle = page.getByRole("button", { name: "Introduction" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

// These run against the live Notion workspace — the application has no
// fixture or placeholder content. They assert structure that any valid
// editorial content must satisfy, plus stable published article titles.
test.describe("Home renders live Notion content", () => {
  test("has a non-empty tagline heading and at least one editorial paragraph", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
    expect(await page.locator("main p").count()).toBeGreaterThan(1);
  });
});

test.describe("Home navigation", () => {
  test("every CTA has a real, correct href — no disabled navigation controls", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Join waitlist" }).first()).toHaveAttribute(
      "href",
      "/waitlist",
    );
    await expect(page.getByRole("link", { name: "Contribute" })).toHaveAttribute("href", "/contribute");
    await expect(page.getByRole("link", { name: "Donate" })).toHaveAttribute("href", "/donate");
    await expect(page.getByRole("link", { name: "Treasury" })).toHaveAttribute("href", "/treasury");
    await expect(page.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "href",
      "/documentation",
    );

    // No disabled buttons anywhere on Home.
    await expect(page.locator("button[disabled]")).toHaveCount(0);
  });

  test("the action grid follows the 2026-09-24 Figma: full-width Join waitlist, then Documentation, Treasury, Contribute, Donate", async ({
    page,
  }) => {
    await page.goto("/");
    const labels = await page.getByRole("navigation", { name: "Main" }).getByRole("link").allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual(["Join waitlist", "Documentation", "Treasury", "Contribute", "Donate"]);
  });

  test("mobile: the sticky Join waitlist bar is shown and navigates to /waitlist", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    const links = page.getByRole("link", { name: "Join waitlist" });
    await expect(links).toHaveCount(2);
    const sticky = links.last();
    await expect(sticky).toBeVisible();
    await sticky.click();
    await expect(page).toHaveURL("/waitlist");
  });

  test("desktop (≥768px): no sticky CTA and no bottom space reserved for it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    // Only the in-grid Join waitlist remains; the sticky bar is display:none.
    await expect(page.getByRole("link", { name: "Join waitlist" })).toHaveCount(1);
    await expect(page.locator("[data-action-bar]")).toBeHidden();
    await expect(page.locator("[data-action-bar-spacer]")).toBeHidden();
    // 1.5rem (24px at Figma's scale; 25.5px at the 17px desktop root).
    const [mainPaddingBottom, root] = await page.locator("main").evaluate((el) => [getComputedStyle(el).paddingBottom, getComputedStyle(document.documentElement).fontSize]);
    expect(Number.parseFloat(mainPaddingBottom)).toBe(1.5 * Number.parseFloat(root));
  });

  test("keyboard navigation reaches and activates a Home link", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Contribute" }).focus();
    await expect(page.getByRole("link", { name: "Contribute" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/contribute");
  });
});

test.describe("Temporary light/dark theme toggle (client feedback item 7)", () => {
  test("no toggle on the public header any more (client review 2026-10-21); a light preview chosen in the admin still applies", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Switch to (light|dark) preview/ })).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");

    // The admin's toggle stores the same per-browser choice; the inline init script reads it before paint.
    await page.evaluate(() => localStorage.setItem("ge-theme", "light"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.goto("/documentation");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("Documentation index", () => {
  test("search matches the title, an expertise tag, and full body text — never just the title", async ({
    page,
  }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    const search = page.getByPlaceholder("Search");

    await search.fill("Introduction");
    await expect(page.getByRole("button", { name: "Introduction" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Version 0.1 scope" })).not.toBeVisible();

    // A tag match (not present in the title or visible without expanding).
    await search.fill("Civic technology");
    await expect(page.getByRole("button", { name: "Introduction" })).toBeVisible();

    // A body-text match — exact wording from the live Introduction article.
    await search.fill("shared civic infrastructure");
    await expect(page.getByRole("button", { name: "Introduction" })).toBeVisible();
  });

  test("search auto-expands every match and highlights every occurrence; clearing restores the accordion", async ({
    page,
  }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    const search = page.getByPlaceholder("Search");
    const introduction = page.getByRole("button", { name: "Introduction" });

    // Case-insensitive; a body-only phrase from the live Introduction article.
    await search.fill("SHARED civic INFRASTRUCTURE");
    await expect(introduction).toHaveAttribute("aria-expanded", "true");
    const marks = page.locator("mark");
    await expect(marks.first()).toBeVisible();
    for (const text of await marks.allTextContents()) {
      expect(text.toLowerCase()).toBe("shared civic infrastructure");
    }

    // Every matching row is expanded, not just the first; body marks in each.
    await search.fill("the");
    const rows = page.locator("h2 > button[aria-expanded]");
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) await expect(rows.nth(i)).toHaveAttribute("aria-expanded", "true");
    expect(await page.locator("p mark").count()).toBeGreaterThan(count);
    // Links keep working: no anchor loses its href to highlighting.
    for (const href of await page.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
      expect(href).toBeTruthy();
    }

    // Title occurrences are marked too.
    await search.fill("intro");
    await expect(page.locator("h2 mark").first()).toHaveText(/^intro$/i);
    // …and tags.
    await search.fill("civic technology");
    await expect(page.locator("#introduction .flex-wrap mark").first()).toHaveText(/^civic technology$/i);

    // Selection-style inverse tokens on the highlight.
    const mark = marks.first();
    const bg = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
    const fg = await mark.evaluate((el) => getComputedStyle(el).color);
    expect(bg).not.toBe(fg);

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.locator("mark")).toHaveCount(0);
    await expect(introduction).toHaveAttribute("aria-expanded", "false");
  });

  test("a #slug deep link expands only that article and scrolls to it", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    await page.getByRole("button", { name: "Version 0.1 scope" }).click();
    await expect(page.getByRole("button", { name: "Version 0.1 scope" })).toHaveAttribute("aria-expanded", "true");

    await page.goto("/documentation#introduction", { waitUntil: "load" });
    const introduction = page.getByRole("button", { name: "Introduction" });
    await expect(introduction).toHaveAttribute("aria-expanded", "true");
    const expanded = page.locator("h2 > button[aria-expanded=true]");
    await expect(expanded).toHaveCount(1);
    await expect(introduction).toBeInViewport();

    // A hash change on the same page retargets: only the new one is open.
    const otherSlug = await page.locator("div[id]:has(> h2 > button[aria-expanded=false])").first().getAttribute("id");
    expect(otherSlug).toBeTruthy();
    await page.evaluate((slug) => (window.location.hash = slug), otherSlug!);
    await expect(page.locator(`[id="${otherSlug}"] h2 > button`)).toHaveAttribute("aria-expanded", "true");
    await expect(expanded).toHaveCount(1);
  });

  test("an article row shares its canonical #slug anchor; the page share stays /documentation", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
    await page.getByRole("button", { name: "Introduction" }).click();
    await page.locator("#introduction").getByRole("button", { name: "Share" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/documentation#introduction$/);

    await page.getByRole("button", { name: "Share" }).first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/documentation$/);
  });

  test("the clear button empties the search and returns focus to the field", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    const search = page.getByPlaceholder("Search");
    await search.fill("Introduction");
    await expect(page.getByRole("button", { name: "Version 0.1 scope" })).not.toBeVisible();

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page.getByRole("button", { name: "Version 0.1 scope" })).toBeVisible();
  });

  test("expanding a row is instant — the full body is already loaded, no loading state appears", async ({
    page,
  }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    const toggle = page.getByRole("button", { name: "Introduction" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // No network round trip on expand: the heading is already there, and no
    // "Loading…" status is ever rendered.
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(page.getByText("Loading")).toHaveCount(0);
    // Report links carry the article's anchor as their source page.
    await expect(page.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
      "href",
      "/feedback?source=%2Fdocumentation%23introduction",
    );
    await expect(page.getByRole("link", { name: "Report issue" })).toHaveAttribute(
      "href",
      "/issue?source=%2Fdocumentation%23introduction",
    );
  });

  test("each row has its own bottom stroke", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    const row = page.getByRole("button", { name: "Introduction" }).locator("xpath=ancestor::div[1]");
    await expect(row).toHaveCSS("border-bottom-width", "1px");
  });

  test("the Published link opens the article on its own route", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    await page.getByRole("button", { name: "Introduction" }).click();
    await page.getByRole("link", { name: "Published" }).click();
    await expect(page).toHaveURL("/documentation/introduction");
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(page.getByText("The Global Experiment is an initiative")).toBeVisible();
  });

  test("the overflow menu opens the page-actions sheet with no visible title, and closes with Escape", async ({
    page,
  }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    await page.getByRole("button", { name: "Page actions" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
      "href",
      "/feedback?source=%2Fdocumentation",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("Documentation article and history", () => {
  test("a nonexistent slug returns a real HTTP 404, not 200", async ({ page }) => {
    const response = await page.goto("/documentation/this-slug-does-not-exist", { waitUntil: "load" });
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Article not found")).toBeVisible();
    await expect(page.getByText("Error 404")).toBeVisible();
  });

  test("back navigation from an article returns to the index (real history, not a hard-coded link)", async ({
    page,
  }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    // The index row is a button; the article link is "Published" inside it.
    await page.getByRole("button", { name: "Introduction" }).click();
    await page.getByRole("link", { name: "Published" }).click();
    await expect(page).toHaveURL("/documentation/introduction");
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL("/documentation");
  });

  test("visiting an article directly (no in-app history) falls back to its href instead of failing", async ({
    page,
  }) => {
    await page.goto("/documentation/introduction", { waitUntil: "load" });
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL("/documentation");
  });

  test("the article overflow menu offers Document history, which shows real current content with an honest no-history note", async ({
    page,
  }) => {
    await page.goto("/documentation/introduction", { waitUntil: "load" });
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("link", { name: "Document history" }).click();
    await expect(page).toHaveURL("/documentation/introduction/history");
    await expect(page.getByText("No verifiable previous revision is available")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  });
});

test.describe("Route shells never fake a successful submission", () => {
  for (const path of ["/waitlist", "/donate", "/feedback", "/issue"]) {
    test(`${path} loads with HTTP 200`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });
  }

  test("Waitlist: the CTA sits inline under the email field, not fixed to the viewport (client feedback item 29)", async ({
    page,
  }) => {
    await page.goto("/waitlist");
    const button = page.getByRole("button", { name: "Join waitlist" });
    await expect(button).toHaveCSS("position", "static");

    await expect(button).toBeDisabled();
    await page.getByLabel("Email").fill("not-an-email");
    await button.click();
    await expect(page.getByText("Invalid email address")).toBeVisible();
    await expect(page).toHaveURL("/waitlist");
  });
});

test.describe("Feedback / Issue: type selection happens before the composer (client feedback item 20)", () => {
  test("the type sheet is open on arrival; the composer only becomes usable after it's dismissed", async ({
    page,
  }) => {
    await page.goto("/feedback");
    const dialog = page.getByRole("dialog", { name: "Feedback type" });
    await expect(dialog).toBeVisible();

    await dialog.getByText("Enhancement").click();
    await dialog.getByRole("button", { name: "Send feedback" }).click();
    await expect(dialog).toBeHidden();

    const composer = page.getByLabel("Your feedback");
    await composer.fill("Some feedback");
    await expect(page.getByRole("button", { name: "Send feedback" })).toBeEnabled();
  });

  test("the composer has no focus outline, no stroke and no background change on focus; suggestions stay on", async ({
    page,
  }) => {
    await page.goto("/feedback");
    await page.getByRole("dialog").getByRole("button", { name: "Send feedback" }).click();
    const composer = page.getByLabel("Your feedback");
    const before = await composer.evaluate((el) => getComputedStyle(el).backgroundColor);
    await composer.focus();
    await expect(composer).toHaveCSS("outline-style", "none");
    await expect(composer).toHaveCSS("border-top-width", "0px");
    await expect(composer).toHaveCSS("background-color", before);
    await expect(composer).toHaveAttribute("spellcheck", "true");
    await expect(composer).toHaveAttribute("autocorrect", "on");
  });

  test("the source page is kept from ?source= and only internal paths are accepted", async ({ page }) => {
    // The public Treasury has no ⋮ menu (decided 2026-10-19); Donate keeps one.
    await page.goto("/donate");
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Send feedback" }).click();
    // Qualification opens over Treasury first (Review #3 item 5), then the composer.
    const picker = page.getByRole("dialog", { name: "Feedback type" });
    await expect(picker).toBeVisible();
    await expect(page).toHaveURL("/donate");
    await picker.getByRole("button", { name: "Send feedback" }).click();
    await expect(page).toHaveURL("/feedback?source=%2Fdonate&qualified=1");
    await expect(page.locator("main")).toHaveAttribute("data-source-page", "/donate");

    await page.goto("/issue?source=https%3A%2F%2Fevil.example%2F");
    await expect(page.getByRole("dialog", { name: "Issue type" })).toBeVisible();
    await expect(page.locator("main")).not.toHaveAttribute("data-source-page");
  });

  test("issue reporting follows the same reversed flow", async ({ page }) => {
    await page.goto("/issue");
    const dialog = page.getByRole("dialog", { name: "Issue type" });
    await expect(dialog).toBeVisible();
    await dialog.getByText("Visual bug").click();
    await dialog.getByRole("button", { name: "Report issue" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Your issue report")).toBeVisible();
  });
});

test.describe("Contribute: copy confirmation (client feedback item 30)", () => {
  test("the copy icon becomes a checkmark for ~3 seconds, then reverts, with no layout shift", async ({
    page,
  }) => {
    await page.goto("/contribute");
    const copyButton = page.getByRole("button", { name: "Copy email address" });
    const box = await copyButton.boundingBox();

    await copyButton.click();
    const confirmed = page.getByRole("button", { name: "Copied" });
    await expect(confirmed).toBeVisible();
    expect(await confirmed.boundingBox()).toMatchObject({ width: box?.width, height: box?.height });

    await expect(page.getByRole("button", { name: "Copy email address" })).toBeVisible({ timeout: 4000 });
  });
});

// Treasury (real data through the API): treasury.spec.ts and treasury-figma.spec.ts.

test.describe("Icons and icon buttons", () => {
  test("every visible icon is 1rem (16px at Figma's scale); primary CTAs use filled glyphs, others outlined", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 900 });
    await page.goto("/");
    const root = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    for (const svg of await page.locator("svg[data-icon]").filter({ visible: true }).all()) {
      const box = await svg.boundingBox();
      expect([box?.width, box?.height]).toEqual([root, root]);
    }
    const sticky = page.getByRole("link", { name: "Join waitlist" }).last();
    await expect(sticky.locator("svg[data-icon=how_to_vote]")).toHaveAttribute("data-variant", "filled");

    await page.goto("/treasury");
    await expect(page.getByRole("link", { name: "Donate" }).last().locator("svg")).toHaveAttribute(
      "data-icon",
      "volunteer_activism",
    );
    await expect(page.getByRole("link", { name: "Donate" }).last().locator("svg")).toHaveAttribute(
      "data-variant",
      "filled",
    );
    await page.goto("/donate"); // the public Treasury has no ⋮ menu (decided 2026-10-19)
    await page.getByRole("button", { name: "Page actions" }).click();
    for (const svg of await page.getByRole("dialog").locator("svg[data-icon]").all()) {
      await expect(svg).toHaveAttribute("data-variant", "outlined");
    }
  });

  test("icon-only buttons have no hover visuals but keep the pointer", async ({ page }) => {
    await page.goto("/documentation");
    const button = page.getByRole("button", { name: "Page actions" });
    const before = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.boxShadow, s.borderColor, s.color, s.outlineStyle].join("|");
    });
    await button.hover();
    const after = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.boxShadow, s.borderColor, s.color, s.outlineStyle].join("|");
    });
    expect(after).toBe(before);
    await expect(button).toHaveCSS("cursor", "pointer");
  });
});

test.describe("Inputs", () => {
  test("Waitlist email and Donate Other carry the right keyboard hints", async ({ page }) => {
    await page.goto("/waitlist");
    const email = page.getByLabel("Email");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("inputmode", "email");
    await expect(email).toHaveAttribute("autocomplete", "email");

    await page.goto("/donate");
    await page.getByRole("button", { name: "Other" }).click();
    const other = page.getByLabel("Other amount");
    await expect(other).toHaveAttribute("inputmode", "decimal");
    await expect(other).toHaveAttribute("autocomplete", "off");
    await expect(other).toHaveAttribute("autocorrect", "off");
    await expect(other).toHaveAttribute("spellcheck", "false");
  });
});

test.describe("Mobile sheet drag-to-close", () => {
  test.use({ viewport: { width: 412, height: 900 }, hasTouch: true });

  async function dragHandle(page: import("@playwright/test").Page, distance: number, steps: number) {
    const handle = page.getByRole("dialog").locator("[data-sheet-drag-handle]");
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + distance, { steps });
    await page.mouse.up();
  }

  test("a short slow drag snaps back; a long drag closes; dragging up never lifts the sheet", async ({ page }) => {
    // The public Treasury has no ⋮ menu (decided 2026-10-19); Donate keeps one.
    await page.goto("/donate");
    await page.getByRole("button", { name: "Page actions" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400); // let the slide-up finish
    const rest = (await dialog.boundingBox())!.y;

    await dragHandle(page, -80, 10);
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400);
    expect((await dialog.boundingBox())!.y).toBeCloseTo(rest, 0);

    await dragHandle(page, 20, 20);
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.y).toBeCloseTo(rest, 0);

    await dragHandle(page, 200, 10);
    await expect(dialog).toBeHidden();
  });

  test("desktop dialogs ignore the drag", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // The public Treasury has no ⋮ menu (decided 2026-10-19); Donate keeps one.
    await page.goto("/donate");
    await page.getByRole("button", { name: "Page actions" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dragHandle(page, 300, 10);
    await expect(dialog).toBeVisible();
  });
});

test.describe("Donate", () => {
  // Stats, payments and states (real data, through the API): donate.spec.ts.

  test("the overflow menu shows the Figma copy (Common pages p32) with no visible title", async ({ page }) => {
    await page.goto("/donate");
    await page.getByRole("button", { name: "Page actions" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveCount(0);
    await expect(dialog.getByText("are the banking partners of the experiment.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Stripe" })).toHaveAttribute("href", "https://stripe.com");
    await expect(dialog.getByRole("link", { name: "Wise" })).toHaveAttribute("href", "https://wise.com");
  });

  test("the Other amount field accepts only numeric input and has no native step spinner", async ({ page }) => {
    await page.goto("/donate");
    await page.getByRole("button", { name: "Other" }).click();
    const input = page.getByLabel("Other amount");
    await expect(input).toHaveAttribute("type", "text");
    // pressSequentially, not fill: fill() sets the whole string at once and
    // bypasses the character-by-character onChange validation being tested.
    await input.pressSequentially("12.50abc");
    await expect(input).toHaveValue("12.50");
  });

  test("the full legal copy from Figma is present", async ({ page }) => {
    await page.goto("/donate");
    await expect(page.getByText("The Global Experiment is a Swiss non-profit association")).toBeVisible();
    await expect(page.getByText(/Monthly donations can be cancelled/)).toBeVisible();
  });
});
