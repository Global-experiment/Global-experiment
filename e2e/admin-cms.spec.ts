import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

/**
 * Native Home and Documentation (Delivery 6; OPS-26, OPS-27, OPS-28;
 * admin-desktop.pdf p6–p11): Home's editor, the Documentation list and
 * record, the editor's toolbar, publishing, drafts, Versions (view, compare,
 * restore) and what visitors see after each step. Every change is undone
 * before the suite ends (the restored versions are new revisions). Test
 * fixtures only (the *_test database). axe on every screen; side-by-side
 * Figma comparisons when FIGMA_PNG_DIR is set.
 */
test.skip(!process.env.E2E_ADMIN_ENABLED, "TEST_DATABASE_URL isn't configured, so the admin stack isn't running.");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 920 } });

const SHOTS = "test-results/figma";
mkdirSync(SHOTS, { recursive: true });
const SAVED_SESSIONS = ["admin-figma", "admin-table", "admin-directory-v2", "admin"].map((name) => `test-results/.auth/${name}.json`);
let page: Page;
const ARTICLE = { title: "E2E sample article", slug: "e2e-sample-article" };

const editor = () => page.locator("[data-cms-editor] [contenteditable=true]");
const toolbar = () => page.getByRole("toolbar", { name: "Formatting" });
const panel = () => page.locator("[data-record-panel]");
/** The cursor at the very end of the content (the last line of the last paragraph). */
const toEnd = async () => {
  await editor().locator("p").last().click();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
};
const toast = (text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
async function axe() {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}
/** What a visitor sees, in a context of its own (no admin session, no cache of this page). */
async function visitor(path: string) {
  const context = await page
    .context()
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin });
  const other = await context.newPage();
  const response = await other.goto(path);
  return { other, status: response?.status(), close: () => context.close() };
}

test.beforeAll(async ({ browser }, testInfo) => {
  const signIn = () => page.getByRole("heading", { name: /^Sign in/ });
  for (const state of [...SAVED_SESSIONS.filter((path) => existsSync(path)), undefined]) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 920 }, storageState: state });
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

test("Home's editor (p7): toolbar, panel and history; a published edit reaches visitors; restoring version 1 puts it back", async () => {
  await page.goto("/admin/home");
  await page.locator("[data-public-view-header]").getByRole("link", { name: "Administrate" }).click();
  await expect(page).toHaveURL("/admin/home/manage");
  await expect(page).toHaveTitle("Home");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  // p7's toolbar: undo, redo, heading, text, bulleted and numbered lists, link (and images).
  expect(
    await toolbar()
      .getByRole("button")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
  ).toEqual(["Undo", "Redo", expect.stringMatching(/^Heading/), "Text", "Bulleted list", "Numbered list", "Add link", "Add image"]);
  await expect(editor()).toContainText("A global platform for democratic participation");
  // The panel: Last publish, Created, Discard changes, Submit changes, then the History.
  await expect(panel().getByText("Last publish")).toBeVisible();
  await expect(panel().getByText("Created", { exact: true })).toBeVisible();
  await expect(panel().getByRole("button", { name: "Discard changes" })).toBeDisabled();
  await expect(panel().getByRole("button", { name: "Submit changes" })).toBeDisabled();
  await expect(panel().getByRole("heading", { name: /^History/ })).toBeVisible();
  await axe();
  await page.screenshot({ path: join(SHOTS, "p07-home-editor-1440.png") });

  // Edit, discard, edit again and publish.
  await toEnd();
  await page.keyboard.type(" Edited by the e2e suite.");
  await expect(panel().getByRole("button", { name: "Submit changes" })).toBeEnabled();
  await panel().getByRole("button", { name: "Discard changes" }).click();
  await expect(editor()).not.toContainText("Edited by the e2e suite.");
  await toEnd();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Edited by the e2e suite.");
  await page.getByLabel("What changed (optional, shown in Versions)").fill("E2E edit");
  await panel().getByRole("button", { name: "Submit changes" }).click();
  await expect(toast("Home published")).toBeVisible();
  await expect(page.locator("[data-history-item=published]").first()).toContainText("published this page");
  await expect(page.locator("[data-history-item=updated]").first()).toContainText("edited the page content");
  await expect(page.locator("[data-history-item=updated]").first().locator("[data-content-line=added]")).toContainText("Edited by the e2e suite.");

  const live = await visitor("/");
  await expect(live.other.getByText("Edited by the e2e suite.")).toBeVisible();
  await live.close();

  // Versions: 2 is on the website; restore 1 and publish it — a new revision 3.
  await panel().getByRole("button", { name: "Versions" }).click();
  await expect(page).toHaveURL("/admin/home/versions");
  const versions = page.getByRole("navigation", { name: "Versions, newest first" });
  await expect(versions.getByRole("listitem")).toHaveCount(2);
  await expect(versions.getByRole("listitem").first()).toContainText("On the website");
  await expect(versions.getByRole("listitem").first()).toContainText("E2E edit");
  // Version 1 is selected: compared with the current version, the e2e line is new there.
  await expect(page.locator("[data-compare=added]")).toContainText("Edited by the e2e suite.");
  await axe();
  await page.screenshot({ path: join(SHOTS, "versions-home-1440.png") });
  await page.getByRole("button", { name: "Restore and publish" }).click();
  await expect(toast("Version 1 restored and published")).toBeVisible();
  await expect(versions.getByRole("listitem")).toHaveCount(3);
  await expect(versions.getByRole("listitem").first()).toContainText("restores version 1");
  const back = await visitor("/");
  await expect(back.other.getByText("A global platform for democratic participation")).toBeVisible();
  await expect(back.other.getByText("Edited by the e2e suite.")).toHaveCount(0);
  await back.close();
});

