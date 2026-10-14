"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExpertiseTree } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, chipInput, ChipSelect, focusRing, StatusMessage } from "../ui/controls";
import { EMPTY_FILTER, filterTaxonomyRows, taxonomyRows, type TaxonomyFilter, type TaxonomyLevel, type TaxonomyRow } from "./taxonomyFilters";

export type { TaxonomyLevel } from "./taxonomyFilters";

interface Column {
  label: string;
  render: (row: TaxonomyRow) => React.ReactNode;
  numeric?: boolean;
}

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

const COMMON_START: Column[] = [
  // Real Stable IDs run long (domain.13.trades_production_services_and_mobility): wrap inside the cell.
  { label: "Stable ID", render: (row) => <span className="font-mono text-meta [overflow-wrap:anywhere]">{row.stableId}</span> },
  { label: "Status", render: (row) => <span className={row.status?.key === "active" ? "" : "text-text-muted"}>{row.status?.label ?? "—"}</span> },
];
const USAGE: Column[] = [
  { label: "People", render: (row) => row.peopleCount, numeric: true },
  { label: "Organizations", render: (row) => row.organizationCount, numeric: true },
];

const CONFIG: Record<TaxonomyLevel, { title: string; noun: string; columns: Column[] }> = {
  domain: {
    title: "Domains",
    noun: "domains",
    columns: [...COMMON_START, { label: "Fields", render: (row) => row.fieldCount, numeric: true }, { label: "Expertise", render: (row) => row.itemCount, numeric: true }, ...USAGE],
  },
  field: {
    title: "Fields",
    noun: "fields",
    columns: [...COMMON_START, { label: "Domain", render: (row) => row.domain.name }, { label: "Expertise", render: (row) => row.itemCount, numeric: true }, ...USAGE],
  },
  expertise: {
    title: "Expertise",
    noun: "expertise",
    columns: [
      ...COMMON_START,
      { label: "Field", render: (row) => row.field?.name },
      { label: "Domain", render: (row) => row.domain.name },
      { label: "Teams", render: teamChips },
      ...USAGE,
    ],
  },
};

/**
 * /admin/domains, /admin/fields, /admin/expertise — the Domain → Field →
 * Expertise taxonomy, READ-ONLY here: Notion is its source of truth and the
 * importer keeps it up to date (Import page). No Figma frame exists for
 * these screens, so they reuse the People table's look. Filters run on the
 * already-loaded tree (≈1,250 nodes), so they're instant.
 */
export function TaxonomyScreen({ level }: { level: TaxonomyLevel }) {
  const config = CONFIG[level];
  const tree = useAdminData<ExpertiseTree>("/expertise/tree");
  const [filter, setFilter] = useState<TaxonomyFilter>(EMPTY_FILTER);
  const set = (key: keyof TaxonomyFilter, value: string) =>
    setFilter((previous) => ({ ...previous, [key]: value, ...(key === "domainId" ? { fieldId: "" } : {}) }));

  const all = useMemo(() => (tree.data ? taxonomyRows(level, tree.data) : []), [level, tree.data]);
  const rows = useMemo(() => filterTaxonomyRows(level, all, filter), [level, all, filter]);
  const domains = useMemo(() => [...(tree.data?.domains ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [tree.data]);
  const fields = useMemo(
    () =>
      domains
        .filter((domain) => !filter.domainId || domain.id === filter.domainId)
        .flatMap((domain) => domain.fields.map((field) => ({ id: field.id, label: filter.domainId ? field.name : `${field.name} · ${domain.name}` })))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [domains, filter.domainId],
  );
  const statuses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of all) seen.set(row.status?.key ?? "none", row.status?.label ?? "No status");
    return [...seen];
  }, [all]);
  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of all) for (const team of row.teams) seen.set(team.key, team.label);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const filtered = Object.values(filter).some(Boolean);

  return (
    <main>
      <header className="flex h-10 items-center gap-2 px-2">
        <h1 className="text-body font-bold">{config.title}</h1>
        <p className="text-meta text-text-muted">
          Managed in Notion – updated by the importer.{" "}
          <Link href="/admin/imports" className={`underline underline-offset-2 ${focusRing}`}>
            Import
          </Link>
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-2 pb-2" role="search" aria-label={`Filter ${config.noun}`}>
        <label className={`${chipInput} flex w-56 items-center gap-1`}>
          <AdminIcon name="search" />
          <span className="sr-only">Search {config.noun} by name or Stable ID</span>
          <input
            type="search"
            value={filter.q}
            onChange={(event) => set("q", event.target.value)}
            placeholder="Name or Stable ID"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {level !== "domain" ? (
          <ChipSelect aria-label="Domain" value={filter.domainId} onChange={(event) => set("domainId", event.target.value)}>
            <option value="">All domains</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </ChipSelect>
        ) : null}
        {level === "expertise" ? (
          <ChipSelect aria-label="Field" value={filter.fieldId} onChange={(event) => set("fieldId", event.target.value)}>
            <option value="">All fields</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </ChipSelect>
        ) : null}
        <ChipSelect aria-label="Status" value={filter.status} onChange={(event) => set("status", event.target.value)}>
          <option value="">All statuses</option>
          {statuses.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </ChipSelect>
        {level === "expertise" ? (
          <ChipSelect aria-label="Team" value={filter.team} onChange={(event) => set("team", event.target.value)}>
            <option value="">All teams</option>
            {teams.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </ChipSelect>
        ) : null}
        {filtered ? <AdminButton onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</AdminButton> : null}
        <span role="status" className="ml-auto text-text-muted">
          {tree.data ? `${rows.length} of ${all.length}` : ""}
        </span>
      </div>

      {tree.error ? (
        <div className="px-2">
          <StatusMessage tone="error">{tree.error.message}</StatusMessage>
          <AdminButton onClick={tree.reload}>Retry</AdminButton>
        </div>
      ) : !tree.data ? (
        <StatusMessage>Loading {config.noun}…</StatusMessage>
      ) : all.length === 0 ? (
        <StatusMessage>No {config.noun} yet — run the taxonomy import.</StatusMessage>
      ) : rows.length === 0 ? (
        <StatusMessage>No {config.noun} match these filters.</StatusMessage>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-body">
          <caption className="sr-only">{config.title}</caption>
          <thead>
            <tr>
              {["Name", ...config.columns.map((column) => column.label)].map((label, index) => (
                <th key={label} scope="col" className={`h-[33px] px-1 pb-[3px] text-left align-bottom font-normal text-text-muted ${index === 0 ? "w-[260px]" : ""}`}>
                  <span className="flex items-center gap-1">
                    <AdminIcon name={index === 0 ? "title" : "arrow_outward"} />
                    {label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border-t border-line px-1 py-1 align-top">{row.name}</td>
                {config.columns.map((column) => (
                  <td key={column.label} className={`border-t border-l border-line px-1 py-1 align-top ${column.numeric ? "tabular-nums" : ""}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
