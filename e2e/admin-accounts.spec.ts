import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Delivery 2 through the real stack: Accounts (p15) with an invitation the
 * invitee accepts on /admin/welcome, a role's menu, Services (p16) and
 * Permissions (p17) with their views and the access history on the
 * person, Profile settings (p18) with the appearance, the time zone and a
 * picture, and a password reset link — at 1440 and 1024, dark and light,
 * with axe. Side-by-side Figma comparisons when FIGMA_PNG_DIR is set.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const SHOTS = "test-results/figma";
mkdirSync(SHOTS, { recursive: true });
const FRAME = { width: 1440, height: 920 };
const TABLET = { width: 1024, height: 768 };
const RUN = Date.now().toString(36);
const INVITEE = { email: `moderator-${RUN}@example.org`, name: `Mona Moderator ${RUN}`, password: "Quiet rivers keep 4 gardens" };
const PERSON = `Pat Access ${RUN}`;
const SERVICE = `Repo host ${RUN}`;
// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

let page: Page;
let inviteLink = "";
const consoleIssues: string[] = [];
const rows = () => page.locator("tbody tr");
const origin = () => new URL(page.url()).origin;

async function axe(target = page) {
  const results = await new AxeBuilder({ page: target }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Dark (the default) and light, each checked with axe and captured. */
async function bothThemes(name: string) {
  await axe();
  await page.screenshot({ path: join(SHOTS, `${name}-dark.png`) });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await axe();
  await page.screenshot({ path: join(SHOTS, `${name}-light.png`) });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
}

async function signIn(target: Page, email: string, password: string) {
  await target.goto("/admin/login");
  await target.getByLabel("Email address").fill(email);
  await target.getByLabel("Password", { exact: true }).fill(password);
  await target.getByRole("button", { name: "Sign in" }).click();
}

async function pick(picker: string, label: string) {
  const search = page.locator(`[data-relation-picker="${picker}"] input[role=combobox]`);
  await search.fill(label);
  await page.locator(`[data-relation-picker="${picker}"] ul[aria-label$="results"]`).getByRole("button", { name: label, exact: false }).first().click();
  await page.keyboard.press("Escape");
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
    if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`[${message.type()}] ${new URL(page.url()).pathname} :: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => consoleIssues.push(`[pageerror] ${new URL(page.url()).pathname} :: ${error.message.slice(0, 300)}`));
  const response = await page.request.post("/api/admin/people", { data: { name: PERSON }, headers: { origin: origin() } });
  expect(response.status()).toBe(201);
});

test.afterAll(async () => {
  await page.context().close();
});

test("Accounts (p15): the columns, the four views, and New account → a one-time link shown once", async () => {
  await page.goto("/admin/accounts");
  await expect(page).toHaveTitle("Accounts");
  await expect(page.locator("thead th")).toContainText(["Name", "Role", "Email", "Note", "Expertise", "Permissions"]);
  const views = page.getByRole("group", { name: "Views" });
  for (const view of ["All", "Active", "Invited", "Deactivated"]) await expect(views.getByRole("button", { name: view, exact: true })).toBeVisible();
  await expect(rows().filter({ hasText: E2E_ADMIN.email })).toContainText("Rootadmin");

  await page.getByRole("button", { name: "New account" }).click();
  const dialog = page.getByRole("dialog", { name: "New account" });
  await dialog.getByLabel("Email").fill(INVITEE.email);
  await dialog.getByLabel("Name").fill(INVITEE.name);
  await dialog.getByRole("group", { name: "Role" }).getByRole("button", { name: "Moderator" }).click();
  await dialog.getByLabel("Note").fill("Moderates the feedback");
  await axe();
  await dialog.getByRole("button", { name: "Create the invitation link" }).click();
  const link = dialog.getByRole("textbox", { name: /invitation link/ });
  await expect(link).toHaveValue(/\/admin\/welcome#[A-Za-z0-9_-]{43}$/);
  inviteLink = await link.inputValue();
  await expect(dialog).toContainText("Shown only now");
  await axe();
  await dialog.getByRole("button", { name: "Done" }).click();

  await views.getByRole("button", { name: "Invited", exact: true }).click();
  await expect(rows()).toHaveCount(1);
  await expect(rows().first()).toContainText(INVITEE.name);
  await views.getByRole("button", { name: "Active", exact: true }).click();
  await expect(rows().filter({ hasText: INVITEE.email })).toHaveCount(0);
  await views.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/accounts$/);
  await expect(page).toHaveTitle("Accounts");
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await expect(rows().first()).toBeVisible();
    await bothThemes(`accounts-p15-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);
});

