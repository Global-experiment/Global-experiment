"use client";

import { useMemo, type ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import type { Grant, ServicesOptions } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { formatDate } from "../people/peopleTable";
import { useCan } from "../session";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { SortRule } from "../table/listState";
import { SavedViews, type SavedView } from "../table/SavedViews";
import { AdminButtonLink } from "../ui/controls";
import { formatCalendarDay } from "../ui/RecordForm";
import { vocabularyOptions } from "./accessDisplay";

const DEFAULT_SORT: SortRule[] = [{ field: "name", direction: "asc" }];

const text = (value: string | null, search: string): ReactNode => (value ? <Highlight text={value} query={search} /> : null);
const day = (value: string | null) => (value ? formatCalendarDay(value) : null);

/**
 * admin-desktop.pdf p17, measured: Name 280, ID 64, Account 154, Service 184, Permission level 148, Status 164, Resource scope 260.
 * "Account" is who holds the access: the person, else the admin account alone.
 */
const COLUMNS: TableColumn<Grant>[] = [
  { id: "name", label: "Name", icon: "title", width: 280, render: (row, s) => text(row.title, s) },
  { id: "number", label: "ID", icon: "title", width: 64, render: (row) => String(row.grantNumber) },
  { id: "account", label: "Account", icon: "arrow_outward", width: 154, render: (row, s) => text(row.person?.name ?? row.account?.name ?? null, s) },
  { id: "service", label: "Service", icon: "arrow_outward", width: 184, render: (row, s) => text(row.service.name, s) },
  { id: "level", label: "Permission level", icon: "select", width: 148, render: (row) => row.level?.label },
  { id: "status", label: "Status", icon: "select", width: 164, render: (row) => row.status?.label },
  { id: "scope", label: "Resource scope", icon: "title", width: 260, render: (row, s) => text(row.resourceScope, s) },
  { id: "granted", label: "Granted", icon: "schedule", width: 120, defaultHidden: true, render: (row) => day(row.grantedOn) },
  { id: "expires", label: "Expires", icon: "schedule", width: 120, defaultHidden: true, render: (row) => day(row.expiresOn) },
  { id: "revoked", label: "Revoked", icon: "schedule", width: 120, defaultHidden: true, render: (row) => day(row.revokedOn) },
  { id: "updated", label: "Updated", icon: "schedule", width: 120, defaultHidden: true, render: (row) => formatDate(row.updatedAt) },
];

/** p17's views. Review queue: needs confirmation, planned or invited, or expiring within 30 days. */
const VIEWS: SavedView[] = [
  { id: "all", label: "All permissions", filters: [] },
  { id: "active", label: "Active permissions", filters: [{ field: "status", operator: "is", value: "active" }] },
  { id: "review", label: "Review queue", filters: [{ field: "review", operator: "is", value: "true" }] },
];

/** /admin/permissions — every access grant (p17): who has which access to which service. */
export function GrantsList() {
  const options = useAdminData<ServicesOptions>("/services/options");
  const canCreate = useCan("access.create");
  const fields = useMemo<ListField[]>(
    () => [
      { id: "name", label: "Name", icon: "title", operators: [], sort: "text" },
      { id: "number", label: "ID", icon: "title", operators: [], sort: "text" },
      { id: "service", label: "Service", icon: "arrow_outward", operators: [], sort: "text" },
      {
        id: "account",
        label: "Account",
        icon: "arrow_outward",
        operators: ["is", "is_empty", "is_not_empty"],
        options: (options.data?.accounts ?? []).map((account) => ({ value: account.id, label: account.name })),
        sort: "text",
      },
      { id: "person", label: "Person", icon: "arrow_outward", operators: ["is_empty", "is_not_empty"] },
      { id: "level", label: "Permission level", icon: "select", operators: ["is", "is_not", "is_empty"], options: vocabularyOptions(options.data?.levels), sort: "text" },
      { id: "status", label: "Status", icon: "select", operators: ["is", "is_not", "is_empty"], options: vocabularyOptions(options.data?.accessStatuses), sort: "text" },
      { id: "review", label: "Review queue", icon: "check_box", operators: ["is"], options: [{ value: "true", label: "Needs review" }] },
      { id: "expires", label: "Expires", icon: "schedule", operators: [], sort: "dates" },
      { id: "updated", label: "Updated", icon: "schedule", operators: [], sort: "dates" },
      { id: "created", label: "Created", icon: "schedule", operators: [], sort: "dates" },
    ],
    [options.data],
  );

  return (
    <AdminListPage<Grant>
      config={{
        title: "Permissions",
        noun: "permissions",
        tableId: "permissions",
        endpoint: "/access-grants",
        defaultSort: DEFAULT_SORT,
        fields,
        columns: COLUMNS,
        recordHref: (row) => `/admin/permissions/${row.id}`,
        views: <SavedViews views={VIEWS} archived />,
        actions: canCreate ? (
          <AdminButtonLink href="/admin/permissions/new" icon="add">
            New permission
          </AdminButtonLink>
        ) : null,
      }}
    />
  );
}
