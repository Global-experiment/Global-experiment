import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

/** A 5-field cron expression (minute hour day month weekday) or "off"; checked again by the job runner. */
export const CRON_OR_OFF = /^(off|(\S+\s+){4}\S+)$/;
const cronOrOff = z.string().trim().regex(CRON_OR_OFF, 'must be a 5-field cron expression or "off"');

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
    /**
     * Notion "0.1 native" (admin import page). Server-side only: the token
     * never reaches the browser. Without them the import page says so.
     */
    NOTION_API_KEY: z.string().trim().optional(),
    NOTION_DOMAINS_DB_ID: z.string().trim().optional(),
    NOTION_FIELDS_DB_ID: z.string().trim().optional(),
    NOTION_EXPERTISE_DB_ID: z.string().trim().optional(),
    NOTION_PEOPLE_DB_ID: z.string().trim().optional(),
    NOTION_ORGANIZATIONS_DB_ID: z.string().trim().optional(),
    /** npm run api:import:treasury (roadmap module 1b). */
    NOTION_TREASURY_DB_ID: z.string().trim().optional(),
    /** Tests only: read the import source from a JSON file instead of Notion. */
    IMPORT_FIXTURE_FILE: z.string().trim().optional(),

    /**
     * Stripe (donations). Server-side only. Test keys (sk_test_/rk_test_) are
     * the default; a live key is refused unless STRIPE_LIVE_ENABLED=true.
     */
    STRIPE_SECRET_KEY: z.string().trim().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, "must be a Stripe secret or restricted key").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().trim().regex(/^whsec_[A-Za-z0-9]+$/, "must be a Stripe webhook signing secret").optional(),
    STRIPE_LIVE_ENABLED: booleanFromString.default(false),
    /** NODE_ENV=test only: the Playwright API answers from scripted Checkout sessions instead of Stripe (stripe-fixture.gateway.ts). */
    STRIPE_FIXTURE: booleanFromString.default(false),
    /** Stripe's no-code customer-portal login link (monthly donors manage their donation there). */
    STRIPE_CUSTOMER_PORTAL_URL: z.url({ protocol: /^https$/ }).optional(),
    /** Minutes between fee fill-in runs for Stripe entries whose fee wasn't known yet (0 = off). */
    STRIPE_FEE_RECONCILE_MINUTES: z.coerce.number().int().min(0).max(24 * 60).default(15),
    /** The public site, for Checkout success/cancel URLs and the donation Origin check. */
    PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** The Next.js server the API asks to revalidate public pages (internal address). */
    WEB_INTERNAL_URL: z.url({ protocol: /^https?$/ }).optional(),
    REVALIDATE_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
    /** Environment defaults of the donation settings (data-model.md §1.1). */
    /** Default of the donations.enabled setting: Checkout is refused until donations open. */
    DONATIONS_ENABLED: booleanFromString.default(false),
    /** Environment defaults of the Treasury settings (pending client answers; data-model.md §1.1). */
    TREASURY_PUBLIC_RECIPIENT_NAMES: booleanFromString.default(false),
    TREASURY_PUBLISH_UNQUALIFIED: booleanFromString.default(false),
    TREASURY_WISE_CONNECTED: booleanFromString.default(false),
    TREASURY_DONATION_APPEAL: booleanFromString.default(false),
    TREASURY_SHOW_TEST_DONATIONS: booleanFromString.default(false),
    /** Default schedules of the Notion imports: a 5-field cron expression (server time zone: UTC), or "off". */
    IMPORT_SCHEDULE_TAXONOMY: cronOrOff.default("off"),
    IMPORT_SCHEDULE_DIRECTORY: cronOrOff.default("off"),
    IMPORT_SCHEDULE_TREASURY: cronOrOff.default("off"),
    /**
     * Treasury supporting documents (overview §3.4): a private directory
     * outside every web root, owned by the API user, included in backups.
     * Defaults: production /var/lib/global-experiment/files, elsewhere
     * ./.data/files next to the API.
     */
    FILE_STORAGE_DIR: z.string().trim().min(1).optional(),
    /**
     * Background jobs (overview §3.3): "pgboss" (PostgreSQL queue, the
     * default) or "inprocess" (runs jobs at once in this process, no
     * durability — the default under NODE_ENV=test).
     */
    JOBS_DRIVER: z.enum(["pgboss", "inprocess"]).optional(),
    /** Private preview link (/donate?preview=<token>): a test checkout while donations are closed. */
    DONATIONS_PREVIEW_TOKEN: z.string().trim().regex(/^[A-Za-z0-9_-]{32,128}$/, "must be 32–128 letters, digits, - or _").optional(),
    DONATIONS_MONTHLY: booleanFromString.default(false),
    DONATIONS_EXTRA_METHODS: booleanFromString.default(false),
    DONATIONS_DEFAULT_CURRENCY: z.enum(["EUR", "USD", "CHF"]).default("USD"),
  })
  .transform((env, context) => {
    const production = env.NODE_ENV === "production";
    if (production && !env.ADMIN_ALLOWED_ORIGINS) {
      context.addIssue({ code: "custom", path: ["ADMIN_ALLOWED_ORIGINS"], message: "is required in production" });
    }
    if (production && env.COOKIE_SECURE === false) {
      context.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "cannot be false in production" });
    }
    if (env.IMPORT_FIXTURE_FILE && env.NODE_ENV !== "test") {
      context.addIssue({ code: "custom", path: ["IMPORT_FIXTURE_FILE"], message: "is only allowed when NODE_ENV is test" });
    }
    if (env.STRIPE_FIXTURE && env.NODE_ENV !== "test") {
      context.addIssue({ code: "custom", path: ["STRIPE_FIXTURE"], message: "is only allowed when NODE_ENV is test" });
    }
    const stripeLive = Boolean(env.STRIPE_SECRET_KEY && /_live_/.test(env.STRIPE_SECRET_KEY));
    if (stripeLive && !env.STRIPE_LIVE_ENABLED) {
      context.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "is a live key; set STRIPE_LIVE_ENABLED=true to allow it" });
    }
    if (production && env.STRIPE_SECRET_KEY) {
      for (const key of ["STRIPE_WEBHOOK_SECRET", "PUBLIC_SITE_URL", "WEB_INTERNAL_URL", "REVALIDATE_SECRET"] as const) {
        if (!env[key]) context.addIssue({ code: "custom", path: [key], message: "is required in production when Stripe is configured" });
      }
    }
    const id = (value: string | undefined) => (value ? value : undefined);
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
      notion: {
        token: id(env.NOTION_API_KEY),
        databases: {
          domains: id(env.NOTION_DOMAINS_DB_ID),
          fields: id(env.NOTION_FIELDS_DB_ID),
          expertise: id(env.NOTION_EXPERTISE_DB_ID),
          people: id(env.NOTION_PEOPLE_DB_ID),
          organizations: id(env.NOTION_ORGANIZATIONS_DB_ID),
          treasury: id(env.NOTION_TREASURY_DB_ID),
        },
        fixtureFile: id(env.IMPORT_FIXTURE_FILE),
      },
      stripe: {
        secretKey: id(env.STRIPE_SECRET_KEY),
        webhookSecret: id(env.STRIPE_WEBHOOK_SECRET),
        /** Events from the other mode (live vs test) are ignored. */
        livemode: stripeLive,
        customerPortalUrl: id(env.STRIPE_CUSTOMER_PORTAL_URL),
        feeReconcileMinutes: env.STRIPE_FEE_RECONCILE_MINUTES,
        fixture: env.STRIPE_FIXTURE,
      },
      publicSiteUrl: new URL(env.PUBLIC_SITE_URL ?? "http://localhost:3000").origin,
      revalidation: {
        webUrl: new URL(env.WEB_INTERNAL_URL ?? "http://127.0.0.1:3000").origin,
        secret: id(env.REVALIDATE_SECRET),
      },
      treasuryDefaults: {
        publicRecipientNames: env.TREASURY_PUBLIC_RECIPIENT_NAMES,
        publishUnqualified: env.TREASURY_PUBLISH_UNQUALIFIED,
        wiseConnected: env.TREASURY_WISE_CONNECTED,
        donationAppeal: env.TREASURY_DONATION_APPEAL,
        showTestDonations: env.TREASURY_SHOW_TEST_DONATIONS,
      },
      importSchedules: {
        taxonomy: env.IMPORT_SCHEDULE_TAXONOMY,
        directory: env.IMPORT_SCHEDULE_DIRECTORY,
        treasury: env.IMPORT_SCHEDULE_TREASURY,
      },
      fileStorageDir: env.FILE_STORAGE_DIR ?? (production ? "/var/lib/global-experiment/files" : ".data/files"),
      jobsDriver: env.JOBS_DRIVER ?? (env.NODE_ENV === "test" ? "inprocess" : "pgboss"),
      donationPreviewToken: id(env.DONATIONS_PREVIEW_TOKEN),
      donationDefaults: {
        enabled: env.DONATIONS_ENABLED,
        monthly: env.DONATIONS_MONTHLY,
        extraMethods: env.DONATIONS_EXTRA_METHODS,
        defaultCurrency: env.DONATIONS_DEFAULT_CURRENCY,
      },
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
