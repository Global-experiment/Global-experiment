// npm run setup — prepares a LOCAL development environment. No production secret is needed or read.
//
// 1. Writes the local-only values into .env.local (gitignored), keeping every value already there:
//    the local database (PGlite: PostgreSQL in a folder, nothing to install), generated secrets and a
//    local Rootadmin login.
// 2. Applies the migrations, fills an EMPTY local database with the test fixtures (made-up records) and
//    sets the local Rootadmin (apps/api/src/testing/local-setup.ts). It refuses any database that isn't
//    PGlite or a PostgreSQL server on this machine named *_dev or *_test, and NODE_ENV=production.
//
//   npm run setup               # first time, and after pulling new migrations
//   npm run setup -- --reset    # delete the local PGlite database and start again
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");
const fail = (message) => {
  console.error(`\nSetup stopped: ${message}`);
  process.exit(1);
};

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) fail(`Node.js 22 or later is needed (this is ${process.versions.node}).`);
if (!existsSync(join(root, "node_modules"))) fail("run npm install first.");

const secret = (bytes) => randomBytes(bytes).toString("base64url");
const LOCAL_VALUES = [
  ["DATABASE_URL", "pglite:.data/pglite", "The local database: PGlite in .data/pglite (gitignored)."],
  ["REVALIDATE_SECRET", secret(36), "Generated for this machine: lets the API refresh the public pages."],
  ["DONATIONS_PREVIEW_TOKEN", secret(32), "Generated for this machine: /donate?preview=<token>."],
  ["LOCAL_ADMIN_EMAIL", "rootadmin@local.test", "The local Rootadmin (this machine only)."],
  ["LOCAL_ADMIN_PASSWORD", secret(18), null],
];

const existing = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const has = (name) => new RegExp(`^\\s*${name}\\s*=`, "m").test(existing);
const added = LOCAL_VALUES.filter(([name]) => !has(name));
if (added.length > 0) {
  const lines = added.flatMap(([name, value, note]) => [...(note ? [`# ${note}`] : []), `${name}=${value}`]);
  const header = existing
    ? "\n# --- Added by npm run setup (local development only) ---\n"
    : "# Local development only — written by npm run setup. Gitignored: never commit it.\n# Every variable is described in .env.example. Optional ones (Stripe test keys, Notion) can be added below.\n\n";
  writeFileSync(envFile, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${header}${lines.join("\n")}\n`);
  console.log(`.env.local: added ${added.map(([name]) => name).join(", ")}.`);
} else {
  console.log(".env.local: already complete, nothing changed.");
}

// The values the local setup needs: .env.local, unless the shell already sets them.
process.loadEnvFile(envFile);
const tsx = createRequire(import.meta.url).resolve("tsx/cli");
const run = spawnSync(process.execPath, [tsx, "--tsconfig", "apps/api/tsconfig.json", "apps/api/src/testing/local-setup.ts", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (run.status !== 0) fail("the local database couldn't be prepared (see the message above).");

console.log(`
Ready. Start the site and the API together:

  npm run dev:local

Then open http://localhost:3000 (public site) and http://localhost:3000/admin
Local Rootadmin (this machine only, also in .env.local):
  email:    ${process.env.LOCAL_ADMIN_EMAIL}
  password: ${process.env.LOCAL_ADMIN_PASSWORD}
`);
