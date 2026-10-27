import type { OrganizationCompletenessField, PersonCompletenessField } from "./api/types";

/**
 * Completeness, the client's required-for-completeness fields (same rules as
 * the API's `missing`, apps/api …/people.repository.ts and
 * organizations.repository.ts) — computed here from the form as it's edited.
 */
export function personMissing(draft: { stateKey: string; sourceKey: string; description: string; expertise: readonly unknown[] }): PersonCompletenessField[] {
  const missing: PersonCompletenessField[] = [];
  if (!draft.stateKey) missing.push("State");
  if (!draft.sourceKey) missing.push("Source");
  if (!draft.description.trim()) missing.push("Description");
  if (draft.expertise.length === 0) missing.push("Expertise");
  return missing;
}

export function organizationMissing(draft: {
  description: string;
  website: string;
  email: string;
  wiseRecipientId: string;
  expertise: readonly unknown[];
}): OrganizationCompletenessField[] {
  const missing: OrganizationCompletenessField[] = [];
  if (!draft.description.trim()) missing.push("Description");
  if (!draft.website.trim()) missing.push("Website");
  if (!draft.email.trim()) missing.push("Email");
  if (!draft.wiseRecipientId.trim()) missing.push("Wise recipient ID");
  if (draft.expertise.length === 0) missing.push("Expertise");
  return missing;
}

/** "Complete" or "Missing: State, Expertise". */
export const completenessLabel = (missing: readonly string[]) => (missing.length === 0 ? "Complete" : `Missing: ${missing.join(", ")}`);
