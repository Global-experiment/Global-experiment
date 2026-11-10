import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * OPS-70 — every edit form shows a field's error when the field is left, not while it is first typed in;
 * once shown, the error follows the typing and goes as soon as the value is fixed; submitting checks every
 * field, shows every error, moves the focus to the first field to fix, and sends nothing. The errors are
 * linked to their fields (aria-invalid, aria-describedby) and read out (role="alert"). On People, Treasury,
 * Profile and an invitation's sign-up; nothing is saved (every form is discarded or closed).
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

let page: Page;

async function axe(target: Page = page) {
  const results = await new AxeBuilder({ page: target }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** A field's error, linked to it as a screen reader finds it. */
async function expectError(field: Locator, message: string) {
  await expect(field).toHaveAttribute("aria-invalid", "true");
  const describedBy = (await field.getAttribute("aria-describedby")) ?? "";
  const errorId = describedBy.split(" ").find((id) => id.endsWith("-error"))!;
  const error = page.locator(`[id="${errorId}"]`);
  await expect(error).toHaveText(message);
  await expect(error).toHaveAttribute("role", "alert");
}

async function expectNoError(field: Locator) {
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
}

async function discard() {
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
}

test.beforeAll(async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(E2E_ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/(?!login)/);
});
test.afterAll(async () => {
  await page.context().close();
});

test("People: the email is checked when left, follows the typing once shown, and Submit focuses the first field to fix", async () => {
  await page.goto("/admin/people?q=Alex%20Demo");
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  const email = page.locator("#person-email");
  const name = page.locator("#person-name");
  const saved = await email.inputValue();

  // While typing for the first time: nothing.
  await email.fill("ada@example");
  await expectNoError(email);
  // Leaving the field: the error, linked and read out.
  await email.press("Tab");
  await expectError(email, "Invalid email address.");
  await axe();
  // The same in the light appearance.
  await page.emulateMedia({ colorScheme: "light" });
  await axe();
  await page.emulateMedia({ colorScheme: "dark" });
  // Fixed while typing: the error goes at once, without leaving the field.
  await email.focus();
  await email.pressSequentially(".org");
  await expectNoError(email);
  await expect(page.locator("[data-property=Email] [data-field-error]")).toHaveCount(0);

  // Submit with two errors: both shown, the focus on the first (Name comes before Email), nothing sent.
  await email.fill("ada@@example.org");
  await name.fill("");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expectError(name, "Name is required.");
  await expectError(email, "Invalid email address.");
  await expect(name).toBeFocused();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await axe();
  await discard();
  await page.reload();
  await expect(page.locator("#person-email")).toHaveValue(saved);
});

test("Treasury: the amount and the name of an expense", async () => {
  await page.goto("/admin/treasury/manage?q=Platform%20development");
  await page.locator("tbody tr").first().click();
  await expect(page).toHaveURL(/\/admin\/treasury\/[0-9a-f-]{36}$/);
  const amount = page.locator("#treasury-amount");
  const name = page.locator("#treasury-name");

  await amount.fill("12,00.5x");
  await expectNoError(amount);
  await amount.blur();
  await expectError(amount, "Enter an amount like 1200.50.");
  await amount.fill("1200.50");
  await expectNoError(amount);

  await amount.fill("abc");
  await name.fill("");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expectError(name, "Give the entry a name.");
  await expectError(amount, "Enter an amount like 1200.50.");
  await expect(name).toBeFocused();
  await expect(page).toHaveURL(/\/admin\/treasury\/[0-9a-f-]{36}$/);
  await axe();
  await discard();
  await expect(page.locator("#treasury-name")).toHaveValue("Platform development");
});

test("Profile: a new email in the Change email dialog", async () => {
  await page.goto("/admin/profile");
  await page.getByRole("button", { name: "Change email" }).click();
  const dialog = page.getByRole("dialog", { name: "Change email" });
  const email = dialog.getByLabel("New email");
  const current = dialog.getByLabel("Current password");

  await email.fill("owner@example");
  await expectNoError(email);
  await current.focus();
  await expectError(email, "Invalid email address.");
  await axe();
  await email.fill("owner@example.org");
  await expectNoError(email);

  // Submit without the current password: its error, and the focus on it; nothing sent.
  await dialog.getByRole("button", { name: "Change email" }).click();
  await expectError(current, "Enter your current password.");
  await expect(current).toBeFocused();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Accounts: an invitation's sign-up form", async ({ browser }, testInfo) => {
  const made = await page.request.post("/api/admin/invitations", { headers: { origin: new URL(page.url()).origin } });
  expect(made.status()).toBe(201);
  const { invitation, link } = (await made.json()) as { invitation: { id: string }; link: string };
  const visitor = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await visitor.goto(link);
    const email = visitor.locator("#join-email");
    const password = visitor.locator("#join-password");
    await email.fill("new@example");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await password.focus();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(visitor.locator("#join-email-error")).toHaveText("Invalid email address.");
    await axe(visitor);
    await email.fill("new@example.org");
    await expect(visitor.locator("#join-email-error")).toHaveCount(0);

    // Submit with the passwords missing: both errors, the focus on the password; no account is made.
    await visitor.getByRole("button", { name: "Create my account" }).click();
    await expect(visitor.locator("#join-password-error")).toHaveText("Choose a password that meets every rule below.");
    await expect(password).toBeFocused();
    await expect(visitor).toHaveURL(/\/admin\/join/);
    await axe(visitor);
  } finally {
    await visitor.context().close();
    // Leave no pending invitation behind (admin-accounts.spec revokes the first pending one).
    await page.request.post(`/api/admin/invitations/${invitation.id}/revoke`, { headers: { origin: new URL(page.url()).origin } });
  }
});
