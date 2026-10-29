"use client";

import { useCallback, useMemo } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { ListState } from "../table/listState";
import { applyListState, type LocalListSpec } from "../table/localList";
import { ViewTabs } from "../table/ViewTabs";

export interface DocumentationRow {
  id: string;
  title: string;
  slug: string;
  displayOrder: number;
  expertise: string[];
  /** ISO timestamps. */
  publishedAt: string;
  updatedAt: string;
}

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" });
const when = (iso: string) => <time dateTime={iso}>{dateTime.format(new Date(iso))}</time>;

/** Decision 3 of 2026-10-19: Title, Status, Display order, Expertise, Last edited by, Updated, Published. */
const COLUMNS: TableColumn<DocumentationRow>[] = [
  { id: "title", label: "Title", icon: "title", width: 280, render: (row, search) => <Highlight text={row.title} query={search} /> },
  // Only published articles are read from Notion today.
  { id: "status", label: "Status", icon: "select", width: 110, render: () => "Published" },
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
  // Notion's editor names aren't imported yet: shown once the CMS is native (Step 5b).
  { id: "last_edited_by", label: "Last edited by", icon: "title", width: 140, render: () => <span className="text-text-muted">Notion</span> },
  { id: "updated", label: "Updated", icon: "schedule", width: 180, render: (row) => when(row.updatedAt) },
  { id: "published", label: "Published", icon: "schedule", width: 180, render: (row) => when(row.publishedAt) },
];

const SPEC: LocalListSpec<DocumentationRow> = {
  values: {
    title: (row) => row.title,
    display_order: (row) => row.displayOrder,
    expertise: (row) => row.expertise,
    updated: (row) => row.updatedAt,
    published: (row) => row.publishedAt,
  },
  searchText: (row) => [row.title, ...row.expertise],
};

/**
 * /admin/documentation/manage — the Documentation list behind
 * "Administrate", READ-ONLY while cms.mode = notion (decision 1): the
 * articles are edited in Notion and the site reads them from there. The
 * list toolbar (search, sort, filters, columns) runs in the browser.
 */
export function DocumentationAdminList({ articles }: { articles: DocumentationRow[] }) {
  const fields = useMemo<ListField[]>(() => {
    const expertise = [...new Set(articles.flatMap((article) => article.expertise))].sort((a, b) => a.localeCompare(b));
    return [
      { id: "title", label: "Title", icon: "title", operators: ["contains", "not_contains"], sort: "text" },
      { id: "display_order", label: "Display order", icon: "numbers", operators: [], sort: "text" },
      { id: "expertise", label: "Expertise", icon: "arrow_outward", operators: ["is", "is_not", "is_empty", "is_not_empty"], options: expertise.map((name) => ({ value: name, label: name })) },
      { id: "updated", label: "Updated", icon: "schedule", operators: [], sort: "dates" },
      { id: "published", label: "Published", icon: "schedule", operators: [], sort: "dates" },
    ];
  }, [articles]);
  const load = useCallback((state: ListState, pageSize: number) => applyListState(articles, SPEC, state, pageSize), [articles]);

  return (
    <AdminListPage<DocumentationRow>
      config={{
        title: "Documentation",
        noun: "articles",
        tableId: "documentation",
        load,
        defaultSort: [{ field: "display_order", direction: "asc" }],
        fields,
        columns: COLUMNS,
        views: <ViewTabs views={[{ id: "all", label: "All" }]} current="all" />,
      }}
    />
  );
}
