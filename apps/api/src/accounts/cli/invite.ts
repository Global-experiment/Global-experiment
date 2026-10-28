import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import type { Database } from "../../common/database/database.module.js";
import * as schema from "../../common/database/schema.js";
import { inviteByCommand } from "../invite-command.js";

/**
 * Invites an admin from the server, as "New account" does in Accounts:
 *
 *   npm run admin:invite -w @global-experiment/api -- --email=someone@example.org --role=owner --name="Their name"
 *
 * The one-time link (72 h, single use) is the only thing written to stdout,
 * so it can go straight into a private file (`> link.txt`); everything
 * else goes to stderr. It is never stored: run it again for a new link
 * while the account is still invited (the older link stops working).
 * Needs DATABASE_URL and PUBLIC_SITE_URL.
 */

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  if (process.env.NODE_ENV !== "production") {
    for (const file of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
      if (existsSync(file)) process.loadEnvFile(file);
    }
  }
  const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ }).parse(process.env.DATABASE_URL, {
    error: () => "DATABASE_URL must be set to a postgres:// connection string",
  });
  const site = z.url({ protocol: /^https?$/ }).parse(process.env.PUBLIC_SITE_URL, { error: () => "PUBLIC_SITE_URL must be set (the links point there)." });
  const email = z.email().parse(arg("email"), { error: () => "Pass --email=<their email>" });
  const role = z.string().min(1).parse(arg("role"), { error: () => "Pass --role=<role key, e.g. owner>" });

  const client = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    const result = await inviteByCommand(db, { email, role, displayName: arg("name") ?? null }, new URL(site).origin);
    console.error(result.outcome === "invited" ? `Invited ${email}; the link works once, until ${result.expiresAt}.` : `${email} was already invited: new link, until ${result.expiresAt} (the older one no longer works).`);
    process.stdout.write(`${result.link}\n`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("\n") : (error as Error).message);
  process.exit(1);
});
