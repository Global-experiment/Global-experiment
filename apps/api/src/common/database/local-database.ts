import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { PGLITE_URL } from "../config/env.js";

/**
 * The local development database (`DATABASE_URL=pglite:<folder>`, written by
 * `npm run setup`): PostgreSQL in-process (PGlite), stored in a folder, no
 * server to install. A relative folder is under the repo root, so the API
 * finds the same database whether it runs from the root or from apps/api.
 * Refused in production by the config (env.ts).
 */
export function pgliteDirectory(databaseUrl: string): string | undefined {
  const folder = PGLITE_URL.exec(databaseUrl)?.[1];
  if (!folder) return undefined;
  if (isAbsolute(folder)) return folder;
  let root = process.cwd();
  while (!existsSync(join(root, "apps", "api", "package.json"))) {
    const up = dirname(root);
    if (up === root) return resolve(folder);
    root = up;
  }
  return resolve(root, folder);
}
