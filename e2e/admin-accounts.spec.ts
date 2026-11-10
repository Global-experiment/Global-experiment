import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Accounts, Services, Permissions and Profile settings through the real
 * stack, after Candide's first feedback (Delivery 4, 2026-11-03): a "New
 * invitation link" anyone signs up with, landing on an empty profile with
 * no role (OPS-141); description and expertise on the profile and the
 * account (OPS-144, OPS-135); no note, no People link (OPS-142, OPS-136);
 * service categories as tags, no responsible account (OPS-149, OPS-130);
 * a permission's fields in Candide's order, its name made for it, ONE
 * history event when granted (OPS-148, OPS-138, OPS-151); archive only
 * (OPS-147). At 1440 and 1024, dark and light, with axe; side-by-side
 * Figma comparisons (p15–p18) when FIGMA_PNG_DIR is set.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const SHOTS = "test-results/figma";
mkdirSync(SHOTS, { recursive: true });
const FRAME = { width: 1440, height: 920 };
const TABLET = { width: 1024, height: 768 };
const RUN = Date.now().toString(36);
const NEWCOMER = { email: `newcomer-${RUN}@example.org`, name: `Nina Newcomer ${RUN}`, password: "Quiet rivers keep 4 gardens" };
const PERSON = `Pat Access ${RUN}`;
const SERVICE = `Repo host ${RUN}`;
const OWNER_NAME = E2E_ADMIN.email.split("@")[0]!;
// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

let page: Page;
let inviteLink = "";
const consoleIssues: string[] = [];
const rows = () => page.locator("tbody tr");
const origin = () => new URL(page.url()).origin;
/** The record's property labels, in order, once the record has rendered. */
async function properties(target: Page) {
  const rows = target.locator("[data-record-main] [data-property]");
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-property")));
}

async function axe(target = page) {
  // A record page sets its tab title once the record has loaded: check the page after that.
  await expect.poll(() => target.title()).not.toBe("");
  const scan = async () =>
    (await new AxeBuilder({ page: target }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    );
  let violations = await scan();
  // A view switch is a soft navigation: while it swaps the <title> element, the document has none for a moment.
  // Only when that was all axe saw, and the title is back, scan once more; a page without a title still fails.
  if (violations.length === 1 && violations[0]!.startsWith("document-title:")) {
    await expect.poll(() => target.title()).not.toBe("");
    violations = await scan();
  }
  expect(violations).toEqual([]);
}

/** Dark (the default) and light, each checked with axe and captured. */
async function bothThemes(name: string, target = page) {
  await axe(target);
  await target.screenshot({ path: join(SHOTS, `${name}-dark.png`) });
  await target.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await axe(target);
  await target.screenshot({ path: join(SHOTS, `${name}-light.png`) });
  await target.evaluate(() => document.documentElement.removeAttribute("data-theme"));
}

async function signIn(target: Page, email: string, password: string) {
  await target.goto("/admin/login");
  await target.getByLabel("Email address").fill(email);
  await target.getByLabel("Password", { exact: true }).fill(password);
  await target.getByRole("button", { name: "Sign in" }).click();
}

async function pick(target: Page, picker: string, label: string) {
  const search = target.locator(`[data-relation-picker="${picker}"] input[role=combobox]`);
  await search.fill(label);
  await target.locator(`[data-relation-picker="${picker}"] ul[aria-label$="results"]`).getByRole("button", { name: label, exact: false }).first().click();
  await target.keyboard.press("Escape");
}

async function newContext(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, viewport: FRAME });
  return context.newPage();
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  page = await newContext(browser, testInfo.project.use.baseURL);
  await signIn(page, E2E_ADMIN.email, E2E_ADMIN.password);
  await expect(page.locator("#admin-sidebar")).toBeVisible({ timeout: 60_000 });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      consoleIssues.push(`[${message.type()}] ${new URL(page.url()).pathname} :: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => consoleIssues.push(`[pageerror] ${new URL(page.url()).pathname} :: ${error.message.slice(0, 300)}`));
  const response = await page.request.post("/api/admin/people", { data: { name: PERSON }, headers: { origin: origin() } });
  expect(response.status()).toBe(201);
});

test.afterAll(async () => {
  await page.context().close();
});

test('Accounts (p15): the columns, the views, and "New invitation link" — made at once, shown once, with a copy button (OPS-141)', async () => {
  await page.goto("/admin/accounts");
  await expect(page).toHaveTitle("Accounts");
  // Description in place of Note (OPS-142, OPS-144).
  await expect(page.locator("thead th")).toContainText(["Name", "Role", "Email", "Description", "Expertise", "Permissions"]);
  await expect(page.locator("thead th").filter({ hasText: /^Note$/ })).toHaveCount(0);
  const views = page.getByRole("group", { name: "Views" });
  for (const view of ["All", "Active", "No role", "Deactivated"]) await expect(views.getByRole("button", { name: view, exact: true })).toBeVisible();
  await expect(rows().filter({ hasText: E2E_ADMIN.email })).toContainText("Rootadmin");
  await expect(page.getByRole("button", { name: "New account" })).toHaveCount(0);

  await page.getByRole("button", { name: "New invitation link" }).click();
  const dialog = page.getByRole("dialog", { name: "New invitation link" });
  // No field to fill: the link is there.
  await expect(dialog.getByRole("textbox")).toHaveCount(1);
  const link = dialog.getByRole("textbox", { name: "Invitation link" });
  await expect(link).toHaveValue(/\/admin\/join#[A-Za-z0-9_-]{43}$/);
  inviteLink = await link.inputValue();
  await expect(dialog).toContainText("Shown only now");
  await expect(dialog.getByRole("button", { name: "Copy" })).toBeVisible();
  await axe();
  await page.screenshot({ path: join(SHOTS, "ops141-new-invitation-link-1440.png") });
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await expect(rows().first()).toBeVisible();
    await bothThemes(`accounts-p15-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);
});

