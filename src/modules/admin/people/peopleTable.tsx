import type { ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { Icon } from "@/shared/ui/icons";
import { formatPersonNumber, type ExpertiseTree, type Organization, type PeopleOptions, type Person } from "../api/types";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { SortRule } from "../table/listState";

export const PEOPLE_DEFAULT_SORT: SortRule[] = [{ field: "created", direction: "desc" }];

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
export const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "");
/** A calendar date (YYYY-MM-DD) shown as that same day, whatever the viewer's time zone. */
const calendarFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const formatCalendarDate = (day: string | null) => (day ? calendarFormat.format(new Date(`${day}T00:00:00Z`)) : "");

const lines = (values: string[], search: string): ReactNode =>
  values.map((value, index) => (
    <span key={`${value}-${index}`} className="block">
      <Highlight text={value} query={search} />
    </span>
  ));

const text = (value: string | null, search: string) => (value ? <Highlight text={value} query={search} /> : null);

/**
 * People columns in Figma's order (figma.pdf p40 + p44) with Figma's type
 * glyphs and the p40 widths for the first six. Figma's "Number" is the
 * Notion Person ID (PER-n, docs/architecture/data-model.md §2). Not shown:
 * "Access grant" and "Expenses" (modules that don't exist yet).
 */
export const PEOPLE_COLUMNS: TableColumn<Person>[] = [
  { id: "name", label: "Name", icon: "title", width: 170, render: (p, s) => text(p.name, s) },
  { id: "state", label: "State", icon: "select", width: 130, render: (p) => p.state?.label ?? null },
  { id: "source", label: "Source", icon: "select", width: 124, render: (p) => p.source?.label ?? null },
  { id: "expertise", label: "Expertise", icon: "arrow_outward", width: 228, render: (p, s) => lines(p.expertise.map((e) => e.name), s) },
  { id: "personal_note", label: "Personal note", icon: "title", width: 337, render: (p, s) => text(p.personalNote, s) },
  { id: "organization", label: "Organization", icon: "arrow_outward", width: 237, render: (p, s) => lines(p.organizations.map((o) => o.name), s) },
  {
    id: "do_not_contact",
    label: "Do not contact",
    icon: "check_box",
    width: 128,
    render: (p) => (
      <>
        <Icon name={p.doNotContact ? "check_box" : "check_box_outline_blank"} className={p.doNotContact ? "" : "text-text-muted"} />
        <span className="sr-only">{p.doNotContact ? "Yes" : "No"}</span>
      </>
    ),
  },
  { id: "email", label: "Email", icon: "alternate_email", width: 230, render: (p, s) => text(p.email, s) },
  { id: "phone", label: "Phone", icon: "call", width: 150, render: (p, s) => text(p.phone, s) },
  { id: "website", label: "Website", icon: "link", width: 220, render: (p, s) => text(p.website, s) },
  { id: "linkedin", label: "Linkedin", icon: "link", width: 220, render: (p, s) => text(p.linkedin, s) },
  { id: "x", label: "X", icon: "link", width: 150, render: (p, s) => text(p.x, s) },
  { id: "other_contact", label: "Other contact", icon: "title", width: 160, render: (p, s) => text(p.otherContact, s) },
  { id: "wise_recipient_id", label: "Wise recipient ID", icon: "title", width: 160, render: (p) => p.wiseRecipientId },
  { id: "created", label: "Created", icon: "schedule", width: 120, render: (p) => formatDate(p.createdAt) },
  { id: "updated", label: "Updated", icon: "schedule", width: 120, render: (p) => formatDate(p.updatedAt) },
  { id: "next_followup", label: "Follow-up date", icon: "schedule", width: 140, render: (p) => formatCalendarDate(p.nextFollowupOn) },
  { id: "number", label: "Person ID", icon: "numbers", width: 100, render: (p) => formatPersonNumber(p.personNumber) },
];

export function expertiseOptions(tree: ExpertiseTree | undefined) {
  return (tree?.domains ?? []).flatMap((domain) =>
    domain.fields.flatMap((field) => field.items.map((item) => ({ value: item.id, label: `${item.name} · ${field.name}` }))),
  );
}

/** Filterable/sortable fields — exactly what the API's People list contract accepts. */
export function peopleFields(
  options: PeopleOptions | undefined,
  organizations: Organization[] | undefined,
  tree: ExpertiseTree | undefined,
): ListField[] {
  const vocabulary = (entries: PeopleOptions["states"] | undefined) => (entries ?? []).map((entry) => ({ value: entry.key, label: entry.label }));
  return [
    { id: "name", label: "Name", icon: "title", operators: ["contains", "not_contains"], sort: "text" },
    { id: "state", label: "State", icon: "select", operators: ["is", "is_not", "is_empty", "is_not_empty"], options: vocabulary(options?.states), sort: "text" },
    { id: "source", label: "Source", icon: "select", operators: ["is", "is_not", "is_empty", "is_not_empty"], options: vocabulary(options?.sources), sort: "text" },
    { id: "expertise", label: "Expertise", icon: "arrow_outward", operators: ["is", "is_empty", "is_not_empty"], options: expertiseOptions(tree) },
    { id: "personal_note", label: "Personal note", icon: "title", operators: ["contains", "not_contains", "is_empty", "is_not_empty"] },
    {
      id: "organization",
      label: "Organization",
      icon: "arrow_outward",
      operators: ["is", "is_empty", "is_not_empty"],
      options: (organizations ?? []).map((organization) => ({ value: organization.id, label: organization.name })),
    },
    {
      id: "do_not_contact",
      label: "Do not contact",
      icon: "check_box",
      operators: ["is"],
      options: [
        { value: "true", label: "Checked" },
        { value: "false", label: "Unchecked" },
      ],
    },
    { id: "email", label: "Email", icon: "alternate_email", operators: ["contains", "is_empty", "is_not_empty"] },
    { id: "created", label: "Created", icon: "schedule", operators: [], sort: "dates" },
    { id: "updated", label: "Updated", icon: "schedule", operators: [], sort: "dates" },
    { id: "next_followup", label: "Follow-up date", icon: "schedule", operators: [], sort: "dates" },
    { id: "number", label: "Person ID", icon: "numbers", operators: [], sort: "text" },
  ];
}
