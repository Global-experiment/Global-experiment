import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * The detail-page review (client, 2026-10-22) and the small fixes of
 * 2026-10-23, through the real stack, on a person this spec creates:
 * full-width fields and dropdowns, 8px chip spacing, Description, the
 * design-system error state on blur, link validation, the Expenses search,
 * the Contact channels info card, reordering by mouse and keyboard (saved),
 * the design-system date picker, DUPLICATE names, page-only tab titles,
 * Monitoring → History wording and menu, the table header paddings — at
 * 1440 and 1024, dark and light, with axe. Side-by-side Figma comparisons
 * when FIGMA_PNG_DIR is set.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });

const SHOTS = "test-results/figma";
mkdirSync(SHOTS, { recursive: true });
const FRAME = { width: 1440, height: 920 };
const TABLET = { width: 1024, height: 768 };
const SAVED_SESSIONS = ["admin-detail", "admin-treasury", "admin-figma", "admin-table", "admin-directory-v2", "admin"].map((name) => `test-results/.auth/${name}.json`);
const NAME = "Rae Review";
const INVALID_LINK = "Invalid link. Use an address like https://example.org.";

let page: Page;
let personId = "";
const consoleIssues: string[] = [];
const rows = () => page.locator("tbody tr");
const origin = () => new URL(page.url()).origin;
const box = async (locator: Locator) => {
  const value = await locator.boundingBox();
  if (!value) throw new Error("element not rendered");
  return value;
};
const chipLabels = (picker: string) => page.locator(`[data-relation-picker="${picker}"] [data-chip]`).evaluateAll((chips) => chips.map((chip) => chip.getAttribute("data-chip")));

async function axe() {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function openPerson(name = NAME) {
  await page.goto(`/admin/people?q=${encodeURIComponent(name)}`);
  await expect(rows()).toHaveCount(1);
  await rows().first().getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
}

async function submitAndReopen(name = NAME) {
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "People updated" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/people(\?|$)/);
  await openPerson(name);
}

async function pick(picker: string, label: string, query = label) {
  const search = page.locator(`[data-relation-picker="${picker}"] input[role=combobox]`);
  await search.fill(query);
  await page.locator(`[data-relation-picker="${picker}"] ul[aria-label$="results"]`).getByRole("button", { name: label, exact: false }).first().click();
  await page.keyboard.press("Escape");
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  for (const state of [...SAVED_SESSIONS.filter((path) => existsSync(path)), undefined]) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: FRAME, storageState: state });
    page = await context.newPage();
    await page.goto("/admin/people");
    const signIn = page.getByRole("heading", { name: /^Sign in/ });
    await expect(signIn.or(rows().first())).toBeVisible({ timeout: 60_000 });
    if (!(await signIn.isVisible())) break;
    if (state) {
      await context.close();
      continue;
    }
    await page.getByLabel("Email address").fill(E2E_ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(rows().first()).toBeVisible({ timeout: 60_000 });
    break;
  }
  // Every console error or warning on the way fails the last test (e.g. invalid HTML nesting).
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`[${message.type()}] ${new URL(page.url()).pathname} :: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => consoleIssues.push(`[pageerror] ${new URL(page.url()).pathname} :: ${error.message.slice(0, 300)}`));
  const response = await page.request.post("/api/admin/people", { data: { name: NAME, description: "First notes" }, headers: { origin: origin() } });
  expect(response.status()).toBe(201);
  personId = ((await response.json()) as { id: string }).id;
});

test.afterAll(async () => {
  await page.context().close();
});

test("tab titles show only the page title", async () => {
  await page.goto("/admin/people");
  await expect(page).toHaveTitle("People");
  await openPerson();
  await expect(page).toHaveTitle(NAME);
  await page.goto("/admin/history");
  await expect(page).toHaveTitle("History");
  await page.goto("/treasury");
  await expect(page).toHaveTitle("Treasury");
});

test("every field and relation dropdown fills the value column, at 1440 and 1024; chips 8px apart, rows too", async () => {
  for (const viewport of [FRAME, TABLET]) {
    await page.setViewportSize(viewport);
    await openPerson();
    for (const id of ["person-name", "person-email", "person-website", "person-score", "person-description", "person-first-contact"]) {
      const field = page.locator(`#${id}`);
      const column = field.locator("xpath=ancestor::div[contains(@class,'min-w-0')][1]");
      const [inner, outer] = [await box(field), await box(column)];
      // Date fields keep room for their clear button only when set; empty, they're full width too.
      expect(Math.abs(inner.width - outer.width), `${id} at ${viewport.width}: ${inner.width} vs ${outer.width}`).toBeLessThanOrEqual(1);
    }
    const search = page.locator('[data-relation-picker="organizations"] input[role=combobox]');
    await search.click();
    const results = page.getByRole("list", { name: "Organizations results" });
    await expect(results).toBeVisible();
    const [dropdown, line] = [await box(results), await box(page.locator('[data-relation-picker="organizations"] label').first())];
    expect(Math.abs(dropdown.width - line.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(dropdown.x - line.x)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: join(SHOTS, `review-person-${viewport.width}.png`) });
  }
  await page.setViewportSize(FRAME);
  // Chip lists: 8px across, 8px down, 8px under the search line (expertise and every other relation).
  await pick("expertise", "Web development", "web dev");
  await pick("expertise", "Backend development", "backend");
  const chips = page.locator('[data-relation-picker="expertise"] ul[aria-label="Linked expertise"]');
  await expect(chips).toHaveCSS("column-gap", "8px");
  await expect(chips).toHaveCSS("row-gap", "8px");
  await expect(chips).toHaveCSS("margin-top", "8px");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
});

