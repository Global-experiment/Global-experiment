import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Admin table feedback (client, 2026-10-05) through the real stack
 * (Next → NestJS → PostgreSQL test database, seeded by e2e-setup):
 * page never scrolls sideways, sticky header/toolbar/column header, no
 * popover auto-focus, resize/reorder persisted, frozen stroke, and
 * organization → person linking. One sign-in for the file (login is
 * rate-limited); each test gets a fresh browser context, so column prefs
 * (localStorage) start clean.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const STATE = "test-results/.auth/admin-table.json";

test.beforeAll(async ({ browser }) => {
  // Explicitly empty: this page creates the stored session the tests then use.
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/people/, { timeout: 15_000 });
  mkdirSync("test-results/.auth", { recursive: true });
  await page.context().storageState({ path: STATE });
  await page.close();
});

test.use({ storageState: STATE, viewport: { width: 1280, height: 720 } });

const scroller = (page: Page) => page.locator("[data-table-scroller]");
const header = (page: Page, name: string) => page.getByRole("columnheader", { name, exact: true });
const headerOrder = (page: Page) => page.locator("thead th").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-column")));

async function openPeople(page: Page) {
  await page.goto("/admin/people");
  await expect(page.getByRole("status").filter({ hasText: /of 48$/ })).toBeVisible();
}

async function freeze(page: Page, name: string) {
  await header(page, name).getByRole("button").first().click();
  await page.getByRole("dialog", { name: `${name} column` }).getByRole("button", { name: "Freeze column" }).click();
  await page.keyboard.press("Escape");
}

test("only the table scrolls sideways; the page never does and the nav stays fully visible", async ({ page }) => {
  await openPeople(page);
  const box = scroller(page);
  expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  const pageOverflow = () =>
    page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollX: window.scrollX,
    }));
  expect(await pageOverflow()).toEqual({ x: 0, scrollX: 0 });

  await box.evaluate((el) => el.scrollTo({ left: 800 }));
  await page.mouse.move(700, 400);
  await page.mouse.wheel(600, 0); // horizontal trackpad-style scroll over the table
  expect(await box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(await pageOverflow()).toEqual({ x: 0, scrollX: 0 });

  const nav = await page.getByRole("navigation", { name: "Admin" }).boundingBox();
  expect(nav).toMatchObject({ x: 0, width: 240 });
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Profile" })).toBeInViewport();
});

test("admin pages opt out of overscroll history swipes; the public site doesn't", async ({ page }) => {
  await openPeople(page);
  const overscroll = () =>
    page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overscrollBehaviorX,
      body: getComputedStyle(document.body).overscrollBehaviorX,
      table: getComputedStyle(document.querySelector("[data-table-scroller]")!).overscrollBehaviorX,
    }));
  expect(await overscroll()).toEqual({ html: "none", body: "none", table: "none" });
  await page.goto("/waitlist");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorX)).toBe("auto");
});

test("title row, toolbar and column header stay visible deep in the table, frozen header cells on both axes", async ({ page }) => {
  await openPeople(page);
  await freeze(page, "Name");
  const box = scroller(page);
  const scrollerBox = (await box.boundingBox())!;

  await box.evaluate((el) => el.scrollTo({ top: el.scrollHeight, left: 700 }));
  await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Filter" })).toBeInViewport();

  // The column header row is pinned to the top of the scrolling table…
  const sourceHeader = (await header(page, "Source").boundingBox())!;
  expect(Math.round(sourceHeader.y)).toBe(Math.round(scrollerBox.y));
  // …and the frozen header cell is pinned to its top-left corner.
  const nameHeader = (await header(page, "Name").boundingBox())!;
  expect(Math.round(nameHeader.y)).toBe(Math.round(scrollerBox.y));
  expect(Math.round(nameHeader.x)).toBe(Math.round(scrollerBox.x));
  // A frozen body cell stays on the left while the rest scrolled under it.
  const lastName = page.locator("tbody tr").last().locator('td[data-column="name"]');
  expect(Math.round((await lastName.boundingBox())!.x)).toBe(Math.round(scrollerBox.x));
});

