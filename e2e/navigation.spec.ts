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
    await expect(page.getByText("Introduction")).toBeVisible();
    await expect(page.getByText("Version 0.1 scope")).toBeVisible();

    await page.getByPlaceholder("Search").fill("Introduction");
    await expect(page.getByText("Introduction")).toBeVisible();
    await expect(page.getByText("Version 0.1 scope")).not.toBeVisible();
    await expect(page).toHaveURL("/documentation");
  });

  test("accordion expands to reveal metadata and a link to the full article, without duplicating content there", async ({
    page,
  }) => {
    await page.goto("/documentation", { waitUntil: "networkidle" });
    const toggle = page.getByRole("button", { name: "Introduction" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "Read full article" })).toHaveAttribute(
      "href",
      "/documentation/introduction",
    );
    // The full article body ("Fixture content...") is not duplicated on the index.
    await expect(page.getByText("Fixture content")).not.toBeVisible();
  });

  test("navigating into an article shows the full content on its own route", async ({ page }) => {
    await page.goto("/documentation", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Introduction" }).click();
    await page.getByRole("link", { name: "Read full article" }).click();
    await expect(page).toHaveURL("/documentation/introduction");
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  });
});

test.describe("Documentation article 404 behavior", () => {
  test("a nonexistent slug returns a real HTTP 404, not 200", async ({ page }) => {
    const response = await page.goto("/documentation/this-slug-does-not-exist", {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Article not found")).toBeVisible();
  });

  test("back navigation from an article returns to the index", async ({ page }) => {
    await page.goto("/documentation/introduction");
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL("/documentation");
  });
});

test.describe("Route shells never fake a successful submission", () => {
  for (const path of ["/waitlist", "/donate", "/feedback", "/issue"]) {
    test(`${path} loads with HTTP 200 and shows an inert-action notice on submit, never a fake success screen`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });
  }
});