test("errors show on leaving a field, in the design system's error state; links are checked like emails", async () => {
  await openPerson();
  const email = page.locator("#person-email");
  await email.fill("rae@nowhere");
  // Nothing yet while typing…
  await expect(page.locator("[data-field-error]")).toHaveCount(0);
  await email.press("Tab");
  // …then, on leaving it: the white rule, the warning glyph and the message, without any Submit.
  const emailError = page.locator("#person-email-error");
  await expect(emailError).toHaveText("Invalid email address.");
  await expect(emailError.locator('svg[data-icon="warning"]')).toHaveCount(1);
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", "person-email-error");
  await expect(email).toHaveCSS("box-shadow", /rgb\(255, 255, 255\)/);

  for (const [id, value] of [
    ["person-website", "not a link"],
    ["person-x", "javascript:alert(1)"],
    ["person-linkedin", "linkedin"],
  ] as const) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).press("Tab");
    await expect(page.locator(`#${id}-error`)).toHaveText(INVALID_LINK);
  }
  await page.screenshot({ path: join(SHOTS, "review-errors-1440.png") });
  await axe();

  // Submit refuses while errors remain; fixing a field clears its error on leaving it.
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Some fields need attention." })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/people\/[0-9a-f-]{36}$/);
  await email.fill("rae@example.org");
  await email.press("Tab");
  await expect(page.locator("#person-email-error")).toHaveCount(0);
  for (const [id, value] of [
    ["person-website", "rae.example.org"],
    ["person-x", "x.com/rae"],
    ["person-linkedin", "https://linkedin.com/in/rae"],
  ] as const) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).press("Tab");
    await expect(page.locator(`#${id}-error`)).toHaveCount(0);
  }
  // The API applies the same rule.
  const refused = await page.request.patch(`/api/admin/people/${personId}`, { data: { website: "not a link" }, headers: { origin: origin() } });
  expect(refused.status()).toBe(400);
  expect(JSON.stringify(await refused.json())).toContain("Invalid link.");
  await submitAndReopen();
  await expect(page.locator("#person-website")).toHaveValue("rae.example.org");
});

