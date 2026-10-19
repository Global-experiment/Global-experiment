import type { APIRequestContext } from "@playwright/test";
import postgres from "postgres";

/** Test-only: the e2e web server's on-demand revalidation secret (playwright.config.ts). */
export const E2E_REVALIDATE_SECRET = "e2e-revalidate-secret-for-the-test-stack-only";

/**
 * Sets (or with `null`, removes) a settings row in the shared *_test
 * database, then expires the website's Treasury cache so the next page load
 * reads it (the donate config is never cached). Used by the suites that
 * switch a page between its settings; they run serially, after the others.
 */
export async function setSetting(request: APIRequestContext, key: string, value: unknown): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/_test(\?|$)/.test(new URL(url).pathname + new URL(url).search)) throw new Error("TEST_DATABASE_URL must name a *_test database.");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (value === null) await sql`delete from settings where key = ${key}`;
    else await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
  } finally {
    await sql.end();
  }
  const res = await request.post("/api/revalidate", { headers: { "x-revalidate-secret": E2E_REVALIDATE_SECRET }, data: { tags: ["treasury"] } });
  if (!res.ok()) throw new Error(`Revalidation failed: ${res.status()}`);
}
