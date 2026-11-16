#!/usr/bin/env node
/**
 * npm run icons:add -- <name> [--style outlined|rounded|sharp] [--filled] [--folder <subfolder>] [--force]
 *
 * Adds one icon from the official Material Symbols set (Google Fonts, fonts.gstatic.com) to the project's
 * icon assets, public/assets/icons/figma/ (or one of its subfolders, e.g. --folder admin), cleaned by
 * scripts/icons/cleanSvg.mjs. The name is the symbol's official name, as on fonts.google.com/icons
 * ("manage_accounts"); the file is named like the others ("manage-accounts.svg"). An existing file is never
 * replaced without --force. See AGENTS.md (Design) for when an icon may come from here.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanSvg, fileNameFor } from "./icons/cleanSvg.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = join(ROOT, "public", "assets", "icons", "figma");
const STYLES = ["outlined", "rounded", "sharp"];
const MAX_BYTES = 50_000;

function parse(argv) {
  const options = { name: "", style: "outlined", filled: false, folder: "", force: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--filled") options.filled = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--style") options.style = argv[++index] ?? "";
    else if (arg === "--folder") options.folder = argv[++index] ?? "";
    else if (!arg.startsWith("--") && !options.name) options.name = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!/^[a-z0-9_]{1,60}$/.test(options.name))
    throw new Error("Give the symbol's official name, like manage_accounts (lowercase letters, digits, underscores).");
  if (!STYLES.includes(options.style)) throw new Error(`--style is one of: ${STYLES.join(", ")}.`);
  if (options.folder && !/^[a-z0-9-]{1,40}$/.test(options.folder)) throw new Error("--folder is a subfolder name, like admin.");
  return options;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const url = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbols${options.style}/${options.name}/${options.filled ? "fill1" : "default"}/24px.svg`;
  const target = join(ICONS, options.folder, fileNameFor(options.name, options.filled));
  if (existsSync(target) && !options.force) throw new Error(`${relative(ROOT, target).replace(/\\/g, "/")} already exists: use --force to replace it.`);

  const response = await fetch(url, { redirect: "error" });
  if (response.status === 404) throw new Error(`No Material Symbol named "${options.name}" (check the name on fonts.google.com/icons).`);
  if (!response.ok) throw new Error(`The download failed (HTTP ${response.status}).`);
  if (!/image\/svg\+xml/.test(response.headers.get("content-type") ?? "")) throw new Error("The download isn't an SVG file.");
  const source = await response.text();
  if (source.length > MAX_BYTES) throw new Error("The download is too large for an icon.");

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, cleanSvg(source));
  console.log(`Added ${relative(ROOT, target).replace(/\\/g, "/")} (Material Symbols ${options.style}${options.filled ? ", filled" : ""}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