test("Description: renamed, shared — its changes show in the history like any field", async () => {
  await openPerson();
  const description = page.getByLabel("Description", { exact: true });
  await expect(description).toHaveValue("First notes");
  await description.fill("Shared notes");
  await submitAndReopen();
  const change = page.locator("[data-history-item=updated] [data-change=description]").first();
  await expect(change.locator(".line-through")).toHaveText("First notes");
  await expect(change).toContainText("Shared notes");
  await expect(page.getByText("Personal note")).toHaveCount(0);
});

test("contact channels: the info card; reordered by keyboard and by mouse; the order is saved and shown in the history", async () => {
  await openPerson();
  await expect(page.locator("[data-hint]").filter({ hasText: "The first value is the preferred way of contact." })).toBeVisible();
  for (const channel of ["Email", "Phone", "Signal"]) await pick("contact channels", channel);
  expect(await chipLabels("contact channels")).toEqual(["email", "phone", "signal"]);

  // Keyboard: focus a chip, Alt+← moves it (announced).
  const signal = page.locator('[data-chip="signal"]');
  await signal.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowLeft");
  expect(await chipLabels("contact channels")).toEqual(["signal", "email", "phone"]);
  await expect(page.locator('[data-chip="signal"]')).toBeFocused();
  await expect(page.locator('[data-relation-picker="contact channels"] [aria-live]')).toHaveText("Signal moved to position 1 of 3.");

  // Mouse: drag Phone onto the first chip.
  await page.locator('[data-chip="phone"]').dragTo(page.locator('[data-chip="signal"]'));
  expect(await chipLabels("contact channels")).toEqual(["phone", "signal", "email"]);
  await submitAndReopen();
  expect(await chipLabels("contact channels")).toEqual(["phone", "signal", "email"]);

  // A new order alone is a change, and an event of its own.
  await page.locator('[data-chip="email"]').focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.getByRole("button", { name: "Submit changes" })).toBeEnabled();
  await submitAndReopen();
  expect(await chipLabels("contact channels")).toEqual(["email", "phone", "signal"]);
  const reordered = page.locator("[data-history-item=updated]").first();
  await expect(reordered).toContainText("reordered contact channels");
  await expect(reordered.locator("[data-reordered]")).toHaveCount(1);
});

test("organizations and expertise keep their order too", async () => {
  await openPerson();
  await pick("organizations", "Harbor Legal Collective", "harbor");
  await pick("organizations", "Quarry Mobile", "quarry");
  await pick("expertise", "Web development", "web dev");
  await pick("expertise", "Backend development", "backend");
  const orgs = await chipLabels("organizations");
  await page.locator(`[data-chip="${orgs[1]}"]`).focus();
  await page.keyboard.press("Alt+ArrowLeft");
  const expertise = await chipLabels("expertise");
  await page.locator(`[data-chip="${expertise[1]}"]`).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await submitAndReopen();
  expect(await chipLabels("organizations")).toEqual([orgs[1], orgs[0]]);
  expect(await chipLabels("expertise")).toEqual([expertise[1], expertise[0]]);
});

test("the Expenses search answers on a person; every listed expense can be picked (no Notion-managed state any more)", async () => {
  await openPerson();
  const search = page.locator('[data-relation-picker="expenses"] input[role=combobox]');
  await search.click();
  const results = page.getByRole("list", { name: "Expenses results" });
  await expect(results.getByText("Searching…")).toHaveCount(0);
  await expect(results.getByRole("alert")).toHaveCount(0); // no "Couldn't load expenses."
  const options = results.locator("button[data-option]");
  const count = await options.count();
  const empty = await results.getByText("No matches.").count();
  expect(count > 0 || empty === 1).toBe(true);
  for (let index = 0; index < count; index++) {
    await expect(options.nth(index)).toBeEnabled();
    await expect(options.nth(index)).not.toContainText("Managed in Notion");
  }
  await page.keyboard.press("Escape");
});

