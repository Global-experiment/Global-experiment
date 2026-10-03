"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { adminApi, AdminApiError } from "../api/client";
import type { Page } from "../api/types";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, focusRing, StatusMessage, toolbarBox } from "../ui/controls";
import { useToast } from "../ui/Toast";
import { ColumnsControl, DataTable, type TableColumn } from "./DataTable";
import { sortButtonLabel, type ListField } from "./fields";
import {
  filterButtonLabel,
  isCompleteFilter,
  listStateToApiQuery,
  listStateToUrl,
  pageCount,
  readListState,
  serializeFilter,
  type ListState,
  type SortRule,
} from "./listState";
import { FilterPopover, SortPopover } from "./RulePopovers";
import { useColumnPrefs } from "./useColumnPrefs";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;

type Result<Row> =
  | { key: string; status: "ok"; page: Page<Row> }
  | { key: string; status: "error"; error: AdminApiError };

export interface AdminListConfig<Row extends { id: string }> {
  /** Page heading (figma.pdf p40: bold 14px at 248,129). */
  title: string;
  /** Plural noun for status text ("people", "organizations"). */
  noun: string;
  tableId: string;
  endpoint: string;
  defaultSort: SortRule[];
  fields: readonly ListField[];
  columns: readonly TableColumn<Row>[];
  recordHref: (row: Row) => string;
  /** Right side of the title row (Notion import control, "New …"). */
  actions?: ReactNode;
  /** Left side of the toolbar row (Figma's saved-view tabs). */
  views?: ReactNode;
}

/**
 * One admin collection screen (figma.pdf p40–p43): title row, toolbar row
 * (views · search · sort · filters · columns), the table, and paging. All
 * querying happens in the API — this component only turns URL state into
 * an API query and renders the page of results it gets back.
 */
