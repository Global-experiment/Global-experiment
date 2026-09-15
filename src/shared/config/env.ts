import { z } from "zod";

export class EnvValidationError extends Error {
  constructor(scope: string, issues: z.ZodIssue[]) {
    const message = issues
      .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    super(`Invalid ${scope} environment configuration:\n${message}`);
    this.name = "EnvValidationError";
  }
}

function createLazyEnvAccessor<Schema extends z.ZodTypeAny>(scope: string, schema: Schema) {
  let cached: z.infer<Schema> | undefined;

  return function getScopedEnv(): z.infer<Schema> {
    if (cached) return cached;

    const result = schema.safeParse(process.env);
    if (!result.success) {
      throw new EnvValidationError(scope, result.error.issues);
    }

    cached = result.data;
    return cached;
  };
}

/**
 * Each integration validates only the environment variables it actually
 * needs, on first use — so, for example, the Documentation feature (Notion)
 * never requires DATABASE_URL to be present, and vice versa. This mirrors
 * the least-privilege principle applied to credentials generally.
 */

const notionEnvSchema = z.object({
  NOTION_API_KEY: z.string().min(1, "NOTION_API_KEY is required"),
  NOTION_DOCUMENTATION_DB_ID: z.string().min(1, "NOTION_DOCUMENTATION_DB_ID is required"),
});

export const getNotionEnv = createLazyEnvAccessor("Notion", notionEnvSchema);

/** Non-throwing check for call sites that need to pick a fallback (e.g. fixture data) instead of failing. */
export function isNotionConfigured(): boolean {
  return notionEnvSchema.safeParse(process.env).success;
}

const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url({ message: "DATABASE_URL must be a valid Postgres connection string" }),
});

export const getDatabaseEnv = createLazyEnvAccessor("database", databaseEnvSchema);