test("whoever opens the invitation link makes an account (email + password), lands on an empty profile with no role, and fills in description and expertise (OPS-141, OPS-144, OPS-135)", async ({
  browser,
}, testInfo) => {
  const newcomer = await newContext(browser, testInfo.project.use.baseURL);
  await newcomer.goto(inviteLink);
  await expect(newcomer.getByRole("heading", { name: "Join the Global experiment" })).toBeVisible();
  // The token leaves the address bar at once.
  await expect.poll(() => new URL(newcomer.url()).hash).toBe("");
  await newcomer.getByLabel("Email address").fill(NEWCOMER.email);
  await newcomer.getByLabel("Password", { exact: true }).fill("short");
  await expect(newcomer.locator('[data-rule="length"]')).toHaveAttribute("data-met", "false");
  await newcomer.getByLabel("Password", { exact: true }).fill(NEWCOMER.password);
  await newcomer.getByLabel("Repeat the password").fill(NEWCOMER.password);
  await axe(newcomer);
  await newcomer.screenshot({ path: join(SHOTS, "ops141-join-1440-dark.png") });
  await newcomer.getByRole("button", { name: "Create my account" }).click();

  // Signed in, on an empty profile; no role, so no module with data in the menu.
  await expect(newcomer).toHaveURL(/\/admin\/profile$/, { timeout: 30_000 });
  await expect(newcomer.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  await expect(newcomer.getByLabel("Display name")).toHaveValue("");
  await expect(newcomer.getByLabel("Description")).toHaveValue("");
  await expect(newcomer.locator("[data-record-main]")).toContainText("No role");
  await expect(newcomer.getByRole("navigation", { name: "Admin" }).getByRole("link")).toHaveCount(0);
  await newcomer.screenshot({ path: join(SHOTS, "ops141-empty-profile-1440-dark.png") });

  // OPS-144 and OPS-135: the holder sets their description and expertise.
  await newcomer.getByLabel("Display name").fill(NEWCOMER.name);
  await newcomer.getByLabel("Description").fill("Facilitates the citizen assemblies.");
  await pick(newcomer, "expertise", "Interaction design");
  await axe(newcomer);
  await newcomer.getByRole("button", { name: "Save changes" }).click();
  await expect(newcomer.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
  await newcomer.reload();
  await expect(newcomer.getByLabel("Description")).toHaveValue("Facilitates the citizen assemblies.");
  await expect(newcomer.getByRole("button", { name: "Remove Interaction design" })).toBeVisible();
  await bothThemes("ops144-ops135-profile-1440", newcomer);
  await newcomer.context().close();

  // The link worked once.
  const again = await newContext(browser, testInfo.project.use.baseURL);
  await again.goto(inviteLink);
  await expect(again.locator("main").getByRole("alert")).toHaveText("This link has expired or was already used.");
  await again.context().close();
});

test("Invitation links: the used one names its account; a pending one is revoked and stops working (OPS-141)", async ({ browser }, testInfo) => {
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "New invitation link" }).click();
  const made = page.getByRole("dialog", { name: "New invitation link" });
  const spare = await made.getByRole("textbox", { name: "Invitation link" }).inputValue();
  await made.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Invitation links" }).click();
  const list = page.getByRole("dialog", { name: "Invitation links" });
  await expect(list.locator("[data-invitation=used]").first()).toContainText(NEWCOMER.name);
  // The list never shows a link again.
  await expect(list).not.toContainText("/admin/join#");
  await list
    .locator("[data-invitation=pending]")
    .first()
    .getByRole("button", { name: /^Revoke/ })
    .click();
  await expect(list.locator("[data-invitation=revoked]").first()).toBeVisible();
  await axe();
  await page.screenshot({ path: join(SHOTS, "ops141-invitation-links-1440.png") });
  await list.getByRole("button", { name: "Close" }).click();

  const visitor = await newContext(browser, testInfo.project.use.baseURL);
  await visitor.goto(spare);
  await expect(visitor.locator("main").getByRole("alert")).toHaveText("This link has expired or was already used.");
  await visitor.context().close();
});

