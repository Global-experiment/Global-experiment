import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .url({ message: "DATABASE_URL must be a valid Postgres connection string" }),
  NOTION_API_KEY: z.string().min(1, "NOTION_API_KEY is required"),
  NOTION_DOCUMENTATION_DB_ID: z.string().min(1, "NOTION_DOCUMENTATION_DB_ID is required"),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(issues: z.ZodIssue[]) {
    const message = issues
      .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    super(`Invalid environment configuration:\n${message}`);
    this.name = "EnvValidationError";
  }
}

let cachedEnv: Env | undefined;

/**
 * Parses and validates process.env on first use, then caches the result.
 * Called lazily by the modules that actually need configuration (e.g. the
 * DB client, the future Notion client) so that commands which don't touch
 * those integrations don't require every secret to be present.
 */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }

  cachedEnv = result.data;
  return cachedEnv;
}
