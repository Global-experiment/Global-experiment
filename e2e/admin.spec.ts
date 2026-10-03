import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Native admin, end to end through the real stack: browser → Next.js →
 * (same-origin /api/admin proxy) → NestJS → PostgreSQL 17 test database,
 * seeded with the demo dataset by the API's e2e-setup (see
 * playwright.config.ts). Serial: the tests share one owner session (login
 * is rate-limited) and edit the same seeded records.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const STATE_DIR = "test-results/.auth";
const STATE = `${STATE_DIR}/admin.json`;

async function signIn(page: Page, password = E2E_ADMIN.password) {
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const rows = (page: Page) => page.locator("tbody tr");
const firstCellTexts = (page: Page) => page.locator("tbody tr td:first-child").allInnerTexts();

test.describe("admin access", () => {
  test("unauthenticated visits to /admin go to login, and the API itself refuses them", async ({ page }) => {
    await page.goto("/admin/people?q=demo");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fpeople%3Fq%3Ddemo$/);
    await expect(page.getByRole("heading", { name: "Global Experiment admin" })).toBeVisible();

    const api = await page.request.get("/api/admin/people");
    expect(api.status()).toBe(401);
  });

  test("a wrong password is refused with a generic message; the right one returns to the requested page", async ({ page }) => {
    await page.goto("/admin/login?next=%2Fadmin%2Fpeople%3Fq%3Ddemo");
    await signIn(page, "wrong password");
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toBeVisible();

    await signIn(page);
    await expect(page).toHaveURL(/\/admin\/people\?q=demo$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();

    // Keep this session for the rest of the suite.
    mkdirSync(STATE_DIR, { recursive: true });
    await page.context().storageState({ path: STATE });
  });
});

test.describe("people administration", () => {
  test.use({ storageState: STATE });

  test("the list comes from PostgreSQL through the API, with Figma's shell and columns", async ({ page }) => {
    const responses: number[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/admin/people?")) responses.push(response.status());
    });
    await page.goto("/admin/people");
    await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("status").filter({ hasText: /of 48$/ })).toHaveText("1–48 of 48");
    expect(responses).toContain(200);

    for (const column of ["Name", "State", "Source", "Expertise", "Personal note", "Organization"]) {
      await expect(page.getByRole("columnheader", { name: column, exact: true })).toBeVisible();
    }
    // The Notion import control is honest: nothing is imported.
    await page.getByRole("button", { name: "Notion import" }).click();
    await expect(page.getByRole("dialog", { name: "Notion import" })).toContainText("Nothing has been imported");
    await page.keyboard.press("Escape");
  });

  test("search runs in the API and highlights matches", async ({ page }) => {
    await page.goto("/admin/people");
    await page.getByPlaceholder("Search").fill("farah");
    await expect(page).toHaveURL(/q=farah/);
    await expect(rows(page)).toHaveCount(3);
    expect((await firstCellTexts(page)).every((name) => name.startsWith("Farah"))).toBe(true);
    await expect(page.locator("tbody mark").first()).toHaveText(/farah/i);
  });

  test("filters: State is Sourced (any-of), applied by the API", async ({ page }) => {
    await page.goto("/admin/people");
    await page.getByRole("button", { name: "Filter" }).click();
    const popover = page.getByRole("dialog", { name: "Filters" });
    await popover.getByLabel("Field").selectOption("state");
    await popover.getByLabel("Condition").selectOption("is");
    await popover.getByLabel("Value").selectOption("sourced");
    await expect(page).toHaveURL(/filter=state%3Ais%3Asourced/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status").filter({ hasText: "Filters applied" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1 filter" })).toBeVisible();

    await expect(page.getByRole("status").filter({ hasText: /of \d+$/ })).toHaveText("1–12 of 12");
    const states = await page.locator("tbody tr td:nth-child(2)").allInnerTexts();
    expect(new Set(states)).toEqual(new Set(["Sourced"]));
  });

  test("sort: Name ascending", async ({ page }) => {
    await page.goto("/admin/people");
    await expect(page.getByRole("button", { name: "Last created first" })).toBeVisible();
    await page.getByRole("button", { name: "Last created first" }).click();
    await page.getByRole("dialog", { name: "Sort" }).getByLabel("Sort by").selectOption("name");
    await page.getByRole("dialog", { name: "Sort" }).getByLabel("Direction").selectOption("asc");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/sort=name%3Aasc/);
    await expect(page.getByRole("button", { name: "Name ascending" })).toBeVisible();
    const names = await firstCellTexts(page);
    expect(names.slice(0, 3)).toEqual(["Alex Demo", "Alex Example", "Alex Sample"]);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  test("column menu: hide a column, and it stays listed in the columns control", async ({ page }) => {
    await page.goto("/admin/people");
    await page.getByRole("columnheader", { name: "Source", exact: true }).getByRole("button").click();
    await page.getByRole("button", { name: "Hide column" }).click();
    await expect(page.getByRole("columnheader", { name: "Source", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("dialog", { name: "Columns" }).getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("columnheader", { name: "Source", exact: true })).toBeVisible();
  });

  test("open a record, edit fields, assign an organization and expertise, save, and see it persisted", async ({ page }) => {
    await page.goto("/admin/people?q=bea%20demo");
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/people\/de000000-/);
    const name = page.getByLabel("Name", { exact: true });
    await expect(name).toHaveValue("Bea Demo");

    await page.getByLabel("Personal note").fill("Edited during the E2E run.");
    await page.getByLabel("State").selectOption("collaborating");

    await page.getByRole("button", { name: "Add organization" }).click();
    await page.getByLabel("Search organization").fill("Harbor");
    await page.getByRole("dialog", { name: "Add organization" }).getByRole("button", { name: "Harbor Legal Collective" }).click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Add expertise" }).click();
    await page.getByLabel("Search expertise").fill("digital rights");
    await page.getByRole("dialog", { name: "Add expertise" }).getByRole("button", { name: /Digital rights/ }).click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Personal note")).toHaveValue("Edited during the E2E run.");
    await expect(page.getByLabel("State")).toHaveValue("collaborating");
    await expect(page.getByRole("button", { name: "Remove Harbor Legal Collective" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Digital rights" })).toBeVisible();

    // The list reflects it too (organization column, relationship stored natively).
    await page.goto("/admin/people?q=bea%20demo");
    await expect(rows(page).first()).toContainText("Harbor Legal Collective");
    await expect(rows(page).first()).toContainText("Digital rights");
    await expect(rows(page).first()).toContainText("Collaborating");
  });

  test("validation errors from the API are shown next to the field, nothing is saved", async ({ page }) => {
    await page.goto("/admin/people?q=cyril%20demo");
    await rows(page).first().getByRole("link").click();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email address." })).toBeVisible();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByLabel("Email")).toHaveValue("cyril.demo@example.org");
  });

  test("organizations and the expertise taxonomy are native screens too", async ({ page }) => {
    await page.goto("/admin/organizations");
    await expect(page.getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /of 12$/ })).toBeVisible();
    await page.goto("/admin/expertise");
    await expect(page.getByRole("cell", { name: "Full-stack development" })).toBeVisible();
    await page.goto("/admin/domains");
    await expect(page.getByRole("cell", { name: "Governance" })).toBeVisible();
  });

  test("sign out revokes the session", async ({ page }) => {
    await page.goto("/admin/profile");
    await expect(page.getByText(E2E_ADMIN.email)).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/people");
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
    expect((await page.request.get("/api/admin/people")).status()).toBe(401);
  });
});
