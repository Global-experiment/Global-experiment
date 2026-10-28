/**
 * Which person fields the record shows (config, not code — decision 9 of
 * 2026-10-19 and the prototype). Hidden fields keep their data: Phone moved
 * into "Other contact details" in Figma; the Wise recipient ID isn't in the
 * prototype; Contracting waits for its module. Permissions show the
 * person's access grants (Delivery 2).
 */
export const PERSON_RECORD_CONFIG = {
  email: { hidden: false },
  phone: { hidden: true },
  website: { hidden: false },
  x: { hidden: false },
  linkedin: { hidden: false },
  otherSocials: { hidden: false },
  wiseRecipientId: { hidden: true },
  permissions: { hidden: false },
  contracting: { hidden: true },
} as const satisfies Record<string, { hidden: boolean }>;
