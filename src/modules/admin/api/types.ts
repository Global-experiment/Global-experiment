/**
 * The admin API's JSON contracts as the frontend sees them (mirrors
 * apps/api/src/{people,organizations,expertise}/*.contracts.ts). Components
 * only ever handle these shapes — never database rows.
 */

export interface EntityRef {
  id: string;
  name: string;
}

export interface ExpertiseRef extends EntityRef {
  field: EntityRef;
  domain: EntityRef;
}

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface Person {
  id: string;
  name: string;
  state: VocabularyEntry | null;
  source: VocabularyEntry | null;
  personalNote: string | null;
  doNotContact: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  linkedin: string | null;
  x: string | null;
  otherContact: string | null;
  lastFollowupAt: string | null;
  createdAt: string;
  updatedAt: string;
  organizations: EntityRef[];
  expertise: ExpertiseRef[];
}

export interface PersonInput {
  name?: string;
  stateKey?: string | null;
  sourceKey?: string | null;
  personalNote?: string | null;
  doNotContact?: boolean;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  x?: string | null;
  otherContact?: string | null;
  lastFollowupAt?: string | null;
  organizationIds?: string[];
  expertiseIds?: string[];
}

export interface Organization {
  id: string;
  name: string;
  website: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  people: EntityRef[];
  expertise: ExpertiseRef[];
}

export interface OrganizationInput {
  name?: string;
  website?: string | null;
  note?: string | null;
  expertiseIds?: string[];
}

export interface PeopleOptions {
  states: VocabularyEntry[];
  sources: VocabularyEntry[];
}

export interface Page<Item> {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ExpertiseItemNode {
  id: string;
  name: string;
  peopleCount: number;
  organizationCount: number;
}

export interface ExpertiseFieldNode {
  id: string;
  name: string;
  items: ExpertiseItemNode[];
}

export interface ExpertiseDomainNode {
  id: string;
  name: string;
  fields: ExpertiseFieldNode[];
}

export interface ExpertiseTree {
  domains: ExpertiseDomainNode[];
}

export interface AdminPrincipal {
  id: string;
  email: string;
  role: string;
}