test("a Rootadmin gives the new account a role, edits its description and expertise; no Note, no Person (OPS-141, OPS-144, OPS-135, OPS-142, OPS-136)", async ({
  browser,
}, testInfo) => {
  await page.goto("/admin/accounts?view=no_role");
  await page.getByRole("group", { name: "Views" }).getByRole("button", { name: "No role", exact: true }).click();
  await rows().filter({ hasText: NEWCOMER.email }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/accounts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEWCOMER.name);
  const fields = await properties(page);
  expect(fields).toEqual(expect.arrayContaining(["Role", "Description", "Expertise", "Service access"]));
  expect(fields).not.toContain("Note");
  expect(fields).not.toContain("Person");
  await expect(page.getByLabel("Description")).toHaveValue("Facilitates the citizen assemblies.");
  await page.getByLabel("Description").fill("Facilitates the citizen assemblies and the follow-ups.");
  await pick(page, "expertise", "UX research");
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Moderator" }).click();
  await axe();
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Account updated" })).toBeVisible();
  await page.goto(`/admin/accounts?q=${encodeURIComponent(NEWCOMER.email)}`);
  await expect(rows().first()).toContainText("Moderator");
  await expect(rows().first()).toContainText("and the follow-ups");
  await rows().first().getByRole("link").first().click();
  await bothThemes("ops144-account-record-1440");

  // The role applies at the next sign-in: the Moderator's menu.
  const newcomer = await newContext(browser, testInfo.project.use.baseURL);
  await signIn(newcomer, NEWCOMER.email, NEWCOMER.password);
  const menu = newcomer.locator("#admin-sidebar nav");
  await expect(menu).toBeVisible({ timeout: 60_000 });
  for (const shown of ["people", "history"]) await expect(menu.locator(`li[data-module=${shown}]`), shown).toHaveCount(1);
  for (const hidden of ["accounts", "services"]) await expect(menu.locator(`li[data-module=${hidden}]`), hidden).toHaveCount(0);
  await newcomer.context().close();
});