test("popovers don't auto-focus their first option; Tab enters them, Escape returns focus to the trigger", async ({ page }) => {
  await openPeople(page);
  for (const [trigger, dialog] of [
    ["Filter", "Filters"],
    ["Last created first", "Sort"],
  ] as const) {
    const button = page.getByRole("button", { name: trigger, exact: true });
    await button.click();
    const popover = page.getByRole("dialog", { name: dialog });
    await expect(popover).toBeVisible();
    await expect(button).toBeFocused();
    expect(await popover.evaluate((el) => el.contains(document.activeElement))).toBe(false);

    await page.keyboard.press("Tab");
    expect(await popover.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(button).toBeFocused();
  }
});

test("columns resize from the header edge (double-click resets) and the width survives a reload", async ({ page }) => {
  await openPeople(page);
  const source = header(page, "Source");
  const before = (await source.boundingBox())!.width;
  const handle = source.locator("[data-resize-handle]");
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 90, handleBox.y + handleBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await source.boundingBox())!.width)).toBe(Math.round(before + 90));

  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: /of 48$/ })).toBeVisible();
  expect(Math.round((await header(page, "Source").boundingBox())!.width)).toBe(Math.round(before + 90));

  // Minimum width.
  const minHandle = (await header(page, "Source").locator("[data-resize-handle]").boundingBox())!;
  await page.mouse.move(minHandle.x + 4, minHandle.y + 10);
  await page.mouse.down();
  await page.mouse.move(minHandle.x - 600, minHandle.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await header(page, "Source").boundingBox())!.width)).toBe(64);

  await header(page, "Source").locator("[data-resize-handle]").dblclick();
  await expect.poll(async () => Math.round((await header(page, "Source").boundingBox())!.width)).toBe(Math.round(before));
});

test("columns reorder by drag and drop and with Alt+arrows, and the order survives a reload", async ({ page }) => {
  await openPeople(page);
  expect((await headerOrder(page)).slice(0, 4)).toEqual(["name", "state", "source", "expertise"]);

  // Drag "Source" onto the left half of "State".
  const state = (await header(page, "State").boundingBox())!;
  await header(page, "Source").dragTo(header(page, "State"), { targetPosition: { x: 8, y: state.height / 2 } });
  await expect.poll(async () => (await headerOrder(page)).slice(0, 4)).toEqual(["name", "source", "state", "expertise"]);

  // Keyboard: Alt+→ on the focused "Name" header moves it one place right.
  await header(page, "Name").getByRole("button").first().focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(async () => (await headerOrder(page)).slice(0, 4)).toEqual(["source", "name", "state", "expertise"]);
  await expect(header(page, "Name").getByRole("button").first()).toBeFocused();

  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: /of 48$/ })).toBeVisible();
  expect((await headerOrder(page)).slice(0, 4)).toEqual(["source", "name", "state", "expertise"]);
});

test("the last frozen column carries a right stroke, header and body, with one or several frozen", async ({ page }) => {
  await openPeople(page);
  const stroke = (column: string) =>
    page.evaluate((id) => {
      const cells = [document.querySelector(`th[data-column="${id}"]`)!, document.querySelector(`tbody td[data-column="${id}"]`)!];
      return cells.map((cell) => getComputedStyle(cell).borderRightWidth);
    }, column);
  const lineColor = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--color-line)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  await freeze(page, "Name");
  expect(await stroke("name")).toEqual(["1px", "1px"]);
  expect(await page.locator('th[data-column="name"]').evaluate((el) => getComputedStyle(el).borderRightColor)).toBe(lineColor);

  await freeze(page, "State");
  expect(await stroke("state")).toEqual(["1px", "1px"]);
  expect(await stroke("name")).toEqual(["0px", "0px"]);
});

test("an organization links and unlinks people; the link shows on both records", async ({ page }) => {
  await page.goto("/admin/organizations?q=quarry");
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/organizations\/de000000-/);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Quarry Mobile");

  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Search person").fill("Juno Demo");
  await page.getByRole("dialog", { name: "Add person" }).getByRole("button", { name: "Juno Demo" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Organization updated" })).toBeVisible();

  await page.reload();
  const personLink = page.getByRole("link", { name: "Juno Demo" });
  await expect(personLink).toBeVisible();
  await personLink.click();
  await expect(page).toHaveURL(/\/admin\/people\/de000000-/);
  await expect(page.getByRole("link", { name: "Quarry Mobile" })).toBeVisible();

  // Back on the organization: unlink, and it's gone from the person too.
  await page.getByRole("link", { name: "Quarry Mobile" }).click();
  await page.getByRole("button", { name: "Remove Juno Demo" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Organization updated" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Juno Demo" })).toHaveCount(0);
});
