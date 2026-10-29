"use client";

import { useMemo, type ReactNode } from "react";
import { Highlight } from "@/shared/ui/Highlight";
import { formatEntryNumber, type TreasuryEntryRow, type TreasuryOptions } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { formatDate } from "../people/peopleTable";
import { AdminListPage } from "../table/AdminListPage";
import type { TableColumn } from "../table/DataTable";
import type { ListField } from "../table/fields";
import type { SortRule } from "../table/listState";
import { SavedViews, type SavedView } from "../table/SavedViews";
import { formatBreakdown, formatMoney, formatOccurred, modeLabel, PUBLICATION_LABEL, publicationLabel, SOURCE_LABEL, TYPE_LABEL } from "./treasuryDisplay";

const DEFAULT_SORT: SortRule[] = [
  { field: "occurred", direction: "desc" },
  { field: "number", direction: "desc" },
];

const text = (value: string | null, search: string): ReactNode => (value ? <Highlight text={value} query={search} /> : null);
const muted = (value: string) => <span className="text-text-muted">{value}</span>;

/** No Figma frame for the Treasury admin: People's table system and glyphs (admin-desktop.pdf p40). */
const COLUMNS: TableColumn<TreasuryEntryRow>[] = [
  { id: "number", label: "Number", icon: "numbers", width: 100, render: (row, s) => text(formatEntryNumber(row.number), s) },
  { id: "occurred", label: "Date", icon: "schedule", width: 170, render: (row) => formatOccurred(row) },
  { id: "type", label: "Type", icon: "select", width: 100, render: (row) => TYPE_LABEL[row.type] },
  { id: "name", label: "Name", icon: "title", width: 220, render: (row, s) => text(row.name, s) },
  { id: "amount", label: "Amount", icon: "numbers", width: 140, render: (row) => <span className="tabular-nums">{formatMoney(row.grossAmount, row.currency)}</span> },
  {
    id: "breakdown",
    label: "Gross / fee / net",
    icon: "numbers",
    width: 200,
    render: (row) => (
      <span className="tabular-nums">
        {formatBreakdown(row)}
        {row.settlement ? <span className="block text-text-muted">{`Settled ${formatMoney(row.settlement.netAmount, row.settlement.currency)}`}</span> : null}
      </span>
    ),
  },
  {
    id: "recipient",
    label: "Recipient",
    icon: "arrow_outward",
    width: 200,
    render: (row, s) => (row.recipient ? text(row.recipient.name, s) : row.type === "expense" ? muted("None") : null),
  },
  {
    id: "expense_types",
    label: "Expense types",
    icon: "select",
    width: 220,
    render: (row) =>
      row.expenseTypes.map((type) => (
        <span key={type.key} className="block">
          {type.label}
        </span>
      )),
  },
  { id: "review", label: "Review status", icon: "select", width: 160, render: (row) => row.review.label },
  { id: "publication", label: "Publication", icon: "select", width: 170, render: (row) => (row.publicNow ? publicationLabel(row) : muted(publicationLabel(row))) },
  { id: "source", label: "Source", icon: "select", width: 100, render: (row) => SOURCE_LABEL[row.source] },
  { id: "mode", label: "Mode", icon: "select", width: 80, render: (row) => (row.livemode && !row.sample ? modeLabel(row) : muted(modeLabel(row))) },
  { id: "documents", label: "Documents", icon: "insert_drive_file", width: 110, render: (row) => (row.documents > 0 ? String(row.documents) : muted("0")) },
  { id: "created", label: "Created", icon: "schedule", width: 120, defaultHidden: true, render: (row) => formatDate(row.createdAt) },
  { id: "updated", label: "Updated", icon: "schedule", width: 120, defaultHidden: true, render: (row) => formatDate(row.updatedAt) },
];