test("Services (p16): categories as tags, no responsible account; archive, never delete (OPS-149, OPS-130, OPS-147)", async () => {
  await page.goto("/admin/services");
  await page.getByRole("button", { name: "New service" }).click();
  await page.locator("#new-service-name").fill(SERVICE);
  await page.getByRole("dialog", { name: "New service" }).getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/admin\/services\/[0-9a-f-]{36}$/);
  expect(await properties(page)).not.toContain("Responsible account");
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Needs confirmation" }).click();
  await pick(page, "category", "Source code");
  await pick(page, "category", "Hosting");
  await page.getByRole("group", { name: "Hosting model" }).getByRole("button", { name: "External service" }).click();
  await page.locator("#service-url").fill("github.com/Global-experiment");
  // The tab shows the record's name once it has loaded (axe checks the page has a title).
  await expect(page).toHaveTitle(SERVICE);
  await axe();
  await page.screenshot({ path: join(SHOTS, "ops149-service-categories-1440.png") });
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page).toHaveURL(/\/admin\/services(\?|$)/);

  const views = page.getByRole("group", { name: "Views" });
  for (const view of ["All services", "Active services", "Access review"]) await expect(views.getByRole("button", { name: view })).toBeVisible();
  await expect(page.locator("thead th")).toContainText(["Name", "Service ID", "Status", "Category", "Hosting model", "Permissions"]);
  await expect(page.locator("thead th").filter({ hasText: "Responsible account" })).toHaveCount(0);
  await expect(rows().filter({ hasText: SERVICE })).toContainText("Source code");
  await expect(rows().filter({ hasText: SERVICE })).toContainText("Hosting");
  await views.getByRole("button", { name: "Access review" }).click();
  await expect(rows().filter({ hasText: SERVICE })).toHaveCount(1);
  await views.getByRole("button", { name: "All services" }).click();
  await expect(page).toHaveTitle("Services");
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await expect(rows().first()).toBeVisible();
    await bothThemes(`services-p16-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);

  // OPS-147: More options has Archive, not Delete permanently.
  await rows().filter({ hasText: SERVICE }).getByRole("link").first().click();
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
  await page.getByRole("button", { name: "More options" }).click();
});

test("Permissions (p17): Candide's field order, a name made from service / account / level, ONE history event when granted (OPS-148, OPS-138, OPS-151)", async () => {
  await page.goto(`/admin/services?q=${encodeURIComponent(SERVICE)}`);
  await rows().filter({ hasText: SERVICE }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/services\/[0-9a-f-]{36}$/);
  const serviceUrl = page.url();
  await page.getByRole("link", { name: "Add a permission" }).click();
  await expect(page).toHaveURL(/\/admin\/permissions\/new\?service=/);
  expect(await properties(page)).toEqual(["Service", "Account", "Permission level", "Status", "Scope", "Granted", "Revoked", "Expired", "People", "Name"]);
  await expect(page.locator('[data-relation-picker="service"]')).toContainText(SERVICE);
  await pick(page, "account", OWNER_NAME);
  await pick(page, "people", PERSON);
  await page.getByRole("group", { name: "Permission level" }).getByRole("button", { name: "admin", exact: true }).click();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Needs confirmation" }).click();
  await page.locator("#grant-scope").fill("The organization's repositories");
  // The name is made, not typed.
  await expect(page.locator('[data-property="Name"]')).toContainText(`${SERVICE} / ${OWNER_NAME} / Admin`);
  await expect(page.locator("#grant-name")).toHaveCount(0);
  await axe();
  await page.screenshot({ path: join(SHOTS, "ops148-permission-new-1440.png") });
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page).toHaveURL(/\/admin\/permissions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${SERVICE} / ${OWNER_NAME} / Admin`);

  // One event, the same on the permission, its service, its account and its person.
  const sentence = `granted ${OWNER_NAME} Admin on ${SERVICE}`;
  const history = page.locator("[data-record-panel]");
  await expect(history.locator("[data-history-item]").filter({ hasNotText: "viewed" })).toHaveCount(1);
  await expect(history).toContainText(sentence);
  await bothThemes("ops148-permission-record-1440");
  await page.goto(serviceUrl);
  await expect(page.locator("[data-record-panel]")).toContainText(sentence);
  await page.goto(`/admin/people?q=${encodeURIComponent(PERSON)}`);
  await rows().first().getByRole("link").first().click();
  await expect(page.locator("[data-record-panel]")).toContainText(sentence);
  await page.goto("/admin/history");
  await expect(page.locator("[data-history-item=access_granted]").first()).toContainText(`granted ${OWNER_NAME} Admin on`);
  await expect(page.locator("[data-history-item=access_granted]").first().locator("[data-history-subject]")).toHaveText(SERVICE);
  await page.screenshot({ path: join(SHOTS, "ops151-history-1440.png") });

  // A new level renames it.
  await page.goto(`/admin/permissions?q=${encodeURIComponent(SERVICE)}`);
  await rows().filter({ hasText: SERVICE }).getByRole("link").first().click();
  await page.getByRole("group", { name: "Permission level" }).getByRole("button", { name: "write", exact: true }).click();
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Permission updated" })).toBeVisible();

  await page.goto("/admin/permissions");
  const views = page.getByRole("group", { name: "Views" });
  for (const view of ["All permissions", "Active permissions", "Review queue"]) await expect(views.getByRole("button", { name: view })).toBeVisible();
  // The same labels in the table (OPS-148).
  await expect(page.locator("thead th")).toContainText(["Name", "ID", "Account", "Service", "Permission level", "Status", "Scope"]);
  await expect(page.locator("thead th").filter({ hasText: "Resource scope" })).toHaveCount(0);
  await views.getByRole("button", { name: "Review queue" }).click();
  await expect(rows().filter({ hasText: `${SERVICE} / ${OWNER_NAME} / Write` })).toHaveCount(1);
  await expect(page).toHaveTitle("Permissions");
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await expect(rows().first()).toBeVisible();
    await bothThemes(`permissions-p17-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);

  // OPS-147: archived, never deleted.
  await rows().filter({ hasText: SERVICE }).getByRole("link").first().click();
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await page.getByRole("button", { name: "More options" }).click();
});

test("Profile settings (p18): display name, description, expertise, appearance (saved and applied), time zone, picture, Account ID read-only", async () => {
  await page.goto("/admin/profile");
  await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  await expect(page.locator("[data-record-main]")).toContainText(/GE-\d{6}/);
  await expect(page.locator("[data-record-main]")).toContainText("Read only.");
  expect(await properties(page)).toEqual(
    expect.arrayContaining(["Display name", "Description", "Expertise", "Profile picture", "Time zone", "Appearance", "Email", "Account ID"]),
  );
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  const panel = page.locator("[data-record-panel]");
  for (const action of ["Close", "Discard changes", "Change email", "Change password", "Sign out", "Deactivate account"])
    await expect(panel.getByRole("button", { name: action })).toBeVisible();
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await bothThemes(`profile-p18-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);

  await page.getByLabel("Display name").fill("E2E Rootadmin");
  await page.getByLabel("Time zone").selectOption("Europe/Zurich");
  await page.getByRole("group", { name: "Appearance" }).getByRole("button", { name: "Light" }).click();
  // Previewed at once…
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
  await expect(page.locator("[data-user-name]")).toHaveText("E2E Rootadmin");
  // …and kept: on every page, after a reload.
  await page.goto("/admin/people");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/admin/profile");
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/Zurich");

  await page.locator("#profile-picture").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("status").filter({ hasText: "Profile picture updated" })).toBeVisible();
  await expect(page.locator("#admin-sidebar img")).toHaveAttribute("src", /\/api\/admin\/accounts\/[0-9a-f-]{36}\/picture/);
  await page.screenshot({ path: join(SHOTS, "profile-p18-saved-light.png") });
  await page.getByRole("button", { name: "Collapse menu" }).click();
  const collapsedPicture = page.locator('[data-sidebar="collapsed"] #admin-sidebar img');
  await expect(collapsedPicture).toBeVisible();
  await expect(collapsedPicture).toHaveAttribute("width", "24");
  await page.getByRole("button", { name: "Expand menu" }).click();

  // Back to the defaults (the display name renames the owner's permissions back too).
  await page.getByLabel("Display name").fill("");
  await page.getByRole("group", { name: "Appearance" }).getByRole("button", { name: "System" }).click();
  await page.getByLabel("Time zone").selectOption("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile picture removed" })).toBeVisible();
  // Archive-only (ADR 017): the removed picture is kept and can be used again.
  const previous = page.getByRole("list", { name: "Previous pictures" });
  await previous.getByRole("button", { name: "Use this picture again" }).first().click();
  await expect(page.locator("#admin-sidebar img")).toHaveAttribute("src", /\/api\/admin\/accounts\/[0-9a-f-]{36}\/picture/);
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile picture removed" }).last()).toBeVisible();
});

