/**
 * Every table, registered in one place for the typed Drizzle instance.
 * Each module owns its own `*.schema.ts`; add new modules here.
 */
export * from "../../auth/auth.schema.js";
export * from "../../expertise/expertise.schema.js";
export * from "../../import/import.schema.js";
export * from "../../organizations/organizations.schema.js";
export * from "../../people/people.schema.js";
export * from "../../settings/settings.schema.js";
export * from "../../stripe/stripe.schema.js";
export * from "../../treasury/treasury.schema.js";
