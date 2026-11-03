import { pgliteDirectory } from "../common/database/local-database.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The guard of the local setup (local-setup.ts): only PGlite, or a PostgreSQL
 * server on this machine whose database is named *_dev or *_test — never
 * production, never another host. Returns the URL it accepted.
 */
export function checkLocalDatabase(url: string | undefined, nodeEnv: string | undefined): string {
  if (nodeEnv === "production") throw new Error("Refusing to run with NODE_ENV=production: the local setup is for development only.");
  if (!url) throw new Error("DATABASE_URL is missing: run npm run setup from the repo root.");
  if (pgliteDirectory(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL isn't a pglite:<folder> or postgres:// address.");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error("DATABASE_URL isn't a pglite:<folder> or postgres:// address.");
  if (!LOCAL_HOSTS.has(parsed.hostname))
    throw new Error(`Refusing to set up "${parsed.hostname}": the local setup only runs on PGlite or a PostgreSQL server on this machine (localhost).`);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/_(dev|test)$/.test(name)) throw new Error(`Refusing to set up "${name}": a local PostgreSQL database must be named *_dev or *_test.`);
  return url;
}
