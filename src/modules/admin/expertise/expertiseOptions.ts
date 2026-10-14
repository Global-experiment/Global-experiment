import type { EntityRef, ExpertiseRef, ExpertiseSearchItem } from "../api/types";
import type { RelationOption } from "../ui/RelationPicker";

/** "Domain > Field > Expertise". */
export const expertisePath = (ref: Pick<ExpertiseRef, "name" | "field" | "domain">) => `${ref.domain.name} > ${ref.field.name} > ${ref.name}`;

const statusNote = (status: ExpertiseRef["status"]) => (status && status.key !== "active" ? ` (${status.label})` : "");

/** A linked expertise, as a chip: the path in its tooltip, greyed out unless Active. */
export function linkedExpertiseOption(ref: ExpertiseRef): RelationOption {
  return {
    id: ref.id,
    label: ref.name,
    title: `${expertisePath(ref)}${statusNote(ref.status)}`,
    muted: ref.status?.key !== "active",
    group: { field: ref.field, domain: ref.domain },
  };
}

/** A search result: path and team chips; Proposed/Deprecated can't be newly picked. */
export function searchResultOption(item: ExpertiseSearchItem): RelationOption {
  return {
    id: item.id,
    label: item.name,
    detail: `${item.domain.name} > ${item.field.name}`,
    title: `${item.path}${statusNote(item.status)}`,
    tags: item.teams.map((team) => team.label),
    disabled: !item.selectable,
    disabledReason: item.selectable ? undefined : `${item.status?.label ?? "No status"}: only Active expertise can be added`,
    muted: !item.selectable,
    group: { field: item.field, domain: item.domain },
  };
}

/**
 * The Fields and Domains a set of expertise rolls up to — computed from the
 * links, never stored. Sorted by name, each listed once.
 */
export function expertiseRollup(selected: readonly RelationOption[]): { fields: EntityRef[]; domains: EntityRef[] } {
  const unique = (refs: EntityRef[]) =>
    [...new Map(refs.map((ref) => [ref.id, ref])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups = selected.flatMap((option) => (option.group ? [option.group] : []));
  return { fields: unique(groups.map((group) => group.field)), domains: unique(groups.map((group) => group.domain)) };
}
