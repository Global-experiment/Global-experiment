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