test("a password reset link from the account, used on /admin/reset-password", async ({ browser }, testInfo) => {
  await page.goto(`/admin/accounts?q=${encodeURIComponent(NEWCOMER.email)}`);
  await rows().first().getByRole("link").first().click();
  await page.getByRole("button", { name: "New password reset link" }).click();
  const link = page.getByRole("textbox", { name: /password reset link/ });
  await expect(link).toHaveValue(/\/admin\/reset-password#[A-Za-z0-9_-]{43}$/);
  const resetLink = await link.inputValue();
  await expect(page.locator("[data-record-panel]")).toContainText("created a one-time link");

  const other = await newContext(browser, testInfo.project.use.baseURL);
  await other.goto(resetLink);
  await expect(other.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await other.getByLabel("New password", { exact: true }).fill("Seven calm harbours at 9pm");
  await other.getByLabel("Repeat the new password").fill("Seven calm harbours at 9pm");
  await axe(other);
  await other.getByRole("button", { name: "Change my password" }).click();
  await expect(other.locator("main").getByRole("status")).toContainText("Your password is changed.");
  await signIn(other, NEWCOMER.email, "Seven calm harbours at 9pm");
  await expect(other.locator("#admin-sidebar")).toBeVisible({ timeout: 60_000 });
  await other.context().close();
});

test("side by side with Figma p15–p18", async () => {
  const figmaDir = process.env.FIGMA_PNG_DIR;
  test.skip(!figmaDir, "Set FIGMA_PNG_DIR to the PNG renders of admin-desktop.pdf (pN.png).");
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const compare = await page.context().newPage();
  await compare.setViewportSize({ width: 2 * 1440 + 24, height: 920 + 40 });
  for (const [shot, frame] of [
    ["accounts-p15-1440-dark", "p15"],
    ["services-p16-1440-dark", "p16"],
    ["permissions-p17-1440-dark", "p17"],
    ["profile-p18-1440-dark", "p18"],
  ] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await compare.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App</figcaption><img src="${data(app)}" width="1440" height="920"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma ${frame.toUpperCase()}</figcaption>
          <div style="width:1440px;height:920px;overflow:hidden"><img src="${data(figma)}" width="1440" height="1024" style="margin-top:-104px"></div></figure>
      </div></body>`);
    await compare.screenshot({ path: join(SHOTS, `compare-${frame}.png`) });
  }
  await compare.close();
});

test("no console errors or warnings on any of the pages above", async () => {
  expect(consoleIssues).toEqual([]);
});
