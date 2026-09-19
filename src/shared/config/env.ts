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
 * needs, on first use, and fails loudly and specifically when they are
 * missing or invalid. There is deliberately no "is it configured?" switch
 * that could route the running application to placeholder content: CMS
 * content comes from live Notion or the request fails (see ADR 009).
 */

const notionClientEnvSchema = z.object({
  NOTION_API_KEY: z.string().min(1, "NOTION_API_KEY is required"),
});

const notionDocumentationEnvSchema = z.object({
  NOTION_DOCUMENTATION_DB_ID: z.string().min(1, "NOTION_DOCUMENTATION_DB_ID is required"),
});

const notionHomeEnvSchema = z.object({
  NOTION_HOME_PAGE_ID: z.string().min(1, "NOTION_HOME_PAGE_ID is required"),
});

/** Credential for the Notion API — the only thing the Notion client needs. */
export const getNotionClientEnv = createLazyEnvAccessor("Notion client", notionClientEnvSchema);

/** Which Notion database holds the Documentation articles. */
export const getNotionDocumentationEnv = createLazyEnvAccessor(
  "Notion Documentation",
  notionDocumentationEnvSchema,
);

/** Which Notion page holds the Home editorial content. */
export const getNotionHomeEnv = createLazyEnvAccessor("Notion Home", notionHomeEnvSchema);

const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url({ message: "DATABASE_URL must be a valid Postgres connection string" }),
});

export const getDatabaseEnv = createLazyEnvAccessor("database", databaseEnvSchema);
