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

      await page.goto(path, { waitUntil: "networkidle" });
      expect(errors).toEqual([]);
    });
  }

  test("Documentation accordion is actually interactive after hydration", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "networkidle" });
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

  test("the sticky Join waitlist bar navigates to /waitlist", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Join waitlist" }).last().click();
    await expect(page).toHaveURL("/waitlist");
  });

  test("keyboard navigation reaches and activates a Home link", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Contribute" }).focus();
    await expect(page.getByRole("link", { name: "Contribute" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/contribute");
  });
});

test.describe("Documentation index", () => {
  test("search filters the article list without navigating", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Introduction" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Version 0.1 scope" })).toBeVisible();

    await page.getByPlaceholder("Search").fill("Introduction");
    await expect(page.getByRole("button", { name: "Introduction" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Version 0.1 scope" })).not.toBeVisible();
    await expect(page).toHaveURL("/documentation");
  });

  test("expanding a row reveals metadata and loads the live article body inline (figma.pdf p15)", async ({
    page,
  }) => {
    await page.goto("/documentation", { waitUntil: "networkidle" });
    const toggle = page.getByRole("button", { name: "Introduction" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Nothing is fetched until the row is opened.
    await expect(page.getByRole("heading", { name: "Summary" })).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "Published" })).toHaveAttribute(
      "href",
      "/documentation/introduction",
    );
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback");
    await expect(page.getByRole("link", { name: "Report issue" })).toHaveAttribute("href", "/issue");
  });

  test("the Published link opens the article on its own route", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Introduction" }).click();
    await page.getByRole("link", { name: "Published" }).click();
    await expect(page).toHaveURL("/documentation/introduction");
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(page.getByText("The Global Experiment is an initiative")).toBeVisible();
  });

  test("the overflow menu opens the page-actions sheet and closes with Escape", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Page actions" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("Documentation article API", () => {
  test("serves a published article and a real 404 for an unknown slug", async ({ request }) => {
    const ok = await request.get("/api/documentation/introduction");
    expect(ok.status()).toBe(200);
    expect((await ok.json()).article.slug).toBe("introduction");
    expect(ok.headers()["cache-control"]).toBe("no-store");

    const missing = await request.get("/api/documentation/this-slug-does-not-exist");
    expect(missing.status()).toBe(404);
  });
});

test.describe("Documentation article 404 behavior", () => {
  test("a nonexistent slug returns a real HTTP 404, not 200", async ({ page }) => {
    const response = await page.goto("/documentation/this-slug-does-not-exist", {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Article not found")).toBeVisible();
    await expect(page.getByText("Error 404")).toBeVisible();
  });

  test("back navigation from an article returns to the index", async ({ page }) => {
    await page.goto("/documentation/introduction");
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL("/documentation");
  });
});

test.describe("Route shells never fake a successful submission", () => {
  for (const path of ["/waitlist", "/donate", "/feedback", "/issue"]) {
    test(`${path} loads with HTTP 200`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });
  }

  test("the waitlist CTA is inert until an address is typed, then flags an invalid one", async ({ page }) => {
    await page.goto("/waitlist");
    await expect(page.getByRole("button", { name: "Join waitlist" })).toBeDisabled();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Join waitlist" }).click();
    await expect(page.getByText("Invalid email address")).toBeVisible();
    await expect(page).toHaveURL("/waitlist");
  });

  test("feedback opens the type sheet and reports the action as not connected", async ({ page }) => {
    await page.goto("/feedback");
    await expect(page.getByRole("button", { name: "Send feedback" })).toBeDisabled();
    await page.getByRole("textbox").fill("Some feedback");
    await page.getByRole("button", { name: "Send feedback" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Enhancement").check();
    await dialog.getByRole("button", { name: "Send feedback" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toContainText("isn’t connected yet");
    await expect(page).toHaveURL("/feedback");
  });
});
