import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Admin directory v2 through the real stack (Next → NestJS → PostgreSQL 17
 * test database with test-only fixtures; the import page reads a Notion-
 * shaped fixture file instead of Notion — IMPORT_FIXTURE_FILE, test only).
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const STATE = "test-results/.auth/admin-directory-v2.json";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(E2E_ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/people/, { timeout: 15_000 });
  mkdirSync("test-results/.auth", { recursive: true });
  await page.context().storageState({ path: STATE });
  await page.close();
});

test.use({ storageState: STATE, viewport: { width: 1280, height: 800 } });

const rows = (page: Page) => page.locator("tbody tr");

test("pick expertise on a person: server search with path and team chips, chips with rollup, saved", async ({ page }) => {
  await page.goto("/admin/people?q=alex%20sample");
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/people\/de000000-/);

  const picker = page.getByRole("list", { name: "Expertise results" });
  // Deprecated expertise isn't offered.
  await page.getByLabel("Search expertise").fill("copywriting");
  await expect(picker).toContainText("No matches.");

  await page.getByLabel("Search expertise").fill("intera");
  const result = picker.getByRole("button", { name: /Interaction design/ });
  await expect(result).toContainText("Design > Product design");
  await expect(result.getByLabel("Teams")).toBeVisible();
  // Keyboard: ↓ from the search box reaches the result; Enter picks it.
  await page.getByLabel("Search expertise").press("ArrowDown");
  await expect(result).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  const chip = page.getByRole("list", { name: "Linked expertise" }).getByRole("listitem").filter({ hasText: "Interaction design" });
  await expect(chip).toHaveAttribute("title", "Design > Product design > Interaction design");
  await expect(page.getByLabel("Expertise rollup")).toContainText("Product design");
  await expect(page.getByLabel("Expertise rollup")).toContainText("Design");

  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
  // Submit goes back to the list; the saved record shows the chip.
  await expect(page).toHaveURL(/\/admin\/people\?q=alex/);
  await rows(page).first().getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Remove Interaction design" })).toBeVisible();
});

test("the completeness indicator follows the form", async ({ page }) => {
  await page.goto("/admin/people?q=alex%20demo");
  await rows(page).first().getByRole("link").click();
  const completeness = page.getByRole("status").filter({ hasText: /^(Complete|Missing: )/ });
  await expect(completeness).toBeVisible();
  // Pressing the selected State pill clears it.
  await page.getByRole("group", { name: "State" }).locator("[aria-pressed=true]").click();
  await expect(completeness).toContainText("State");
});

test("filter overdue follow-ups, and show the optional Completeness column", async ({ page }) => {
  await page.goto("/admin/people");
  await expect(page.getByRole("columnheader", { name: "Overdue", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Completeness", exact: true })).toHaveCount(0); // optional: hidden by default

  await page.getByRole("button", { name: "Filter" }).click();
  const popover = page.getByRole("dialog", { name: "Filters" });
  await popover.getByLabel("Field").selectOption("follow_up");
  await popover.getByLabel("Value").selectOption("overdue");
  await expect(page).toHaveURL(/filter=follow_up%3Ais%3Aoverdue/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status").filter({ hasText: /of \d+$/ })).toBeVisible();
  const count = await rows(page).count();
  expect(count).toBeGreaterThan(0);
  await expect(page.locator("tbody [data-overdue='true']")).toHaveCount(count);

  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("dialog", { name: "Columns" }).getByRole("button", { name: "Completeness" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Completeness", exact: true })).toBeVisible();
});

test("taxonomy screens are read-only, with the list toolbar: domain / status / team filters and search", async ({ page }) => {
  await page.goto("/admin/expertise");
  // No Notion import any more for the taxonomy (decision of 2026-10-23): no label, no import button.
  await expect(page.getByText(/Managed in Notion/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More options" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Rename|Delete|New/ })).toHaveCount(0);
  const counter = page.getByRole("status").filter({ hasText: / of \d+$/ });
  await expect(counter).toHaveText("1–24 of 24");

  await page.getByRole("button", { name: "Filter" }).click();
  const popover = page.getByRole("dialog", { name: "Filters" });
  await popover.locator("li").nth(0).getByLabel("Field").selectOption("domain");
  await popover.locator("li").nth(0).getByLabel("Value").selectOption({ label: "Design" });
  await expect(counter).toHaveText("1–5 of 5");
  await popover.getByRole("button", { name: "New filter" }).click();
  await popover.locator("li").nth(1).getByLabel("Field").selectOption("status");
  await popover.locator("li").nth(1).getByLabel("Value").selectOption({ label: "Deprecated" });
  await expect(counter).toHaveText("1–1 of 1");
  await expect(page.getByRole("cell", { name: "Copywriting", exact: true })).toBeVisible();
  await popover.getByRole("button", { name: "Remove all filters" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/admin\/expertise$/);
  await expect(counter).toHaveText("1–24 of 24");

  await page.getByRole("searchbox", { name: "Search expertise" }).fill("02.01.");
  await expect(counter).toHaveText("1–3 of 3"); // Design > Product design
  await page.getByRole("searchbox", { name: "Search expertise" }).fill("");
  await expect(counter).toHaveText("1–24 of 24");
  await page.getByRole("button", { name: "Filter" }).click();
  await popover.locator("li").nth(0).getByLabel("Field").selectOption("team");
  await popover.locator("li").nth(0).getByLabel("Value").selectOption({ label: "Treasury" });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/filter=team%3Ais%3Atreasury/);
  // Columns: Name, Stable ID, Status, Field, Domain, Teams, People, Organizations.
  await expect(page.getByRole("columnheader", { name: "Teams", exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const teamCells = await page.locator("tbody tr td:nth-child(6)").allInnerTexts();
      return teamCells.length > 0 && teamCells.every((teams) => teams.includes("Treasury"));
    })
    .toBe(true);

  await page.goto("/admin/domains");
  await expect(page.getByRole("status").filter({ hasText: / of \d+$/ })).toHaveText("1–4 of 4");
});

test("run a People & organizations dry run from the import page (the only Notion import left)", async ({ page }) => {
  await page.goto("/admin/people");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Import Notion" }).click();
  await expect(page).toHaveURL(/\/admin\/imports$/);
  await expect(page.getByRole("heading", { name: "Notion import", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Dry run/ })).toHaveText(["Dry run people & organizations"]);

  await page.getByRole("button", { name: "Dry run people & organizations" }).click();
  const status = page.locator("[data-job-status]");
  await expect(status).toHaveAttribute("data-job-status", "succeeded", { timeout: 20_000 });
  await expect(status).toHaveText(/^People & organizations dry run finished: (no changes|\d+ changes?)\.$/);
  await expect(page.getByLabel("Import report")).toContainText("DIRECTORY IMPORT — DRY RUN");

  const history = page.getByRole("table", { name: "Import history" });
  await expect(history.locator("tbody tr").first()).toContainText("Dry run");
  await expect(history.locator("tbody tr").first()).toContainText("People & organizations");
});
