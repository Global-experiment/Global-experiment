import { organizationLabel } from "../audit/entity-labels.js";
import type { FieldSpec } from "../audit/record-fields.js";
import type { OrganizationDto } from "./organizations.contracts.js";

/** The organization fields the history records; contact details are `contact` (masked in the history by default). */
export const ORGANIZATION_FIELDS: readonly FieldSpec<OrganizationDto>[] = [
  { field: "name", label: "Name", kind: "text", get: (o) => o.name },
  { field: "description", label: "Description", kind: "text", get: (o) => o.description },
  { field: "expertise", label: "Expertise", kind: "relation", ordered: true, get: (o) => o.expertise.map((item) => ({ id: item.id, label: item.name })) },
  { field: "people", label: "People", kind: "relation", get: (o) => o.people.map((person) => ({ id: person.id, label: person.name })) },
  { field: "website", label: "Website", kind: "url", get: (o) => o.website },
  { field: "email", label: "Email", kind: "email", privacy: "contact", get: (o) => o.email },
  { field: "wiseRecipientId", label: "Wise recipient ID", kind: "text", privacy: "contact", get: (o) => o.wiseRecipientId },
];

export const labelOfOrganization = (organization: Pick<OrganizationDto, "orgNumber" | "name">) => organizationLabel(organization);
