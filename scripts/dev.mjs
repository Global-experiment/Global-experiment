// npm run dev:local — the public site and admin (Next.js, http://localhost:3000) and the API
// (NestJS, http://127.0.0.1:4000) together, both reading .env.local. Ctrl+C stops both.
// Run npm run setup once before.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(root, ".env.local"))) {
  console.error("No .env.local yet: run npm run setup first.");
  process.exit(1);
}

const children = [
  ["api", "npm run api:dev"],
  ["web", "npm run dev"],
].map(([name, command]) => {
  const child = spawn(command, { cwd: root, shell: true, stdio: ["inherit", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) {
    let rest = "";
    stream.on("data", (chunk) => {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? "";
      for (const line of lines) console.log(`[${name}] ${line}`);
    });
  }
  child.on("exit", (code) => {
    console.log(`[${name}] stopped${code ? ` (exit ${code})` : ""}.`);
    for (const other of children) if (other !== child && other.exitCode === null) other.kill();
    process.exitCode = code ?? 0;
  });
  return child;
});

process.on("SIGINT", () => {
  for (const child of children) if (child.exitCode === null) child.kill("SIGINT");
});
