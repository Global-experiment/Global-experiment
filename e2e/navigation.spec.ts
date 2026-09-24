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
    // Only the in-grid Join waitlist remains; the fixed bar is display:none.
    await expect(page.getByRole("link", { name: "Join waitlist" })).toHaveCount(1);
    await expect(page.locator("div.fixed.bottom-0")).toBeHidden();
    const mainPaddingBottom = await page.locator("main").evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(mainPaddingBottom).toBe("24px");
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
  test("switches the theme, updates the pressed state, and survives navigation", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Switch to light preview" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");

    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Switch to dark preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Persists across a full navigation, not just client-side state.
    await page.goto("/documentation");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // And across a fresh load (localStorage, read by the inline init script
    // before paint — no flash asserted here, just the end state).
    await page.reload();
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

  test("a search match stays collapsed — searching never auto-expands a row", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "load" });
    await page.getByPlaceholder("Search").fill("Introduction");
    await expect(page.getByRole("button", { name: "Introduction" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("heading", { name: "Summary" })).toHaveCount(0);
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
    await expect(page.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback");
    await expect(page.getByRole("link", { name: "Report issue" })).toHaveAttribute("href", "/issue");
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
    await expect(dialog.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback");
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
    await page.goto("/documentation");
    await page.getByRole("link", { name: "Introduction" }).first().click();
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

  test("the composer has no focus outline; a background tint marks focus instead (client feedback item 22)", async ({
    page,
  }) => {
    await page.goto("/feedback");
    await page.getByRole("dialog").getByRole("button", { name: "Send feedback" }).click();
    const composer = page.getByLabel("Your feedback");
    await composer.focus();
    await expect(composer).toHaveCSS("outline-style", "none");
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

test.describe("Treasury", () => {
  test("a stat with a Figma detail view opens its sheet; Expenses (no detail view) stays plain", async ({
    page,
  }) => {
    await page.goto("/treasury");
    await page.getByRole("button", { name: /Balance/ }).click();
    const dialog = page.getByRole("dialog", { name: "Balance" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Treasury balance")).toBeVisible();
    await page.keyboard.press("Escape");

    // "Expenses" has no Figma detail view and is not a button.
    await expect(page.getByRole("button", { name: /^USD 39\.8K/ })).toHaveCount(0);
  });

  test("the worst-case overflow row shows two tags plus a +1 badge, with all three visible on its detail page", async ({
    page,
  }) => {
    await page.goto("/treasury");
    const row = page.getByRole("link", { name: /USD 60/ });
    await expect(row.getByText("Banking")).toBeVisible();
    await expect(row.getByText("Treasury management")).toBeVisible();
    await expect(row.getByText("+1")).toBeVisible();
    await expect(row.getByText("Software licensing")).toHaveCount(0);

    await row.click();
    await expect(page).toHaveURL(/\/treasury\/expense\//);
    await expect(page.getByText("Banking")).toBeVisible();
    await expect(page.getByText("Treasury management")).toBeVisible();
    await expect(page.getByText("Software licensing")).toBeVisible();
  });

  test("a donation row (no Figma detail view) does not navigate anywhere", async ({ page }) => {
    await page.goto("/treasury");
    await expect(page.getByRole("link", { name: /EUR 8/ })).toHaveCount(0);
  });
});

test.describe("Donate", () => {
  test("stats are clickable, the same way as Treasury", async ({ page }) => {
    await page.goto("/donate");
    await page.getByRole("button", { name: /Sustainability/ }).click();
    await expect(page.getByRole("dialog", { name: "Sustainability" })).toBeVisible();
  });

  test("the overflow menu shows the real Figma copy with no visible title", async ({ page }) => {
    await page.goto("/donate");
    await page.getByRole("button", { name: "Page actions" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveCount(0);
    await expect(dialog.getByText("Wise Belgian banking account")).toBeVisible();
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
