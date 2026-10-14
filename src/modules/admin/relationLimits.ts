/**
 * Relationship caps, mirrored from the API (apps/api/src/common/relation-limits.ts),
 * which enforces them on every write path; the UI stops before the cap and
 * shows Figma's hint ("People can have up to 10 expertise.").
 */
export const RELATION_LIMITS = {
  expertise: 10,
  organizationsPerPerson: 5,
} as const;

export const LIMIT_HINTS = {
  personExpertise: `People can have up to ${RELATION_LIMITS.expertise} expertise.`,
  personOrganizations: `People can have up to ${RELATION_LIMITS.organizationsPerPerson} organizations.`,
  organizationExpertise: `Organizations can have up to ${RELATION_LIMITS.expertise} expertise.`,
} as const;
