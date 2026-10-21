import { z } from "zod";
import type { AppConfig } from "../common/config/env.js";
import { CRON_OR_OFF } from "../common/config/env.js";
import { TREASURY_CURRENCIES } from "../treasury/treasury.schema.js";

/**
 * Every setting the application reads, declared once with its type and its
 * environment default (docs/architecture/data-model.md §1.1). A row in
 * `settings` overrides the default; no row means "use the environment",
 * so a fresh database needs no seed. `public` settings may be exposed to
 * the public site (never secrets).
 */
interface SettingDefinition<Value> {
  schema: z.ZodType<Value>;
  envDefault: (config: AppConfig) => Value;
  public: boolean;
  description: string;
}

const define = <Value>(definition: SettingDefinition<Value>) => definition;

/** Sample Balance and Sustainability (treasury.sample_figures): trends in percent. */
export const SampleFiguresSchema = z.object({
  balance: z.object({ USD: z.number().int().optional(), EUR: z.number().int().optional(), CHF: z.number().int().optional() }),
  sustainability: z.number().min(0).max(10),
  trends: z.object({ balance: z.number().optional(), sustainability: z.number().optional() }),
});
export type SampleFigures = z.infer<typeof SampleFiguresSchema>;

export const SETTINGS = {
  "donations.enabled": define({
    schema: z.boolean(),
    envDefault: (config) => config.donationDefaults.enabled,
    public: true,
    description: "Donations are open: the donate page offers Checkout (otherwise \"Donations open soon\").",
  }),
  "donations.monthly": define({
    schema: z.boolean(),
    envDefault: (config) => config.donationDefaults.monthly,
    public: true,
    description: "Monthly donations (Stripe subscriptions) are offered on the donate page.",
  }),
  "donations.extra_methods": define({
    schema: z.boolean(),
    envDefault: (config) => config.donationDefaults.extraMethods,
    public: true,
    description: "PayPal and SEPA Direct Debit rows are offered on the donate page.",
  }),
  "donations.default_currency": define({
    schema: z.enum(TREASURY_CURRENCIES),
    envDefault: (config) => config.donationDefaults.defaultCurrency,
    public: true,
    description: "The donate page's initial currency.",
  }),
  "donations.paypal_monthly": define({
    schema: z.boolean(),
    envDefault: (config) => config.donationDefaults.paypalMonthly,
    public: true,
    description:
      "PayPal is offered for monthly donations (Stripe subscriptions). Needs PayPal recurring payments enabled on the Stripe account; the sandbox allows it (checked 2026-10-19).",
  }),
  "donations.checkout": define({
    schema: z.enum(["embedded", "hosted"]),
    envDefault: (config) => config.donationDefaults.checkout,
    public: true,
    description:
      "How a one-off card donation is paid: \"embedded\" (Stripe's card fields on the donate page, no email asked) or \"hosted\" (Stripe Checkout). Monthly donations always use hosted Checkout.",
  }),
  // Treasury (roadmap 1b) — pending client answers, so behind settings.
  "treasury.public_recipient_names": define({
    schema: z.boolean(),
    envDefault: (config) => config.treasuryDefaults.publicRecipientNames,
    public: true,
    description: "Public Treasury pages show an expense's recipient name (person or organization). Off: only the public description (Q3).",
  }),
  "treasury.publish_unqualified": define({
    schema: z.boolean(),
    envDefault: (config) => config.treasuryDefaults.publishUnqualified,
    public: true,
    description: "Unqualified expenses may be published (shown as \"Not qualified yet\"). Off: only Qualified / Not required entries can be published or are public (Q25).",
  }),
  "treasury.wise_connected": define({
    schema: z.boolean(),
    envDefault: (config) => config.treasuryDefaults.wiseConnected,
    public: true,
    description: "The Wise account is connected: the Treasury page shows Balance and Sustainability.",
  }),
  "treasury.donation_appeal": define({
    schema: z.boolean(),
    envDefault: (config) => config.treasuryDefaults.donationAppeal,
    public: true,
    description: "The Treasury page shows the \"Cry for donation\" banner. Turned on by hand until Wise gives a Sustainability score to trigger it.",
  }),
  "treasury.stats_currency": define({
    schema: z.enum(TREASURY_CURRENCIES),
    envDefault: (config) => config.treasuryDefaults.statsCurrency,
    public: true,
    description: "The currency of the public Treasury's stats (decided 2026-10-19: the page header has no currency switch; the history lists every currency).",
  }),
  "treasury.public_toolbar": define({
    schema: z.boolean(),
    envDefault: (config) => config.treasuryDefaults.publicToolbar,
    public: true,
    description: "The public Treasury's search, sort and filter controls (and its currency switch). Off (2026-10-19): the history is latest first, every currency.",
  }),
  "treasury.show_test_donations": define({
    schema: z.boolean(),
    envDefault: (config) => config.treasuryDefaults.showTestDonations,
    public: true,
    description:
      "Before go-live, production shows Stripe test-mode (sandbox) donations on the public Treasury, marked Test. Ignored with a live Stripe key: then only live donations are public.",
  }),
  "treasury.sample_figures": define({
    schema: SampleFiguresSchema.nullable(),
    envDefault: () => null,
    public: true,
    description:
      "Before Wise is connected: sample Balance (per currency, minor units) and Sustainability figures, with their trends, shown on the Treasury page and marked as samples. Set and removed by the sample-treasury commands; ignored once Wise is connected.",
  }),
  // Decision 11 of 2026-10-19: every opening counts as a view; the history shows one "viewed" per account per window.
  "history.view_event_window_hours": define({
    schema: z.number().int().min(1).max(24 * 30),
    envDefault: () => 24,
    public: false,
    description: "A record's history shows \"viewed this page\" at most once per account per this many hours (every opening still counts).",
  }),
  // Decision 7: the AI relevance score becomes read-only once an AI fills it.
  "ai.enabled": define({
    schema: z.boolean(),
    envDefault: () => false,
    public: false,
    description: "AI features are on: the AI relevance score is filled automatically and read-only in the admin.",
  }),
  // Scheduled Notion imports (overview §3.3): cron in UTC, or "off". Read when the API starts.
  "imports.taxonomy.schedule": define({
    schema: z.string().regex(CRON_OR_OFF),
    envDefault: (config) => config.importSchedules.taxonomy,
    public: false,
    description: "Schedule of the taxonomy import (cron, UTC) or off.",
  }),
  "imports.directory.schedule": define({
    schema: z.string().regex(CRON_OR_OFF),
    envDefault: (config) => config.importSchedules.directory,
    public: false,
    description: "Schedule of the People & Organizations import (cron, UTC) or off.",
  }),
  "imports.treasury.schedule": define({
    schema: z.string().regex(CRON_OR_OFF),
    envDefault: (config) => config.importSchedules.treasury,
    public: false,
    description: "Schedule of the Treasury (expenses) import (cron, UTC) or off.",
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<Key extends SettingKey> = (typeof SETTINGS)[Key] extends SettingDefinition<infer Value> ? Value : never;
