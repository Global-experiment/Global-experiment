"use client";

import { useCallback, useMemo } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import type { ExpertiseTree } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListState } from "../table/listState";
import { applyListState } from "../table/localList";
import { ViewTabs } from "../table/ViewTabs";
import { taxonomyFields, taxonomyListSpec, taxonomyRows, type TaxonomyLevel, type TaxonomyRow } from "./taxonomyFilters";

export type { TaxonomyLevel } from "./taxonomyFilters";

const teamChips = (row: TaxonomyRow) =>
  row.teams.length > 0 ? (
    <span className="flex flex-wrap gap-1">
      {row.teams.map((team) => (
        <span key={team.key} className="inline-flex rounded-control border border-line px-1 text-meta leading-[18px] text-text-muted">
          {team.label}
        </span>
      ))}
    </span>
  ) : null;

const number = (value: number) => <span className="tabular-nums">{value}</span>;

const NAME: TableColumn<TaxonomyRow> = { id: "name", label: "Name", icon: "title", width: 240, render: (row, search) => <Highlight text={row.name} query={search} /> };
const COMMON: TableColumn<TaxonomyRow>[] = [
  // Real Stable IDs run long (domain.13.trades_production_services_and_mobility): wrap inside the cell.
  { id: "stable_id", label: "Stable ID", icon: "title", width: 200, render: (row) => <span className="font-mono text-meta [overflow-wrap:anywhere]">{row.stableId}</span> },
  { id: "status", label: "Status", icon: "select", width: 120, render: (row) => <span className={row.status?.key === "active" ? "" : "text-text-muted"}>{row.status?.label ?? "—"}</span> },
];
const USAGE: TableColumn<TaxonomyRow>[] = [
  { id: "people", label: "People", icon: "numbers", width: 100, render: (row) => number(row.peopleCount) },
  { id: "organizations", label: "Organizations", icon: "numbers", width: 130, render: (row) => number(row.organizationCount) },
];

const CONFIG: Record<TaxonomyLevel, { title: string; noun: string; columns: TableColumn<TaxonomyRow>[] }> = {
  domain: {
    title: "Domains",
    noun: "domains",
    columns: [
      NAME,
      ...COMMON,
      { id: "fields", label: "Fields", icon: "numbers", width: 90, render: (row) => number(row.fieldCount) },
      { id: "expertise", label: "Expertise", icon: "numbers", width: 100, render: (row) => number(row.itemCount) },
      ...USAGE,
    ],
  },
  field: {
    title: "Fields",
    noun: "fields",
    columns: [
      NAME,
      ...COMMON,
      { id: "domain", label: "Domain", icon: "arrow_outward", width: 200, render: (row) => row.domain.name },
      { id: "expertise", label: "Expertise", icon: "numbers", width: 100, render: (row) => number(row.itemCount) },
      ...USAGE,
    ],
  },
  expertise: {
    title: "Expertise",
    noun: "expertise",
    columns: [
      NAME,
      ...COMMON,
      { id: "field", label: "Field", icon: "arrow_outward", width: 200, render: (row) => row.field?.name },
      { id: "domain", label: "Domain", icon: "arrow_outward", width: 180, render: (row) => row.domain.name },
      { id: "team", label: "Teams", icon: "select", width: 200, render: teamChips },
      ...USAGE,
    ],
  },
};

/**
 * /admin/domains, /admin/fields, /admin/expertise — the Domain → Field →
 * Expertise taxonomy, READ-ONLY here: Notion is its source of truth and the
 * importer keeps it up to date (Import Notion). Figma's list screen (search,
 * sort and filter popovers, column menu) over the loaded tree (≈1,250
 * nodes): filtering runs in the browser, so it's instant. No "New" button
 * and no record pages — nothing here is edited.
 */
export function TaxonomyScreen({ level }: { level: TaxonomyLevel }) {
  const config = CONFIG[level];
  const tree = useAdminData<ExpertiseTree>("/expertise/tree");
  const rows = useMemo(() => (tree.data ? taxonomyRows(level, tree.data) : undefined), [level, tree.data]);
  const fields = useMemo(() => taxonomyFields(level, rows ?? []), [level, rows]);
  const spec = useMemo(() => taxonomyListSpec(level), [level]);
  const load = useCallback((state: ListState, pageSize: number) => (rows ? applyListState(rows, spec, state, pageSize) : undefined), [rows, spec]);

  return (
    <AdminListPage<TaxonomyRow>
      config={{
        title: config.title,
        noun: config.noun,
        tableId: `taxonomy-${level}`,
        load,
        defaultSort: [],
        fields,
        columns: config.columns,
        views: <ViewTabs views={[{ id: "all", label: "All" }]} current="all" />,
      }}
    />
  );
}