test("an account opens view-only details; its history shows the invitation and the link (never the link itself)", async () => {
  await page.goto("/admin/accounts?view=&filter=status%3Ais%3Ainvited");
  await rows().filter({ hasText: INVITEE.name }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/accounts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(INVITEE.name);
  await expect(page.locator("[data-record-main]")).toContainText("Invitation link waiting");
  await expect(page.locator("[data-record-main]")).toContainText(INVITEE.email);
  const history = page.locator("[data-record-panel]");
  await expect(history).toContainText("invited this account");
  await expect(history).toContainText("Role: Moderator.");
  await expect(history).not.toContainText("#");
  await bothThemes("account-record-1440");
});

test("the invitee sets a password that meets the rules (live checklist), then signs in; the link works once", async ({ browser }, testInfo) => {
  const invitee = await newContext(browser, testInfo.project.use.baseURL);
  await invitee.goto(inviteLink);
  await expect(invitee.getByRole("heading", { name: "Welcome to the Global experiment" })).toBeVisible();
  // The token leaves the address bar at once.
  await expect.poll(() => new URL(invitee.url()).hash).toBe("");
  await expect(invitee.locator("main")).toContainText(INVITEE.email);
  const newPassword = invitee.getByLabel("New password", { exact: true });
  await newPassword.fill("short");
  await expect(invitee.locator('[data-rule="length"]')).toHaveAttribute("data-met", "false");
  await newPassword.fill("mona moderator was here");
  await expect(invitee.locator('[data-rule="length"]')).toHaveAttribute("data-met", "true");
  await newPassword.fill(INVITEE.password);
  for (const rule of ["length", "mix", "personal", "repeat", "common"]) await expect(invitee.locator(`[data-rule="${rule}"]`)).toHaveAttribute("data-met", "true");
  await invitee.getByLabel("Repeat the new password").fill(INVITEE.password);
  await axe(invitee);
  await invitee.screenshot({ path: join(SHOTS, "welcome-1440-dark.png") });
  await invitee.getByRole("button", { name: "Set my password" }).click();
  await expect(invitee.locator("main").getByRole("status")).toContainText("Your account is ready.");

  // The same link again (a fresh page load): refused, in one sentence.
  await invitee.goto("/admin/login");
  await invitee.goto(inviteLink);
  await expect(invitee.locator("main").getByRole("alert")).toHaveText("This link has expired or was already used.");

  // A Moderator sees only what the role can read.
  await signIn(invitee, INVITEE.email, INVITEE.password);
  await expect(invitee.locator("#admin-sidebar nav")).toBeVisible({ timeout: 60_000 });
  const menu = invitee.locator("#admin-sidebar nav");
  for (const hidden of ["treasury", "services", "permissions", "accounts"]) await expect(menu.locator(`li[data-module=${hidden}]`), hidden).toHaveCount(0);
  for (const shown of ["people", "history", "expertise"]) await expect(menu.locator(`li[data-module=${shown}]`), shown).toHaveCount(1);
  await invitee.goto("/admin/people");
  await expect(invitee.getByRole("button", { name: "New person" })).toHaveCount(0);
  await expect(invitee.getByRole("link", { name: "Import Notion" })).toHaveCount(0);
  await invitee.context().close();
});

test("Services (p16): New service, its record, and the views All services / Active services / Access review", async () => {
  await page.goto("/admin/services");
  await page.getByRole("button", { name: "New service" }).click();
  await page.locator("#new-service-name").fill(SERVICE);
  await page.getByRole("dialog", { name: "New service" }).getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/admin\/services\/[0-9a-f-]{36}$/);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Needs confirmation" }).click();
  await page.getByRole("group", { name: "Category" }).getByRole("button", { name: "Source code" }).click();
  await page.getByRole("group", { name: "Hosting model" }).getByRole("button", { name: "External service" }).click();
  await page.locator("#service-url").fill("github.com/Global-experiment");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page).toHaveURL(/\/admin\/services(\?|$)/);

  const views = page.getByRole("group", { name: "Views" });
  for (const view of ["All services", "Active services", "Access review"]) await expect(views.getByRole("button", { name: view })).toBeVisible();
  await expect(page.locator("thead th")).toContainText(["Name", "Service ID", "Status", "Category", "Hosting model", "Responsible account", "Permissions"]);
  await views.getByRole("button", { name: "Access review" }).click();
  await expect(rows().filter({ hasText: SERVICE })).toHaveCount(1);
  await views.getByRole("button", { name: "Active services" }).click();
  await expect(rows().filter({ hasText: SERVICE })).toHaveCount(0);
  await views.getByRole("button", { name: "All services" }).click();
  await expect(page).toHaveURL(/\/admin\/services$/);
  await expect(page).toHaveTitle("Services");
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await expect(rows().first()).toBeVisible();
    await bothThemes(`services-p16-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);
});

test("Permissions (p17): a permission from the service, the Review queue, and granted / changed access in the person's history", async () => {
  await page.goto(`/admin/services?search=${encodeURIComponent(SERVICE)}`);
  await rows().filter({ hasText: SERVICE }).getByRole("link").first().click();
  await page.getByRole("link", { name: "Add a permission" }).click();
  await expect(page).toHaveURL(/\/admin\/permissions\/new\?service=/);
  await expect(page.locator('[data-relation-picker="service"]')).toContainText(SERVICE);
  await pick("person", PERSON);
  await page.getByRole("group", { name: "Permission level" }).getByRole("button", { name: "admin", exact: true }).click();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Needs confirmation" }).click();
  await page.locator("#grant-scope").fill("The organization's repositories");
  await axe();
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page).toHaveURL(/\/admin\/permissions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${SERVICE} / admin`);
  await expect(page.locator("[data-record-panel]")).toContainText("created this permission");
  // Changed: the level.
  await page.getByRole("group", { name: "Permission level" }).getByRole("button", { name: "write", exact: true }).click();
  await page.getByRole("button", { name: "Submit changes" }).click();
  // Back to where the permission was opened from (the service), with the toast.
  await expect(page.getByRole("status").filter({ hasText: "Permission updated" })).toBeVisible();

  await page.goto("/admin/permissions");
  const views = page.getByRole("group", { name: "Views" });
  for (const view of ["All permissions", "Active permissions", "Review queue"]) await expect(views.getByRole("button", { name: view })).toBeVisible();
  await expect(page.locator("thead th")).toContainText(["Name", "ID", "Account", "Service", "Permission level", "Status", "Resource scope"]);
  await views.getByRole("button", { name: "Review queue" }).click();
  await expect(rows().filter({ hasText: `${SERVICE} / write` })).toHaveCount(1);
  await expect(rows().filter({ hasText: `${SERVICE} / write` })).toContainText(PERSON);
  await expect(page).toHaveTitle("Permissions");
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await expect(rows().first()).toBeVisible();
    await bothThemes(`permissions-p17-${viewport.width}`);
  }
  await page.setViewportSize(FRAME);

  // The person: the Permissions chip, and granted then changed access in the history.
  await page.goto(`/admin/people?search=${encodeURIComponent(PERSON)}`);
  await rows().first().getByRole("link").first().click();
  await expect(page.getByRole("link", { name: `${SERVICE} · write` })).toBeVisible();
  const history = page.locator("[data-record-panel]");
  await expect(history).toContainText("changed access");
  await expect(history).toContainText("granted access");
  await page.screenshot({ path: join(SHOTS, "person-permissions-1440.png") });
});

test("Profile settings (p18): display name, appearance (saved and applied), time zone, picture, Account ID read-only", async () => {
  await page.goto("/admin/profile");
  await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  await expect(page.locator("[data-record-main]")).toContainText(/GE-\d{6}/);
  await expect(page.locator("[data-record-main]")).toContainText("Read only.");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  const panel = page.locator("[data-record-panel]");
  for (const action of ["Close", "Discard changes", "Change email", "Change password", "Sign out", "Deactivate account"]) await expect(panel.getByRole("button", { name: action })).toBeVisible();
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

  // Back to the defaults.
  await page.getByLabel("Display name").fill("");
  await page.getByRole("group", { name: "Appearance" }).getByRole("button", { name: "System" }).click();
  await page.getByLabel("Time zone").selectOption("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile picture removed" })).toBeVisible();
});

test("a password reset link from the account, used on /admin/reset-password", async ({ browser }, testInfo) => {
  await page.goto("/admin/accounts?filter=status%3Ais%3Aactive");
  await rows().filter({ hasText: INVITEE.name }).getByRole("link").first().click();
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
  await signIn(other, INVITEE.email, "Seven calm harbours at 9pm");
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
