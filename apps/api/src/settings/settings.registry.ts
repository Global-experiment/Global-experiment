import { z } from "zod";
import type { AppConfig } from "../common/config/env.js";
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
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<Key extends SettingKey> = (typeof SETTINGS)[Key] extends SettingDefinition<infer Value> ? Value : never;