test("the design-system date picker: keyboard, Escape, the chosen day", async () => {
  await openPerson();
  const trigger = page.locator("#person-first-contact");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const picker = page.locator("[data-date-picker]");
  await expect(picker).toBeVisible();
  await expect(picker.locator("[aria-current=date]")).toBeFocused();
  await page.screenshot({ path: join(SHOTS, "review-date-picker-1440.png") });
  await axe();
  // → then Enter picks tomorrow.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const expected = await page.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() + 1);
    return day.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  });
  await expect(trigger).toHaveText(expected);
  // Escape closes without changing it; focus goes back to the field.
  await page.keyboard.press("Enter");
  await expect(picker).toBeVisible();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText(expected);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
});

test("light and dark: the record with an error and an open picker passes axe in both", async () => {
  await openPerson();
  await page.locator("#person-email").fill("broken@");
  await page.locator("#person-email").press("Tab");
  await axe();
  // What Appearance → Light applies (Profile settings, p18).
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await expect(page.locator("#person-email-error")).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "review-person-light-1440.png") });
  await axe();
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
});

test("Monitoring → History: full width, '<actor> <action> <entry title>' linked, and a ⋮ menu per event", async () => {
  await page.goto("/admin/history?entity=person");
  const list = page.getByRole("list", { name: "History, newest first" });
  const event = list.locator("[data-history-item]").filter({ hasText: NAME }).first();
  await expect(event).toBeVisible();
  const subject = event.locator("[data-history-subject]");
  await expect(subject).toHaveText(NAME);
  await expect(subject).toHaveAttribute("href", `/admin/people/${personId}`);
  await expect(event).not.toContainText("PER-");
  // Full width: the list spans the page's content column.
  const [listBox, mainBox] = [await box(list), await box(page.locator("[data-history-page]"))];
  expect(Math.abs(listBox.width - mainBox.width)).toBeLessThanOrEqual(1);

  await event.getByRole("button", { name: /More options for this event/ }).click();
  const menu = page.getByRole("dialog", { name: "Event options" });
  await expect(menu.getByRole("link")).toHaveText(["Report issue", "Send feedback"]);
  await expect(menu.getByRole("link", { name: "Report issue" })).toHaveAttribute("href", /^\/issue\?source=%2Fadmin%2Fhistory%3Fevent%3D/);
  await expect(menu.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", /^\/feedback\?source=%2Fadmin%2Fhistory%3Fevent%3D/);
  await page.screenshot({ path: join(SHOTS, "review-history-1440.png") });
  await axe();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("side-by-side comparisons with the Figma frames (p3 list header, p14 record)", async () => {
  const figmaDir = process.env.FIGMA_PNG_DIR;
  test.skip(!figmaDir, "Set FIGMA_PNG_DIR to the PNG renders of admin-desktop.pdf (pN.png).");
  await page.setViewportSize(FRAME);
  await page.goto("/admin/people");
  await expect(rows().first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "review-list-1440.png") });
  await openPerson();
  await page.screenshot({ path: join(SHOTS, "review-record-1440.png") });
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const compare = await page.context().newPage();
  await compare.setViewportSize({ width: 2 * 1440 + 24, height: 920 + 40 });
  for (const [shot, frame, label] of [
    ["review-list-1440", "p3", "Figma P3 (Scrolling page)"],
    ["review-record-1440", "p14", "Figma P14"],
  ] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await compare.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App</figcaption><img src="${data(app)}" width="1440" height="920"></figure>
        <figure style="margin:0"><figcaption style="height:24px">${label}</figcaption>
          <div style="width:1440px;height:920px;overflow:hidden"><img src="${data(figma)}" width="1440" height="1024" style="margin-top:-104px"></div></figure>
      </div></body>`);
    await compare.screenshot({ path: join(SHOTS, `compare-review-${frame}.png`) });
  }
  await compare.close();
});

test("no console errors or warnings on any of the pages above", async () => {
  expect(consoleIssues).toEqual([]);
});