test("Documentation list (p9): every article with its state; New document", async () => {
  await page.goto("/admin/documentation");
  await page.locator("[data-public-view-header]").getByRole("link", { name: "Administrate" }).click();
  await expect(page).toHaveURL("/admin/documentation/manage");
  await expect(page.getByRole("heading", { level: 1, name: "Documentation" })).toBeVisible();
  const columns = (await page.locator("thead th").allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  expect(columns).toEqual(["Name", "State", "Display order", "Expertise", "Last edited by", "Updated", "Last published"]);
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.locator("tbody tr").first()).toContainText("Introduction");
  await expect(page.locator("tbody tr").first()).toContainText("Published");
  await expect(page.getByRole("link", { name: "New document" })).toBeVisible();
  await axe();
  await page.screenshot({ path: join(SHOTS, "p09-documentation-list-1440.png") });
});

test("Document record (p10, p11): fields, status, editor, panel and More options", async () => {
  await page.goto("/admin/documentation/manage");
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/documentation\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Introduction" })).toBeVisible();
  const labels = (await page.locator("[data-property]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-property")))).filter(Boolean);
  expect(labels).toEqual(["Title", "Expertise", "Slug", "Status", "Display order", "Document ID", "Updated", "Last edited by", "Created", "Created by"]);
  await expect(page.getByRole("group", { name: "Status" }).getByRole("button")).toHaveText(["Published", "Draft", "Unpublished", "Archived"]);
  await expect(page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Published", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Slug")).toHaveValue("introduction");
  await expect(page.getByRole("list", { name: "Expertise" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("Documents can have up to 10 expertise.")).toBeVisible();
  await expect(toolbar()).toBeVisible();
  await expect(panel().getByRole("button", { name: "Duplicate", exact: true })).toBeVisible();
  await axe();
  await page.screenshot({ path: join(SHOTS, "p10-document-1440.png") });
  await panel().getByRole("button", { name: "More options" }).click();
  await expect(panel().getByRole("button", { name: /^(Discard changes|Duplicate as a draft|Archive)$/ })).toHaveText([
    "Discard changes",
    "Duplicate as a draft",
    "Archive",
  ]);
  await page.screenshot({ path: join(SHOTS, "p11-more-options-1440.png"), clip: { x: 1040, y: 0, width: 400, height: 260 } });
  await axe();
});

