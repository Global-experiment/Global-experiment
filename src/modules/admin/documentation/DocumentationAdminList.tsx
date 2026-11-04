"use client";

import { useCallback, useMemo } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import type { CmsDocumentListItem, CmsState } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { useCan } from "../session";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { ListState } from "../table/listState";
import { applyListState, type LocalListSpec } from "../table/localList";
import { AdminButtonLink, StatusMessage } from "../ui/controls";

export const STATE_LABELS: Record<CmsState, string> = { published: "Published", draft: "Draft", unpublished: "Unpublished", archived: "Archived" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso ? <time dateTime={iso}>{dateTime.format(new Date(iso))}</time> : <span className="text-text-muted">Not yet</span>);

/** admin-desktop.pdf p9 (whose columns are the People template's): Name, State, Expertise, and the documentation's own Display order, editor and dates. */
const COLUMNS: TableColumn<CmsDocumentListItem>[] = [
  { id: "title", label: "Name", icon: "title", width: 280, render: (row, search) => <Highlight text={row.title} query={search} /> },
  {
    id: "state",
    label: "State",
    icon: "select",
    width: 150,
    render: (row) => (
      <span>
        {STATE_LABELS[row.state]}
        {row.hasDraft ? <span className="text-text-muted"> · draft changes</span> : null}
      </span>
    ),
  },
  { id: "display_order", label: "Display order", icon: "numbers", width: 120, render: (row) => <span className="tabular-nums">{row.displayOrder}</span> },
  {
    id: "expertise",
    label: "Expertise",
    icon: "arrow_outward",
    width: 240,
    render: (row) => (
      <span className="flex flex-col">
        {row.expertise.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </span>
    ),
  },
  { id: "slug", label: "Slug", icon: "title", width: 220, defaultHidden: true, render: (row) => row.slug },
  { id: "last_edited_by", label: "Last edited by", icon: "person", width: 150, render: (row) => row.lastEditedBy },
  { id: "updated", label: "Updated", icon: "schedule", width: 180, render: (row) => when(row.updatedAt) },
  { id: "published", label: "Last published", icon: "schedule", width: 180, render: (row) => when(row.lastPublishedAt) },
];

const SPEC: LocalListSpec<CmsDocumentListItem> = {
  values: {
    title: (row) => row.title,
    state: (row) => row.state,
    display_order: (row) => row.displayOrder,
    expertise: (row) => row.expertise,
    updated: (row) => row.updatedAt,
    published: (row) => row.lastPublishedAt ?? "",
  },
  searchText: (row) => [row.title, row.slug, ...row.expertise],
};

/**
 * /admin/documentation/manage — every Documentation article (p9), drafts
 * and unpublished ones included; Archived in its own view (decision 12).
 * Search, sort, filters and columns run in the browser (a few dozen rows).
 */
export function DocumentationAdminList() {
  const documents = useAdminData<CmsDocumentListItem[]>("/cms/documents");
  const canCreate = useCan("cms.create");
  const rows = useMemo(() => documents.data ?? [], [documents.data]);
  const fields = useMemo<ListField[]>(() => {
    const expertise = [...new Set(rows.flatMap((row) => row.expertise))].sort((a, b) => a.localeCompare(b));
    return [
      { id: "title", label: "Name", icon: "title", operators: ["contains", "not_contains"], sort: "text" },
      {
        id: "state",
        label: "State",
        icon: "select",
        operators: ["is", "is_not"],
        options: (["published", "draft", "unpublished"] as const).map((value) => ({ value, label: STATE_LABELS[value] })),
      },
      { id: "display_order", label: "Display order", icon: "numbers", operators: [], sort: "text" },
      {
        id: "expertise",
        label: "Expertise",
        icon: "arrow_outward",
        operators: ["is", "is_not", "is_empty", "is_not_empty"],
        options: expertise.map((name) => ({ value: name, label: name })),
      },
      { id: "updated", label: "Updated", icon: "schedule", operators: [], sort: "dates" },
      { id: "published", label: "Last published", icon: "schedule", operators: [], sort: "dates" },
    ];
  }, [rows]);
  const load = useCallback(
    (state: ListState, pageSize: number) => {
      if (!documents.data) return undefined;
      const archived = state.view === "archived";
      return applyListState(
        rows.filter((row) => (row.state === "archived") === archived),
        SPEC,
        { ...state, filters: state.filters.filter((filter) => filter.field !== "archived") },
        pageSize,
      );
    },
    [rows, documents.data],
  );

  if (documents.error) return <StatusMessage tone="error">Couldn&rsquo;t load the documentation: {documents.error.message}</StatusMessage>;
  return (
    <AdminListPage<CmsDocumentListItem>
      config={{
        title: "Documentation",
        noun: "articles",
        tableId: "documentation",
        load,
        defaultSort: [{ field: "display_order", direction: "asc" }],
        fields,
        columns: COLUMNS,
        recordHref: (row) => `/admin/documentation/${row.id}`,
        archivedView: true,
        actions: canCreate ? (
          <AdminButtonLink href="/admin/documentation/new" icon="add">
            New document
          </AdminButtonLink>
        ) : null,
      }}
    />
  );
}
