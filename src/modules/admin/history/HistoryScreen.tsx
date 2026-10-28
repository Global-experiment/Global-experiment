"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { reportHref } from "@/shared/navigation/sourcePage";
import type { Page, HistoryListItem } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { HistoryEvent } from "../record/HistoryFeed";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, ChipSelect, focusRing, Popover, StatusMessage } from "../ui/controls";
import { DateField } from "../ui/RecordForm";

const PAGE_SIZE = 50;

/** The record types the log covers (audit.schema.ts AUDITED_ENTITIES), as the filter names them. */
const ENTITY_LABELS: Record<string, string> = {
  person: "People",
  organization: "Organizations",
  treasury_entry: "Treasury entries",
  expertise_domain: "Domains",
  expertise_field: "Fields",
  expertise_item: "Expertise",
  setting: "Settings",
  import_run: "Imports",
  service: "Services",
  access_grant: "Permissions",
  admin_user: "Accounts",
};

const SOURCE_LABELS: Record<string, string> = { admin: "Admin", import: "Notion import", stripe: "Stripe", system: "System" };

/** Where an event's record lives in the admin (none for settings, or a deleted record). */
function recordHref(entity: HistoryListItem["entity"], action: string): string | undefined {
  if (action === "deleted") return undefined;
  switch (entity.type) {
    case "person":
      return `/admin/people/${entity.id}`;
    case "organization":
      return `/admin/organizations/${entity.id}`;
    case "treasury_entry":
      return `/admin/treasury/${entity.id}`;
    case "expertise_domain":
      return "/admin/domains";
    case "expertise_field":
      return "/admin/fields";
    case "expertise_item":
      return "/admin/expertise";
    case "import_run":
      return "/admin/imports";
    case "service":
      return `/admin/services/${entity.id}`;
    case "access_grant":
      return `/admin/permissions/${entity.id}`;
    case "admin_user":
      return `/admin/accounts/${entity.id}`;
    default:
      return undefined;
  }
}

const NOUN: Record<string, string> = { person: "person", organization: "organization", treasury_entry: "entry", service: "service", access_grant: "permission", admin_user: "account" };

/**
 * An event's ⋮ menu (client, 2026-10-23): Report issue and Send feedback,
 * the website's own forms, opened with this event as the page they're about.
 */