/** Saved views: each is a set of filters on the same list contract. */
const VIEWS: SavedView[] = [
  { id: "all", label: "All", filters: [] },
  { id: "expenses", label: "Expenses", filters: [{ field: "type", operator: "is", value: "expense" }] },
  {
    id: "donations",
    label: "Donations",
    filters: [
      { field: "type", operator: "is", value: "donation" },
      { field: "type", operator: "is", value: "refund" },
      { field: "type", operator: "is", value: "dispute" },
    ],
  },
  {
    id: "to_review",
    label: "To review",
    filters: [
      { field: "type", operator: "is", value: "expense" },
      { field: "review", operator: "is", value: "unqualified" },
      { field: "review", operator: "is", value: "pending_documents" },
    ],
  },
  { id: "unpublished", label: "Unpublished", filters: [{ field: "publication", operator: "is", value: "unpublished" }] },
  { id: "test", label: "Test mode", filters: [{ field: "mode", operator: "is", value: "test" }] },
];

/**
 * /admin/treasury — every ledger entry (expenses from Notion, donations,
 * refunds and disputes from Stripe), with search (name, description, note,
 * Stripe id, recipient, EXP-n), sorts, filters and saved views. Read-only
 * here: records open in TreasuryRecord, where the allowed actions live.
 */
export function TreasuryList() {
  const options = useAdminData<TreasuryOptions>("/treasury/options");
  const fields = useMemo<ListField[]>(() => {
    const vocabulary = (entries: { key: string; label: string }[] | undefined) => (entries ?? []).map((entry) => ({ value: entry.key, label: entry.label }));
    return [
      { id: "number", label: "Number", icon: "numbers", operators: [], sort: "text" },
      { id: "occurred", label: "Date", icon: "schedule", operators: [], sort: "dates" },
      { id: "occurred_from", label: "Date from", icon: "schedule", operators: ["is"] },
      { id: "occurred_to", label: "Date until", icon: "schedule", operators: ["is"] },
      {
        id: "type",
        label: "Type",
        icon: "select",
        operators: ["is", "is_not"],
        options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { id: "amount", label: "Amount", icon: "numbers", operators: [], sort: "text" },
      { id: "currency", label: "Currency", icon: "select", operators: ["is", "is_not"], options: (options.data?.currencies ?? []).map((code) => ({ value: code, label: code })) },
      { id: "recipient", label: "Recipient", icon: "arrow_outward", operators: ["is_empty", "is_not_empty"] },
      { id: "expense_type", label: "Expense type", icon: "select", operators: ["is", "is_empty", "is_not_empty"], options: vocabulary(options.data?.expenseTypes) },
      { id: "review", label: "Review status", icon: "select", operators: ["is", "is_not"], options: vocabulary(options.data?.reviewStatuses) },
      { id: "publication", label: "Publication", icon: "select", operators: ["is"], options: Object.entries(PUBLICATION_LABEL).map(([value, label]) => ({ value, label })) },
      { id: "source", label: "Source", icon: "select", operators: ["is", "is_not"], options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })) },
      {
        id: "mode",
        label: "Mode",
        icon: "select",
        operators: ["is"],
        options: [
          { value: "live", label: "Live" },
          { value: "test", label: "Test" },
        ],
      },
      { id: "documents", label: "Documents", icon: "insert_drive_file", operators: ["is_empty", "is_not_empty"] },
      { id: "created", label: "Created", icon: "schedule", operators: [], sort: "dates" },
      { id: "updated", label: "Updated", icon: "schedule", operators: [], sort: "dates" },
    ];
  }, [options.data]);

  return (
    <AdminListPage<TreasuryEntryRow>
      config={{
        title: "Treasury",
        noun: "entries",
        tableId: "treasury",
        endpoint: "/treasury",
        defaultSort: DEFAULT_SORT,
        fields,
        columns: COLUMNS,
        recordHref: (row) => `/admin/treasury/${row.id}`,
        subtitle: "Donations, refunds and disputes come from Stripe.",
        views: <SavedViews views={VIEWS} archived />,
      }}
    />
  );
}
