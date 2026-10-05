import { expect, test } from "@playwright/test";

// Classic (space-taking) scrollbars, as on Windows or macOS "always show
// scroll bars" — Playwright hides scrollbars by default, which would hide
// the bug this file guards against (Review #3 item 1).
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("expanding/collapsing Documentation articles never shifts the page sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/documentation", { waitUntil: "load" });
  const heading = page.locator("main h2").first();
  const x = async () => (await heading.boundingBox())!.x;

  // The gutter is reserved up front: content is laid out at the narrower
  // width even before the page scrolls (Chromium's clientWidth reporting of
  // a reserved-but-unused gutter varies, so position is what's asserted).
  const startX = await x();
  const rows = page.locator("h2 > button[aria-expanded]");
  // Short page → long page (scrollbar needed) → short again.
  for (const index of [0, 1, 2]) await rows.nth(index).click();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(await x()).toBe(startX);
  for (const index of [0, 1, 2]) await rows.nth(index).click();
  expect(await x()).toBe(startX);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("public pages have no horizontal overflow with classic scrollbars", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ["/", "/documentation", "/treasury", "/donate", "/waitlist", "/contribute", "/feedback", "/issue"]) {
    await page.goto(path, { waitUntil: "load" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), path).toBe(true);
  }
});
