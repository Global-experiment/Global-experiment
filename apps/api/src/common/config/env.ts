import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const originList = z
  .string()
  .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
  .pipe(z.array(z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin)).min(1));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "DATABASE_URL must be a postgres:// connection string" }),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    /** Origins allowed to make state-changing admin requests (CSRF Origin check). */
    ADMIN_ALLOWED_ORIGINS: originList.optional(),
    ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(8 * 60),
    ADMIN_SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    /** Number of reverse-proxy hops to trust for the client IP (0 = none). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Defaults to true in production; only ever false for plain-http local development. */
    COOKIE_SECURE: booleanFromString.optional(),
  })
  .transform((env, context) => {
    const production = env.NODE_ENV === "production";
    if (production && !env.ADMIN_ALLOWED_ORIGINS) {
      context.addIssue({ code: "custom", path: ["ADMIN_ALLOWED_ORIGINS"], message: "is required in production" });
    }
    if (production && env.COOKIE_SECURE === false) {
      context.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "cannot be false in production" });
    }
    return {
      nodeEnv: env.NODE_ENV,
      host: env.API_HOST,
      port: env.API_PORT,
      databaseUrl: env.DATABASE_URL,
      logLevel: env.LOG_LEVEL ?? (production ? "info" : env.NODE_ENV === "test" ? "silent" : "debug"),
      adminAllowedOrigins: env.ADMIN_ALLOWED_ORIGINS ?? ["http://localhost:3000", "http://localhost:3100"],
      session: {
        idleMinutes: env.ADMIN_SESSION_IDLE_MINUTES,
        maxDays: env.ADMIN_SESSION_MAX_DAYS,
      },
      trustProxyHops: env.TRUST_PROXY_HOPS,
      cookieSecure: env.COOKIE_SECURE ?? production,
    };
  });

export type AppConfig = z.output<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    // Variable names and rule messages only — never the offending values.
    const lines = issues.map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    super(`Invalid API environment configuration:\n${lines.join("\n")}`);
    this.name = "EnvValidationError";
  }
}

export function parseConfig(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) throw new EnvValidationError(result.error.issues);
  return result.data;
}