export function AdminListPage<Row extends { id: string }>({ config }: { config: AdminListConfig<Row> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const state = readListState(new URLSearchParams(params.toString()), config.defaultSort);
  const apiQuery = listStateToApiQuery(state, PAGE_SIZE);

  const [prefs, setPrefs] = useColumnPrefs(config.tableId, config.columns.map((column) => column.id));
  const [searchDraft, setSearchDraft] = useState(state.search);
  const [result, setResult] = useState<Result<Row> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [openPopover, setOpenPopover] = useState<"sort" | "filter" | null>(null);
  const sortTrigger = useRef<HTMLButtonElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filtersWhenOpened = useRef<string>("");
  const requestKey = `${apiQuery}#${reloadToken}`;

  // Follow the URL when it changes from elsewhere (back/forward, "clear"),
  // but not when it's just catching up with what's being typed.
  const [pushedSearch, setPushedSearch] = useState(state.search);
  const [seenSearch, setSeenSearch] = useState(state.search);
  if (state.search !== seenSearch) {
    setSeenSearch(state.search);
    if (state.search !== pushedSearch) setSearchDraft(state.search);
  }

  // Navigations build on the latest *requested* state, not the last
  // rendered URL, so two quick changes can't undo each other.
  const latest = useRef<ListState | null>(null);
  const urlKey = params.toString();
  useEffect(() => {
    // Caught up: the URL now shows the last requested state.
    if (latest.current && listStateToUrl(latest.current, config.defaultSort) === (urlKey ? `?${urlKey}` : "")) {
      latest.current = null;
    }
  }, [urlKey, config.defaultSort]);

  const navigate = (next: Partial<ListState>) => {
    const merged: ListState = { ...(latest.current ?? state), ...next };
    latest.current = merged;
    setPushedSearch(merged.search);
    router.replace(`${pathname}${listStateToUrl(merged, config.defaultSort)}`, { scroll: false });
  };

  // Search box → URL, debounced; a new search always starts from page 1.
  useEffect(() => {
    if (searchDraft === state.search) return;
    const timer = setTimeout(() => navigate({ search: searchDraft, page: 1 }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is rebuilt every render
  }, [searchDraft, state.search]);

  useEffect(() => {
    const controller = new AbortController();
    adminApi<Page<Row>>(`${config.endpoint}${apiQuery}`, { signal: controller.signal }).then(
      (page) => setResult({ key: requestKey, status: "ok", page }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          status: "error",
          error: error instanceof AdminApiError ? error : new AdminApiError(0, "unknown", "Something went wrong."),
        });
      },
    );
    return () => controller.abort();
  }, [config.endpoint, apiQuery, requestKey]);

  const loading = result?.key !== requestKey;
  const page = result?.status === "ok" ? result.page : undefined;
  const activeFilters = state.filters.filter(isCompleteFilter);

  const closePopover = () => {
    if (openPopover === "filter" && activeFilters.map(serializeFilter).join("|") !== filtersWhenOpened.current) {
      toast("Filters applied");
    }
    setOpenPopover(null);
  };

  return (
    <main>
      <header className="flex h-10 items-center gap-2 px-2">
        <h1 className="mr-auto text-body font-bold">{config.title}</h1>
        {config.actions}
      </header>

      <div className="flex h-10 items-center gap-2 px-2">
        <div className="mr-auto flex min-w-0 items-center">{config.views}</div>

        <label className={`${toolbarBox} w-40 pr-1 pl-2`}>
          <AdminIcon name="search" />
          <span className="sr-only">Search {config.noun}</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search"
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-primary [&::-webkit-search-cancel-button]:hidden"
          />
          {searchDraft ? (
            <button type="button" aria-label="Clear search" onClick={() => setSearchDraft("")} className={`cursor-pointer text-text-muted ${focusRing}`}>
              <AdminIcon name="close" />
            </button>
          ) : null}
        </label>

        <div className="relative">
          <button
            ref={sortTrigger}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openPopover === "sort"}
            onClick={() => (openPopover === "sort" ? closePopover() : setOpenPopover("sort"))}
            className={`${toolbarBox} w-40 cursor-pointer justify-between pr-1 pl-2 text-body ${openPopover === "sort" ? "ring-text-primary" : ""}`}
          >
            <span className="truncate">{sortButtonLabel(config.fields, state.sort)}</span>
            <AdminIcon name="arrow_downward" className="text-text-muted" />
          </button>
          <SortPopover
            open={openPopover === "sort"}
            onClose={closePopover}
            triggerRef={sortTrigger}
            fields={config.fields}
            sort={state.sort}
            onChange={(sort) => navigate({ sort: sort.length > 0 ? sort : config.defaultSort, page: 1 })}
          />
        </div>

        <div className="relative">
          <button
            ref={filterTrigger}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openPopover === "filter"}
            onClick={() => {
              if (openPopover === "filter") return closePopover();
              filtersWhenOpened.current = activeFilters.map(serializeFilter).join("|");
              setOpenPopover("filter");
            }}
            className={`${toolbarBox} w-40 cursor-pointer pl-2 text-body ${openPopover === "filter" ? "ring-text-primary" : ""}`}
          >
            {filterButtonLabel(state.filters)}
          </button>
          <FilterPopover
            open={openPopover === "filter"}
            onClose={closePopover}
            triggerRef={filterTrigger}
            fields={config.fields}
            filters={state.filters}
            onChange={(filters) => navigate({ filters, page: 1 })}
          />
        </div>

        <ColumnsControl columns={config.columns} prefs={prefs} onPrefsChange={setPrefs} />
      </div>

      {result?.status === "error" && !loading ? (
        <div className="px-2">
          <StatusMessage tone="error">
            {result.error.status === 0 ? result.error.message : `Couldn't load ${config.noun}: ${result.error.message}`}
          </StatusMessage>
          <AdminButton onClick={() => setReloadToken((token) => token + 1)}>Retry</AdminButton>
        </div>
      ) : !page ? (
        <StatusMessage>Loading {config.noun}…</StatusMessage>
      ) : page.items.length === 0 ? (
        <div className="px-2">
          <StatusMessage>
            {state.search || activeFilters.length > 0 ? `No ${config.noun} match this search or these filters.` : `No ${config.noun} yet.`}
          </StatusMessage>
          {state.search || state.filters.length > 0 ? (
            <AdminButton
              icon="close"
              onClick={() => {
                setSearchDraft("");
                navigate({ search: "", filters: [], page: 1 });
              }}
            >
              Clear search and filters
            </AdminButton>
          ) : null}
        </div>
      ) : (
        <>
          <DataTable
            columns={config.columns}
            rows={page.items}
            prefs={prefs}
            onPrefsChange={setPrefs}
            recordHref={config.recordHref}
            search={state.search}
            busy={loading}
            caption={`${config.title}: ${page.total} total`}
          />
          <footer className="flex h-10 items-center gap-2 border-t border-line px-2 text-body text-text-muted">
            <span role="status">
              {(page.page - 1) * page.pageSize + 1}–{(page.page - 1) * page.pageSize + page.items.length} of {page.total}
            </span>
            {pageCount(page.total, page.pageSize) > 1 ? (
              <span className="ml-auto flex gap-2">
                <AdminButton disabled={page.page <= 1} onClick={() => navigate({ page: page.page - 1 })}>
                  Previous
                </AdminButton>
                <AdminButton disabled={page.page >= pageCount(page.total, page.pageSize)} onClick={() => navigate({ page: page.page + 1 })}>
                  Next
                </AdminButton>
              </span>
            ) : null}
          </footer>
        </>
      )}
    </main>
  );
}
