import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import type { Database } from "../../common/database/database.module.js";
import * as schema from "../../common/database/schema.js";
import { AuthRepository } from "../auth.repository.js";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../password.js";

/**
 * Creates the single owner admin, or replaces its email/password (and logs
 * out every session). There is intentionally no signup endpoint.
 *
 *   npm run build -w @global-experiment/api
 *   npm run admin:set-owner -w @global-experiment/api -- --email=owner@example.org
 *
 * The password is read from a hidden prompt (or stdin when piped) — never
 * from argv, where it would land in shell history and process listings.
 */

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolvePassword) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (text: string) => {
      write(text.startsWith(prompt) ? prompt : "");
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolvePassword(answer);
    });
  });
}

async function readPipedStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  if (process.env.NODE_ENV !== "production") {
    for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
      if (existsSync(file)) process.loadEnvFile(file);
    }
  }
  const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ }).parse(process.env.DATABASE_URL, {
    error: () => "DATABASE_URL must be set to a postgres:// connection string",
  });
  const emailArg = process.argv.find((arg) => arg.startsWith("--email="))?.slice("--email=".length);
  const email = z.email().parse(emailArg, { error: () => "Pass --email=<owner email>" });

  let password: string;
  if (process.stdin.isTTY) {
    password = await readHidden("New owner password: ");
    if ((await readHidden("Repeat password: ")) !== password) throw new Error("Passwords do not match.");
  } else {
    password = await readPipedStdin();
  }
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

  const client = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    const outcome = await new AuthRepository(db).upsertOwner(email, await hashPassword(password));
    console.log(outcome === "created" ? "Owner admin created." : "Owner admin updated; all sessions revoked.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("\n") : (error as Error).message);
  process.exit(1);
});