function EventMenu({ eventId, title }: { eventId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const source = `/admin/history?event=${encodeURIComponent(eventId)}`;
  const item = `flex h-8 w-full items-center gap-2 rounded-control px-2 text-body whitespace-nowrap text-text-primary hover:bg-surface-raised ${focusRing}`;
  return (
    <span className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More options for this event on ${title}`}
        onClick={() => setOpen((value) => !value)}
        className={`flex cursor-pointer rounded-control text-text-muted hover:text-text-primary ${focusRing}`}
      >
        <AdminIcon name="more_vert" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label="Event options" className="top-[calc(100%+4px)] right-0 flex min-w-40 flex-col p-1">
        <Link href={reportHref("issue", source)} onClick={() => setOpen(false)} className={item}>
          Report issue
        </Link>
        <Link href={reportHref("feedback", source)} onClick={() => setOpen(false)} className={item}>
          Send feedback
        </Link>
      </Popover>
    </span>
  );
}

/** A day picked in the viewer's own calendar → the instant it starts there (to = the next day's start, excluded). */
function dayStart(day: string, plusDays = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date! + plusDays).toISOString();
}

/**
 * Monitoring → History: every audited write, newest first — People,
 * Organizations, Treasury, taxonomy, settings and imports — filtered by
 * record type, actor, source and date (the viewer's days). The same event
 * rows as a record's panel, with the record each one is about; field
 * privacy is applied by the API.
 */
export function HistoryScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = {
    entityType: params.get("entity") ?? "",
    actor: params.get("actor") ?? "",
    source: params.get("source") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (filters.entityType) query.set("entityType", filters.entityType);
  if (filters.actor) query.set("actor", filters.actor);
  if (filters.source) query.set("source", filters.source);
  if (filters.from) query.set("from", dayStart(filters.from));
  if (filters.to) query.set("to", dayStart(filters.to, 1));
  const list = useAdminData<Page<HistoryListItem>>(`/history?${query}`);
  const actors = useAdminData<{ id: string; label: string }[]>("/history/actors");

  const navigate = (changes: Partial<typeof filters> & { page?: number }) => {
    const next = { ...filters, page: 1, ...changes };
    const url = new URLSearchParams();
    if (next.entityType) url.set("entity", next.entityType);
    if (next.actor) url.set("actor", next.actor);
    if (next.source) url.set("source", next.source);
    if (next.from) url.set("from", next.from);
    if (next.to) url.set("to", next.to);
    if (next.page > 1) url.set("page", String(next.page));
    const search = url.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };
  const filtered = Object.values(filters).some(Boolean);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 px-2">
        <h1 className="text-body font-bold">History</h1>
        <span className="text-meta text-text-muted">Every change, import and comment, newest first.</span>
      </header>
      <div role="group" aria-label="Filters" className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 px-2 pb-2">
        <ChipSelect aria-label="Record type" value={filters.entityType} onChange={(event) => navigate({ entityType: event.target.value })}>
          <option value="">All records</option>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </ChipSelect>
        <ChipSelect aria-label="Actor" value={filters.actor} onChange={(event) => navigate({ actor: event.target.value })}>
          <option value="">Everyone</option>
          <option value="automation">Automation</option>
          {(actors.data ?? []).map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.label}
            </option>
          ))}
        </ChipSelect>
        <ChipSelect aria-label="Source" value={filters.source} onChange={(event) => navigate({ source: event.target.value })}>
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </ChipSelect>
        {/* The design-system date picker, as on the records; a range that would be inverted moves the other end along. */}
        <span className="flex items-center gap-1 text-body text-text-muted">
          <label htmlFor="history-from">From</label>
          <span className="w-48 rounded-control ring-1 ring-line">
            <DateField
              id="history-from"
              label="From"
              value={filters.from}
              onChange={(from) => navigate({ from, ...(from && filters.to && from > filters.to ? { to: from } : {}) })}
            />
          </span>
        </span>
        <span className="flex items-center gap-1 text-body text-text-muted">
          <label htmlFor="history-to">To</label>
          <span className="w-48 rounded-control ring-1 ring-line">
            <DateField
              id="history-to"
              label="To"
              value={filters.to}
              onChange={(to) => navigate({ to, ...(to && filters.from && to < filters.from ? { from: to } : {}) })}
            />
          </span>
        </span>
        {filtered ? <AdminButton onClick={() => navigate({ entityType: "", actor: "", source: "", from: "", to: "" })}>Clear</AdminButton> : null}
      </div>

      <div data-history-page className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {list.error ? (
          <div className="p-2">
            <StatusMessage tone="error">{list.error.message}</StatusMessage>
            <AdminButton onClick={list.reload}>Retry</AdminButton>
          </div>
        ) : !list.data ? (
          <div className="p-2">
            <StatusMessage>Loading the history…</StatusMessage>
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="p-2">
            <StatusMessage>{filtered ? "No events match these filters." : "Nothing has happened yet."}</StatusMessage>
          </div>
        ) : (
          // Full width (client, 2026-10-23).
          <ol aria-label="History, newest first">
            {list.data.items.map((item) => {
              const href = item.entity.exists ? recordHref(item.entity, item.action) : undefined;
              const title = item.entity.title;
              return (
                <HistoryEvent
                  key={item.id}
                  item={item}
                  entity={NOUN[item.entity.type] ?? "record"}
                  onChanged={list.reload}
                  subject={
                    href ? (
                      <Link href={href} data-history-subject className={`font-bold text-text-primary hover:underline ${focusRing}`}>
                        {title}
                      </Link>
                    ) : (
                      <span data-history-subject className="font-bold text-text-primary">
                        {title}
                      </span>
                    )
                  }
                  menu={<EventMenu eventId={item.id} title={title} />}
                />
              );
            })}
          </ol>
        )}
      </div>
      {list.data && list.data.total > 0 ? (
        <footer className="flex h-10 shrink-0 items-center gap-2 border-t border-line px-2 text-body text-text-muted">
          <span role="status">
            {(list.data.page - 1) * list.data.pageSize + 1}–{(list.data.page - 1) * list.data.pageSize + list.data.items.length} of {list.data.total}
          </span>
          {pages > 1 ? (
            <span className="ml-auto flex gap-2">
              <AdminButton disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}>
                Previous
              </AdminButton>
              <AdminButton disabled={page >= pages} onClick={() => navigate({ page: page + 1 })}>
                Next
              </AdminButton>
            </span>
          ) : null}
        </footer>
      ) : null}
    </main>
  );
}