test("a new article: draft (not public) → published → draft changes (public unchanged) → compare and restore → archived", async () => {
  await page.goto("/admin/documentation/new");
  await expect(page.getByRole("heading", { level: 1, name: "New document" })).toBeVisible();
  await page.getByLabel("Title").fill(ARTICLE.title);
  await expect(page.getByLabel("Slug")).toHaveValue(ARTICLE.slug);
  await page.getByLabel("Add an expertise").fill("Civic technology");
  await page.keyboard.press("Enter");
  await page.getByLabel("Display order").fill("99");
  await editor().click();
  await toolbar()
    .getByRole("button", { name: /^Heading/ })
    .click();
  await page.getByRole("dialog", { name: "Headings" }).getByRole("button", { name: "Heading 2" }).click();
  await page.keyboard.type("Summary");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First words of the sample article.");
  await page.keyboard.press("Enter");
  await toolbar().getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("One point");
  // The editor refuses a javascript: link; an https one is kept.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A link: ");
  await toolbar().getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Link address").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("dialog", { name: "Link" }).getByRole("alert")).toContainText("Use an https:// or mailto: address");
  await page.getByLabel("Link address").fill("https://example.org/");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(editor().locator("a[href='https://example.org/']")).toBeVisible();
  await expect(page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Draft" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(toast("Draft saved")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/documentation\/manage/);
  let row = page.locator("tbody tr").filter({ hasText: ARTICLE.title });
  await expect(row).toContainText("Draft");
  let visit = await visitor(`/documentation/${ARTICLE.slug}`);
  expect(visit.status).toBe(404);
  await visit.close();

  // Publish it.
  await row.getByRole("link").first().click();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Published", exact: true }).click();
  await expect(page.locator("[data-status-note]")).toContainText("Submit changes publishes them");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(toast("Changes published")).toBeVisible();
  visit = await visitor(`/documentation/${ARTICLE.slug}`);
  expect(visit.status).toBe(200);
  await expect(visit.other.getByText("First words of the sample article.")).toBeVisible();
  await expect(visit.other.getByRole("link", { name: "example.org" }).or(visit.other.locator("a[href='https://example.org/']"))).toBeVisible();
  await visit.close();

  // A draft change: visitors keep the published version.
  row = page.locator("tbody tr").filter({ hasText: ARTICLE.title });
  await row.getByRole("link").first().click();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Draft" }).click();
  await expect(page.locator("[data-status-note]")).toContainText("visitors keep seeing version 1");
  await editor().getByText("First words of the sample article.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Second draft words.");
  await page.getByRole("button", { name: "Submit changes" }).click();
  await expect(toast("Draft saved")).toBeVisible();
  row = page.locator("tbody tr").filter({ hasText: ARTICLE.title });
  await expect(row).toContainText("draft changes");
  visit = await visitor(`/documentation/${ARTICLE.slug}`);
  await expect(visit.other.getByText("Second draft words.")).toHaveCount(0);
  await visit.close();

  // Versions: compare version 1 (live) with the draft (2), then restore 1 as a draft (3).
  await row.getByRole("link").first().click();
  await expect(page.locator("[data-status-note]")).toContainText("Version 2 is a draft; visitors see version 1.");
  await panel().getByRole("button", { name: "Versions" }).click();
  const versions = page.getByRole("navigation", { name: "Versions, newest first" });
  await expect(versions.getByRole("listitem")).toHaveCount(2);
  await versions.getByRole("button", { name: /^Version 1/ }).click();
  await expect(page.locator("[data-compare=removed]")).toContainText("First words of the sample article.");
  await expect(page.locator("[data-compare=added]")).toContainText("Second draft words.");
  await axe();
  await page.screenshot({ path: join(SHOTS, "versions-compare-1440.png") });
  await page.getByRole("button", { name: "Restore as a draft" }).click();
  await expect(toast("Version 1 restored as a draft")).toBeVisible();
  await expect(versions.getByRole("listitem")).toHaveCount(3);

  // The public history: the published versions only (2 and 3 are drafts).
  visit = await visitor(`/documentation/${ARTICLE.slug}/history`);
  await expect(visit.other.getByText("One published version.")).toBeVisible();
  await visit.close();

  // Archive it: off the website and out of the list's default view; nothing deleted.
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/documentation\/[0-9a-f-]{36}$/);
  await panel().getByRole("button", { name: "More options" }).click();
  await panel().getByRole("button", { name: "Archive" }).click();
  await expect(toast("Document archived")).toBeVisible();
  visit = await visitor(`/documentation/${ARTICLE.slug}`);
  expect(visit.status).toBe(404);
  await visit.close();
  await page.goto("/admin/documentation/manage");
  await expect(page.locator("tbody tr").filter({ hasText: ARTICLE.title })).toHaveCount(0);
  await page.goto("/admin/documentation/manage?view=archived");
  await expect(page.locator("tbody tr").filter({ hasText: ARTICLE.title })).toHaveCount(1);
});

test("the public pages: same URLs, anchors and search; Document history shows real published versions", async () => {
  const visit = await visitor("/documentation#introduction");
  await expect(visit.other.getByRole("button", { name: "Introduction" })).toHaveAttribute("aria-expanded", "true");
  await expect(visit.other.locator("h2 > button[aria-expanded=true]")).toHaveCount(1);
  await visit.other.getByPlaceholder("Search").fill("shared civic infrastructure");
  await expect(visit.other.locator("h2 > button[aria-expanded]")).not.toHaveCount(0);
  await visit.other.goto("/documentation/introduction/history");
  await expect(visit.other.getByText("One published version.")).toBeVisible();
  await expect(visit.other.getByText("No verifiable previous revision")).toHaveCount(0);
  await visit.close();
});

test("side by side with Figma p6–p11", async () => {
  const figmaDir = process.env.FIGMA_PNG_DIR;
  test.skip(!figmaDir, "Set FIGMA_PNG_DIR to the PNG renders of admin-desktop.pdf (pN.png).");
  const data = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const compare = await page.context().newPage();
  await compare.setViewportSize({ width: 2 * 1440 + 24, height: 920 + 40 });
  for (const [shot, frame] of [
    ["p06-home-1440", "p6"],
    ["p07-home-editor-1440", "p7"],
    ["p08-documentation-1440", "p8"],
    ["p09-documentation-list-1440", "p9"],
    ["p10-document-1440", "p10"],
  ] as const) {
    const app = join(SHOTS, `${shot}.png`);
    const figma = join(figmaDir!, `${frame}.png`);
    if (!existsSync(app) || !existsSync(figma)) continue;
    await compare.setContent(`<body style="margin:0;background:#333;color:#fff;font:14px sans-serif">
      <div style="display:flex;gap:24px;padding:8px 0 0">
        <figure style="margin:0"><figcaption style="height:24px">App</figcaption><img src="${data(app)}" width="1440" height="920"></figure>
        <figure style="margin:0"><figcaption style="height:24px">Figma ${frame.toUpperCase()}</figcaption>
          <div style="width:1440px;height:920px;overflow:hidden"><img src="${data(figma)}" width="1440" style="margin-top:-104px"></div></figure>
      </div></body>`);
    await compare.screenshot({ path: join(SHOTS, `compare-cms-${frame}.png`) });
  }
  await compare.close();
});
