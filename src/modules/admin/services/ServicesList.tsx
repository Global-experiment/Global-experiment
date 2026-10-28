"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { adminApi, AdminApiError } from "../api/client";
import type { Service, ServicesOptions } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { formatDate } from "../people/peopleTable";
import { useCan } from "../session";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { SortRule } from "../table/listState";
import { SavedViews, type SavedView } from "../table/SavedViews";
import { AdminButton, chipInput, Popover } from "../ui/controls";
import { useToast } from "../ui/Toast";
import { grantLines, vocabularyOptions } from "./accessDisplay";

const DEFAULT_SORT: SortRule[] = [{ field: "name", direction: "asc" }];

const text = (value: string | null, search: string): ReactNode => (value ? <Highlight text={value} query={search} /> : null);

/** admin-desktop.pdf p16, measured: Name 220, Service ID 110, Status 160, Category 154, Hosting model 172, Responsible account 168, Permissions 220. */
const COLUMNS: TableColumn<Service>[] = [
  { id: "name", label: "Name", icon: "title", width: 220, render: (row, s) => text(row.name, s) },
  { id: "number", label: "Service ID", icon: "title", width: 110, render: (row) => String(row.serviceNumber) },
  { id: "status", label: "Status", icon: "select", width: 160, render: (row) => row.status?.label },
  { id: "category", label: "Category", icon: "select", width: 154, render: (row) => row.category?.label },
  { id: "hosting", label: "Hosting model", icon: "select", width: 172, render: (row) => row.hostingModel?.label },
  { id: "responsible", label: "Responsible account", icon: "arrow_outward", width: 168, render: (row) => row.responsible?.name },
  { id: "permissions", label: "Permissions", icon: "arrow_outward", width: 220, render: (row, s) => grantLines(row.permissions, s) },
  { id: "url", label: "URL", icon: "link", width: 220, defaultHidden: true, render: (row, s) => text(row.url, s) },
  { id: "description", label: "Description", icon: "title", width: 300, defaultHidden: true, render: (row, s) => text(row.description, s) },
  { id: "created", label: "Created", icon: "schedule", width: 120, defaultHidden: true, render: (row) => formatDate(row.createdAt) },
  { id: "updated", label: "Updated", icon: "schedule", width: 120, defaultHidden: true, render: (row) => formatDate(row.updatedAt) },
];

/** p16's views. Access review: the service, or one of its permissions, waits for a confirmation. */
const VIEWS: SavedView[] = [
  { id: "all", label: "All services", filters: [] },
  { id: "active", label: "Active services", filters: [{ field: "status", operator: "is", value: "active" }] },
  { id: "review", label: "Access review", filters: [{ field: "review", operator: "is", value: "true" }] },
];

function NewServiceControl() {
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
      const service = await adminApi<Service>("/services", { method: "POST", body: { name } });
      toast("Service created");
      router.push(`/admin/services/${service.id}`);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? (caught.issues[0]?.message ?? caught.message) : "Couldn't create the service.");
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <AdminButton ref={trigger} icon="add" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        New service
      </AdminButton>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label="New service" className="top-[calc(100%+8px)] right-0 w-80 p-3">
        <form onSubmit={create} className="flex flex-col gap-2">
          <label htmlFor="new-service-name" className="text-text-muted">
            Name
          </label>
          <input id="new-service-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoComplete="off" className={chipInput} />
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

/** /admin/services — the tools and accounts the experiment runs on (p16), each with who has access. */
export function ServicesList() {
  const options = useAdminData<ServicesOptions>("/services/options");
  const canCreate = useCan("services.create");
  const fields = useMemo<ListField[]>(
    () => [
      { id: "name", label: "Name", icon: "title", operators: ["contains", "not_contains"], sort: "text" },
      { id: "number", label: "Service ID", icon: "title", operators: [], sort: "text" },
      { id: "status", label: "Status", icon: "select", operators: ["is", "is_not", "is_empty"], options: vocabularyOptions(options.data?.statuses), sort: "text" },
      { id: "category", label: "Category", icon: "select", operators: ["is", "is_not", "is_empty"], options: vocabularyOptions(options.data?.categories), sort: "text" },
      { id: "hosting", label: "Hosting model", icon: "select", operators: ["is", "is_not", "is_empty"], options: vocabularyOptions(options.data?.hostingModels) },
      {
        id: "responsible",
        label: "Responsible account",
        icon: "arrow_outward",
        operators: ["is", "is_empty", "is_not_empty"],
        options: (options.data?.accounts ?? []).map((account) => ({ value: account.id, label: account.name })),
      },
      { id: "review", label: "Access review", icon: "check_box", operators: ["is"], options: [{ value: "true", label: "Needs review" }] },
      { id: "created", label: "Created", icon: "schedule", operators: [], sort: "dates" },
      { id: "updated", label: "Updated", icon: "schedule", operators: [], sort: "dates" },
    ],
    [options.data],
  );

  return (
    <AdminListPage<Service>
      config={{
        title: "Services",
        noun: "services",
        tableId: "services",
        endpoint: "/services",
        defaultSort: DEFAULT_SORT,
        fields,
        columns: COLUMNS,
        recordHref: (row) => `/admin/services/${row.id}`,
        views: <SavedViews views={VIEWS} archived />,
        actions: canCreate ? <NewServiceControl /> : null,
      }}
    />
  );
}
