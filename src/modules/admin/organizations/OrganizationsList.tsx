"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { adminApi, AdminApiError } from "../api/client";
import { formatOrgNumber, type ExpertiseTree, type Organization } from "../api/types";
import { completenessLabel } from "../completeness";
import { useAdminData } from "../api/useAdminData";
import { expertiseOptions, formatDate } from "../people/peopleTable";
import { AdminListPage } from "../table/AdminListPage";
import { NotionImportControl } from "../people/NotionImportControl";
import { ViewTabs } from "../table/ViewTabs";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { SortRule } from "../table/listState";
import { AdminButton, chipInput, Popover } from "../ui/controls";
import { useToast } from "../ui/Toast";

const DEFAULT_SORT: SortRule[] = [{ field: "name", direction: "asc" }];

const lines = (values: string[], search: string): ReactNode =>
  values.map((value, index) => (
    <span key={`${value}-${index}`} className="block">
      <Highlight text={value} query={search} />
    </span>
  ));
const text = (value: string | null, search: string) => (value ? <Highlight text={value} query={search} /> : null);

/** Organizations has no Figma frame: same table system and glyph vocabulary as People (p40). */
const COLUMNS: TableColumn<Organization>[] = [
  { id: "name", label: "Name", icon: "title", width: 220, render: (o, s) => text(o.name, s) },
  { id: "people", label: "People", icon: "arrow_outward", width: 220, render: (o, s) => lines(o.people.map((p) => p.name), s) },
  { id: "expertise", label: "Expertise", icon: "arrow_outward", width: 228, render: (o, s) => lines(o.expertise.map((e) => e.name), s) },
  { id: "website", label: "Website", icon: "link", width: 260, render: (o, s) => text(o.website, s) },
  { id: "email", label: "Email", icon: "alternate_email", width: 230, render: (o, s) => text(o.email, s) },
  { id: "description", label: "Description", icon: "title", width: 337, render: (o, s) => text(o.description, s) },
  { id: "wise_recipient_id", label: "Wise recipient ID", icon: "title", width: 160, render: (o) => o.wiseRecipientId },
  { id: "created", label: "Created", icon: "schedule", width: 120, render: (o) => formatDate(o.createdAt) },
  { id: "updated", label: "Updated", icon: "schedule", width: 120, render: (o) => formatDate(o.updatedAt) },
  { id: "number", label: "Organization ID", icon: "numbers", width: 120, render: (o) => formatOrgNumber(o.orgNumber) },
  {
    id: "completeness",
    label: "Completeness",
    icon: "check_box",
    width: 300,
    defaultHidden: true,
    render: (o) => <span className={o.missing.length === 0 ? "" : "text-text-muted"}>{completenessLabel(o.missing)}</span>,
  },
];

function NewOrganizationControl() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const organization = await adminApi<Organization>("/organizations", { method: "POST", body: { name } });
      toast("Organization created");
      router.push(`/admin/organizations/${organization.id}`);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't create the organization.");
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <AdminButton ref={trigger} icon="add" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        New organization
      </AdminButton>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label="New organization" className="top-[calc(100%+8px)] right-0 w-80 p-3">
        <form onSubmit={create} className="flex flex-col gap-2">
          <label htmlFor="new-organization-name" className="text-text-muted">
            Name
          </label>
          <input id="new-organization-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoComplete="off" className={chipInput} />
          {error ? (
            <p role="alert" className="text-text-primary">
              {error}
            </p>
          ) : null}
          <AdminButton type="submit" icon="add" disabled={saving || name.trim() === ""} className="self-start">
            Create
          </AdminButton>
        </form>
      </Popover>
    </div>
  );
}

export function OrganizationsList() {
  const tree = useAdminData<ExpertiseTree>("/expertise/tree");
  const fields = useMemo<ListField[]>(
    () => [
      { id: "name", label: "Name", icon: "title", operators: ["contains", "not_contains"], sort: "text" },
      { id: "people", label: "People", icon: "arrow_outward", operators: [], sort: "text" },
      { id: "person", label: "Has people", icon: "arrow_outward", operators: ["is_empty", "is_not_empty"] },
      { id: "expertise", label: "Expertise", icon: "arrow_outward", operators: ["is", "is_empty", "is_not_empty"], options: expertiseOptions(tree.data) },
      { id: "website", label: "Website", icon: "link", operators: ["is_empty", "is_not_empty"] },
      { id: "email", label: "Email", icon: "alternate_email", operators: ["contains", "is_empty", "is_not_empty"] },
      { id: "description", label: "Description", icon: "title", operators: ["contains", "is_empty", "is_not_empty"] },
      { id: "created", label: "Created", icon: "schedule", operators: [], sort: "dates" },
      { id: "updated", label: "Updated", icon: "schedule", operators: [], sort: "dates" },
      { id: "number", label: "Organization ID", icon: "numbers", operators: [], sort: "text" },
      {
        id: "completeness",
        label: "Completeness",
        icon: "check_box",
        operators: ["is"],
        options: [
          { value: "incomplete", label: "Incomplete" },
          { value: "complete", label: "Complete" },
        ],
      },
    ],
    [tree.data],
  );

  return (
    <AdminListPage<Organization>
      config={{
        title: "Organizations",
        noun: "organizations",
        tableId: "organizations",
        endpoint: "/organizations",
        defaultSort: DEFAULT_SORT,
        fields,
        columns: COLUMNS,
        recordHref: (organization) => `/admin/organizations/${organization.id}`,
        views: <ViewTabs views={[{ id: "all", label: "All" }]} current="all" />,
        actions: (
          <>
            <NotionImportControl />
            <NewOrganizationControl />
          </>
        ),
      }}
    />
  );
}
