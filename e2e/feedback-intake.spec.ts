import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Feedbacks and issues, part 1: the composers send for real. Cloudflare's script is stubbed (the browser never
 * reaches Cloudflare): the stub hands over the token the API's test mode accepts (TURNSTILE_FIXTURE). The API
 * saves to the test database; the API's own tests cover what it stores. Made-up text only.
 */

/** A stand-in for https://challenges.cloudflare.com/turnstile/v0/api.js: renders nothing, passes on execute. */
const TURNSTILE_STUB = `
window.turnstile = {
  render(container, options) { this.options = options; return "e2e-widget"; },
  reset() {},
  remove() {},
  execute() { const options = this.options; setTimeout(() => options.callback("fixture-pass"), 0); },
};`;

const MOBILE = { width: 412, height: 900 };
const DESKTOP = { width: 1440, height: 900 };
const COMPOSER = "/feedback?source=%2Ftreasury&qualified=1&type=Enhancement";

async function openComposer(page: Page, url = COMPOSER) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: TURNSTILE_STUB }),
  );
  await page.goto(url);
  // Hydrated (the source is read client-side) before typing, so the input reaches the draft store.
  await expect(page.locator("main")).toHaveAttribute("data-source-page", "/treasury");
}

async function axe(page: Page) {
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
  expect(violations).toEqual([]);
}

test.describe("the composers' bot check is allowed where it runs, and only there", () => {
  test("the Content-Security-Policy names Cloudflare's script and frame on /feedback and /issue only", async ({ request }) => {
    const policy = async (path: string) => (await request.get(path)).headers()["content-security-policy"] ?? "";
    for (const path of ["/feedback", "/issue"]) {
      const csp = await policy(path);
      expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
      expect(csp).toMatch(/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    }
    for (const path of ["/", "/waitlist", "/donate", "/treasury"]) expect(await policy(path)).not.toContain("challenges.cloudflare.com");
  });
});

test.describe("sending a feedback or an issue", () => {
  test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the API isn't running.");

  test("sends, shows the confirmation and clears the stored paragraph", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openComposer(page);
    await page.getByLabel("Your feedback").fill("The Treasury filters could remember the year.");
    const sent = page.waitForResponse((response) => response.url().endsWith("/api/feedback/submissions"));
    await page.getByRole("button", { name: "Send feedback" }).click();
    expect((await sent).status()).toBe(201);
    await expect(page.locator("main").getByRole("status")).toContainText("Feedback sent");
    await expect(page.locator("main").getByRole("status")).toContainText("Thank you for your feedback.");
    await expect(page.getByRole("link", { name: "Back to the page" })).toHaveAttribute("href", "/treasury");

    await openComposer(page);
    await expect(page.getByLabel("Your feedback")).toHaveValue("");
  });

  test("keeps the paragraph and says so when sending fails", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.route("**/api/feedback/submissions", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "x" } }) }),
    );
    await openComposer(page);
    await page.getByLabel("Your feedback").fill("Kept when the server is unavailable.");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Sending isn't available right now. Your text is kept, so you can try again later.");
    await expect(page.getByLabel("Your feedback")).toHaveValue("Kept when the server is unavailable.");

    await page.goto("/treasury");
    await openComposer(page);
    await expect(page.getByLabel("Your feedback")).toHaveValue("Kept when the server is unavailable.");
    // Typing again clears the message.
    await page.getByLabel("Your feedback").fill("Kept when the server is unavailable. Edited.");
    await expect(page.locator("main").getByRole("alert")).toBeEmpty();
  });

  test("works with the keyboard alone", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openComposer(page, "/issue?source=%2Ftreasury&qualified=1&type=Broken+link");
    const field = page.getByLabel("Your issue report");
    for (let step = 0; step < 10 && !(await field.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
    await page.keyboard.type("The link to the Treasury rules leads nowhere.");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Report issue" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main").getByRole("status")).toContainText("Issue reported");
    const back = page.getByRole("link", { name: "Back to the page" });
    for (let step = 0; step < 10 && !(await back.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/treasury");
  });

  for (const [scheme, viewport] of [
    ["dark", MOBILE],
    ["light", MOBILE],
    ["dark", DESKTOP],
    ["light", DESKTOP],
  ] as const) {
    test(`passes axe in ${scheme} at ${viewport.width}px: the composer with an error, then the confirmation`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(viewport);
      let fail = true;
      await page.route("**/api/feedback/submissions", (route) =>
        fail
          ? route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "x" } }) })
          : route.fallback(),
      );
      await openComposer(page);
      await page.getByLabel("Your feedback").fill(`Axe check, ${scheme} at ${viewport.width}px.`);
      await page.getByRole("button", { name: "Send feedback" }).click();
      await expect(page.locator("main").getByRole("alert")).toHaveText("You've sent several reports in a short time. Please wait a few minutes and try again.");
      await axe(page);

      fail = false;
      await page.getByRole("button", { name: "Send feedback" }).click();
      await expect(page.locator("main").getByRole("status")).toContainText("Feedback sent");
      await axe(page);
    });
  }
});
