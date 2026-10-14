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
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
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

  await page.getByRole("button", { name: "Add expertise" }).click();
  const picker = page.getByRole("dialog", { name: "Add expertise" });
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

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Interaction design" })).toBeVisible();
});

test("the completeness indicator follows the form", async ({ page }) => {
  await page.goto("/admin/people?q=alex%20demo");
  await rows(page).first().getByRole("link").click();
  const completeness = page.getByRole("status").filter({ hasText: /^(Complete|Missing: )/ });
  await expect(completeness).toBeVisible();
  await page.getByLabel("State").selectOption("");
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

test("taxonomy screens are read-only, with domain / status / team / Stable ID filters", async ({ page }) => {
  await page.goto("/admin/expertise");
  await expect(page.getByText("Managed in Notion – updated by the importer.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rename|Delete/ })).toHaveCount(0);
  const counter = page.getByRole("status").filter({ hasText: / of \d+$/ });
  await expect(counter).toHaveText("24 of 24");

  await page.getByLabel("Domain").selectOption({ label: "Design" });
  await expect(counter).toHaveText("5 of 24");
  await page.getByLabel("Status").selectOption({ label: "Deprecated" });
  await expect(counter).toHaveText("1 of 24");
  await expect(page.getByRole("cell", { name: "Copywriting", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Search expertise by name or Stable ID").fill("02.01.");
  await expect(counter).toHaveText("3 of 24"); // Design > Product design
  await page.getByLabel("Search expertise by name or Stable ID").fill("");
  await page.getByLabel("Team").selectOption({ label: "Treasury" });
  // Columns: Name, Stable ID, Status, Field, Domain, Teams, People, Organizations.
  const teamCells = await page.locator("tbody tr td:nth-child(6)").allInnerTexts();
  expect(teamCells.length).toBeGreaterThan(0);
  for (const teams of teamCells) expect(teams).toContain("Treasury");

  await page.goto("/admin/domains");
  await expect(page.getByRole("status").filter({ hasText: / of \d+$/ })).toHaveText("4 of 4");
});

test("run a taxonomy dry run from the import page", async ({ page }) => {
  await page.goto("/admin/people");
  await page.getByRole("link", { name: "Notion import" }).click();
  await expect(page).toHaveURL(/\/admin\/imports$/);
  await expect(page.getByRole("heading", { name: "Notion import", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Dry run taxonomy" }).click();
  const status = page.locator("[data-job-status]");
  await expect(status).toHaveAttribute("data-job-status", "succeeded", { timeout: 20_000 });
  await expect(status).toHaveText(/^Taxonomy dry run finished: \d+ changes\.$/);
  await expect(page.getByLabel("Import report")).toContainText("TAXONOMY IMPORT — DRY RUN");
  await expect(page.getByLabel("Import report")).toContainText("Values left out: 0");

  // Apply is behind a confirmation; cancel here (the dry run must not change the shared test database).
  await page.getByRole("button", { name: "Apply this dry run…" }).click();
  const dialog = page.getByRole("dialog", { name: "Apply the taxonomy dry run?" });
  await expect(dialog).toContainText("in one transaction");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  const history = page.getByRole("table", { name: "Import history" });
  await expect(history.locator("tbody tr").first()).toContainText("Dry run");
  await expect(history.locator("tbody tr").first()).toContainText("Taxonomy");
});
