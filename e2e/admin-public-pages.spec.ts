import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Public-first pages in the admin (admin-desktop.pdf p6, p8): Home,
 * Documentation and Treasury open on the public view inside the admin
 * shell, with "Administrate", Share and ⋮ at the top right; Administrate
 * leads to the backend view (Home content and the Documentation list are
 * read-only while managed in Notion; Treasury → the admin list). Home and
 * Documentation come from live Notion, as on the public site.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 920 }, permissions: ["clipboard-read", "clipboard-write"] });

const SHOTS = "test-results/figma";
mkdirSync(SHOTS, { recursive: true });
const SAVED_SESSIONS = ["admin-figma", "admin-table", "admin-directory-v2", "admin"].map((name) => `test-results/.auth/${name}.json`);
let page: Page;

const header = () => page.locator("[data-public-view-header]");
const box = async (locator: Locator) => {
  const value = await locator.boundingBox();
  if (!value) throw new Error("not rendered");
  return value;
};
const near = (actual: number, expected: number, label: string, tolerance = 1) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} ≈ ${expected}`).toBeLessThanOrEqual(tolerance);
async function axe() {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async ({ browser }, testInfo) => {
  // Logins are rate-limited: reuse a session another admin suite saved, sign in only if none is valid.
  const signIn = () => page.getByRole("heading", { name: /^Sign in/ });
  for (const state of [...SAVED_SESSIONS.filter((path) => existsSync(path)), undefined]) {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 1440, height: 920 },
      storageState: state,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    page = await context.newPage();
    await page.goto("/admin/people");
    await expect(signIn().or(page.locator("tbody tr").first())).toBeVisible({ timeout: 30_000 });
    if (!(await signIn().isVisible()) || state === undefined) break;
    await context.close();
  }
  if (await signIn().isVisible()) {
    await page.getByLabel("Email address").fill(E2E_ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page).toHaveURL(/\/admin\/people/);
});
test.afterAll(async () => {
  await page.context().close();
});

/** p6: Administrate ends at 1384 (8px before the share glyph at 1392); ⋮ ends 8px from the edge; all centred on y 20. */
async function headerGeometry() {
  const administrate = await box(header().getByRole("link", { name: "Administrate" }));
  near(administrate.x + administrate.width, 1384, "Administrate right edge");
  near(administrate.y, 8, "Administrate y");
  near(administrate.height, 24, "Administrate height");
  near(administrate.width, 93, "Administrate width", 2);
  const share = await box(header().getByRole("button", { name: "Share" }).locator("svg"));
  near(share.x, 1392, "share glyph x");
  const more = await box(header().getByRole("button", { name: "Page actions" }).locator("svg"));
  near(more.x + more.width, 1432, "⋮ right edge");
  near(more.y + more.height / 2, 20, "⋮ centre");
  const title = await box(page.getByRole("heading", { level: 1 }));
  near(title.x, 248, "title x");
}

test("Home (p6): the public page in the shell; Share copies the public address; Administrate → read-only content", async () => {
  await page.locator("#admin-sidebar").getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/admin/home");
  await expect(page).toHaveTitle("Home");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.locator("#admin-sidebar [aria-current=page]")).toHaveText("Home");
  // The public content: wordmark, tagline, the action grid.
  await expect(page.getByText("Global experiment", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 }).first()).not.toBeEmpty();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Join waitlist" })).toHaveAttribute("href", "/waitlist");
  await headerGeometry();
  await axe();
  await page.screenshot({ path: join(SHOTS, "p06-home-1440.png") });

  await header().getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied to clipboard" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL("/", page.url()).toString());

  await header().getByRole("button", { name: "Page actions" }).click();
  const menu = page.getByRole("dialog", { name: "Page actions" });
  await expect(menu.getByRole("link", { name: "Open the public page" })).toHaveAttribute("href", "/");
  await page.keyboard.press("Escape");

  await header().getByRole("link", { name: "Administrate" }).click();
  await expect(page).toHaveURL("/admin/home/manage");
  await expect(page).toHaveTitle("Home content");
  await expect(page.locator("[data-managed-in-notion]")).toContainText("Managed in Notion");
  await expect(page.locator("[data-managed-in-notion]").getByRole("link", { name: "Open in Notion" })).toHaveAttribute("href", /^https:\/\/www\.notion\.so\/[0-9a-f]{32}$/);
  await expect(page.getByRole("heading", { name: "Tagline" })).toBeVisible();
  // Read-only: nothing to type into.
  await expect(page.locator("main input, main textarea, [data-record-main] input, [data-record-main] textarea")).toHaveCount(0);
  await axe();
});

test("Documentation (p8): the public list without its search; each article's Administrate opens its row in the list", async () => {
  await page.locator("#admin-sidebar").getByRole("link", { name: "Documentation" }).click();
  await expect(page).toHaveURL("/admin/documentation");
  await expect(page).toHaveTitle("Documentation");
  await expect(page.getByRole("heading", { level: 1, name: "Documentation" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search documentation" })).toBeHidden();
  await headerGeometry();

  const first = page.locator("h2 > button[aria-expanded]").first();
  const title = (await first.innerText()).trim();
  await first.click();
  const article = page.locator("[id]").filter({ has: first });
  const administrate = article.getByRole("link", { name: "Administrate" });
  await expect(administrate).toBeVisible();
  await expect(article.getByRole("status", { name: "Loading article" })).toHaveCount(0, { timeout: 30_000 });
  // p8: Administrate, Send feedback, Report issue.
  await expect(article.getByRole("link", { name: /^(Administrate|Send feedback|Report issue)$/ })).toHaveText(["Administrate", "Send feedback", "Report issue"]);
  await axe();
  await page.screenshot({ path: join(SHOTS, "p08-documentation-1440.png") });

  await administrate.click();
  await expect(page).toHaveURL(/\/admin\/documentation\/manage\?q=/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText(title);
  const columns = (await page.locator("thead th").allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  expect(columns).toEqual(["Title", "Status", "Display order", "Expertise", "Last edited by", "Updated", "Published"]);
  await expect(page.locator("[data-managed-in-notion]")).toContainText("Managed in Notion");
  await axe();

  // Back to everything: the whole list, in display order.
  await page.goto("/admin/documentation/manage");
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(1);
  await page.screenshot({ path: join(SHOTS, "documentation-list-1440.png") });
});

test("Treasury: the public view in the shell (pills stay in the admin, no Donate bar); Administrate → the admin list", async () => {
  await page.locator("#admin-sidebar").getByRole("link", { name: "Treasury" }).click();
  await expect(page).toHaveURL("/admin/treasury");
  await expect(page).toHaveTitle("Treasury");
  await expect(page.getByRole("heading", { level: 1, name: "Treasury" })).toBeVisible();
  await expect(page.locator("[data-amount]").first()).toBeVisible();
  await expect(page.locator("[data-nav-header]")).toHaveCount(0);
  await expect(page.locator("[data-action-bar]")).toHaveCount(0);
  await headerGeometry();
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(page).toHaveURL("/admin/treasury?type=expense");
  await axe();
  await page.screenshot({ path: join(SHOTS, "treasury-public-1440.png") });

  await header().getByRole("link", { name: "Administrate" }).click();
  await expect(page).toHaveURL("/admin/treasury/manage");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator("#admin-sidebar [aria-current=page]")).toHaveText("Treasury");
});

test("side-by-side comparisons with p6 and p8", async () => {
  const figmaDir = process.env.FIGMA_PNG_DIR;
  test.skip(!figmaDir, "Set FIGMA_PNG_DIR to the PNG renders of admin-desktop.pdf (pN.png) to write the comparisons.");
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  await page.setViewportSize({ width: 2 * 1440 + 24, height: 920 + 40 });
  for (const [shot, frame, label] of [
    ["p06-home-1440", "p6", "Home"],
    ["p08-documentation-1440", "p8", "Documentation"],
  ] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await page.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App — ${label}</figcaption><img src="${data(app)}" width="1440" height="920"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma ${frame.toUpperCase()}</figcaption>
          <div style="width:1440px;height:920px;overflow:hidden"><img src="${data(figma)}" width="1440" height="1024" style="margin-top:-104px"></div></figure>
      </div></body>`);
    await page.screenshot({ path: join(SHOTS, `compare-${frame}.png`) });
  }
});
