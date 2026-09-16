import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads .env.local directly, without @next/env. @next/env deliberately
 * excludes .env.local when NODE_ENV=test (visible in its own source:
 * `d !== "test" && ".env.local"` in the candidate file list) — a sensible
 * default for keeping most test runs reproducible regardless of a
 * developer's local overrides, but wrong for this project's one
 * deliberate exception: the Notion live-connectivity smoke test, which
 * only runs at all when a developer explicitly wants it to use real
 * local credentials. Vitest sets NODE_ENV=test, so relying on @next/env
 * here would silently skip .env.local every time.
 */
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  const contents = readFileSync(envLocalPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue; // don't override real env
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}
