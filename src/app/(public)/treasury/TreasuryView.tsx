"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { TreasuryEntriesPage, TreasuryOverview } from "@/shared/config/publicApi";
import { DONATION_CURRENCIES, formatExact, formatMedian, formatStatAmount } from "@/shared/donate/money";
import { ClickableStatsRow, type StatItem } from "@/shared/treasury/ClickableStatsRow";
import { TREASURY_COPY } from "@/shared/treasury/copy";
import { formatCodeAmount, formatCompact, formatLastUpdated, formatTrend, zurichToday } from "@/shared/treasury/format";
import { HistoryList } from "@/shared/treasury/HistoryList";
import { TreasuryFilterSheet } from "@/shared/treasury/TreasuryFilterSheet";
import { TreasurySortSheet } from "@/shared/treasury/TreasurySortSheet";
import {
  activeFilterCount,
  clearFilters,
  nextTypeFilter,
  treasuryHref,
  withFilters,
  type HistoryType,
  type TreasuryCurrencyChoice,
  type TreasuryState,
} from "@/shared/treasury/treasuryParams";
import { Button } from "@/shared/ui/Button";
import { Container } from "@/shared/ui/Container";
import { IconButton } from "@/shared/ui/IconButton";
import { Icon } from "@/shared/ui/icons";
import { NavHeader } from "@/shared/ui/NavHeader";
import { PageActionsMenu } from "@/shared/ui/PageActionsMenu";
import { shareUrl } from "@/shared/ui/ShareButton";
import { Sheet } from "@/shared/ui/Sheet";
import { StickyActionBar } from "@/shared/ui/StickyActionBar";

const copy = TREASURY_COPY;
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";
const APPEAL_DISMISSED = "ge_treasury_appeal_dismissed";

interface TreasuryViewProps {
  state: TreasuryState;
  /** Null when the API couldn't be reached: the stats are left out, never invented. */
  overview: TreasuryOverview | null;
  history: TreasuryEntriesPage | null;
  /** The server's clock (ISO), so server and browser render the same dates. */
  now: string;
}

/**
 * The Treasury page (Common pages p11): header with the currency switch and
 * page actions (p12), sort (p13) and filter (p14–p16) controls, the
 * Expenses / Donations pills, the stats, the "Cry for donation" banner, the
 * history and its pages, the sticky Donate button. Every change is a new
 * URL the server renders; the previous view stays on screen (marked busy)
 * until the next one arrives.
 */
export function TreasuryView({ state, overview, history, now: nowIso }: TreasuryViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // The search field (p11's search button opens it); open whenever the URL carries a search.
  const [searchOpen, setSearchOpen] = useState(state.q !== null);
  const [query, setQuery] = useState(state.q ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = new Date(nowIso);

  const go = (next: TreasuryState) => startTransition(() => router.push(treasuryHref(next), { scroll: false }));
  const chooseCurrency = (currency: TreasuryCurrencyChoice) => {
    setCurrencyOpen(false);
    if (currency !== state.currency) go(withFilters(state, { currency }));
  };
  const filters = activeFilterCount(state);
  /** Searches after `delay` ms (typing), or at once (Enter); the same text twice does nothing. */
  const search = (text: string, delay: number) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = text.trim() || null;
    if (q === state.q) return;
    searchTimer.current = setTimeout(() => go(withFilters(state, { q })), delay);
  };
  const closeSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchOpen(false);
    setQuery("");
    if (state.q) go(withFilters(state, { q: null }));
  };
  const lastUpdated = overview?.lastUpdatedAt ? formatLastUpdated(overview.lastUpdatedAt, now) : null;

  return (
    <main className="flex flex-1 flex-col">
      <NavHeader
        title={copy.pageTitle}
        backHref="/"
        actions={
          <>
            {/* Common pages p11: "USD" bold — the currency of the stats and the history — then the chart glyph and ⋮. */}
            <button
              type="button"
              onClick={() => setCurrencyOpen(true)}
              aria-label={copy.header.currencyLabel(currencyLabel(state.currency))}
              aria-haspopup="dialog"
              className={`h-10 shrink-0 cursor-pointer rounded-control px-2 text-body font-bold text-text-primary ${focusRing}`}
            >
              {currencyLabel(state.currency)}
            </button>
            {/* Same glyph and destination as on Donate (Common pages p11, p28). */}
            <IconButton href="/treasury" label={copy.header.treasuryLink} icon="leaderboard" />
            <PageActionsMenu
              label={copy.header.pageActions}
              actions={[
                { label: copy.menu.donate, icon: "volunteer_activism", href: "/donate" },
                { label: copy.menu.share, icon: "share", onClick: () => void shareUrl(treasuryHref(state), copy.pageTitle) },
                { label: copy.menu.feedback, icon: "lightbulb", href: "/feedback" },
                { label: copy.menu.issue, icon: "new_releases", href: "/issue" },
                { label: copy.menu.documentation, icon: "insert_drive_file", href: "/documentation" },
              ]}
            >
              {/* Common pages p12: two sentences on consecutive lines. */}
              <p>
                {copy.menu.refresh}
                {lastUpdated ? (
                  <>
                    <br />
                    {copy.menu.lastUpdated(lastUpdated)}
                  </>
                ) : null}
              </p>
            </PageActionsMenu>
          </>
        }
      />

      <Sheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} ariaLabel={copy.header.currencySheetLabel}>
        <div className="flex flex-col gap-2">
          {[...DONATION_CURRENCIES, "all" as const].map((code) => (
            <Button key={code} onClick={() => chooseCurrency(code)} variant={code === state.currency ? "primary" : "secondary"} fullWidth>
              <span aria-current={code === state.currency ? "true" : undefined}>{copy.header.currencyNames[code]}</span>
            </Button>
          ))}
        </div>
      </Sheet>

      <Container className="pt-1">
        {/*
          Common pages p11: a 32px search button, then the sort and filter fields, 8px apart.
          The search button opens a field in their place (typing searches after a pause, Enter
          at once); × closes it and clears the search.
        */}
        {searchOpen ? (
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              search(query, 0);
            }}
            className="flex gap-2"
          >
            <label className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-control border border-line px-[calc(0.5rem-1px)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text-primary">
              <Icon name="search" className="shrink-0 text-text-muted" />
              <span className="sr-only">{copy.toolbar.searchField}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  search(event.target.value, 350);
                }}
                placeholder={copy.toolbar.searchPlaceholder}
                maxLength={100}
                autoFocus={state.q === null}
                enterKeyHint="search"
                className="h-full min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
            <button
              type="button"
              onClick={closeSearch}
              aria-label={copy.toolbar.closeSearch}
              className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line text-text-primary ${focusRing}`}
            >
              <Icon name="close" />
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={copy.toolbar.search}
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-line text-text-primary ${focusRing}`}
            >
              <Icon name="search" />
            </button>
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              aria-haspopup="dialog"
              aria-label={copy.toolbar.sortLabel(sortField(state), copy.sort.directions[state.sort])}
              className={`flex h-8 min-w-0 cursor-pointer items-center justify-between gap-1 rounded-control border border-line px-[calc(0.5rem-1px)] text-body text-text-primary ${focusRing}`}
            >
              <span className="truncate">{copy.toolbar.sortButton(sortField(state), copy.sort.directions[state.sort])}</span>
              <Icon name="arrow_downward" className={`shrink-0 ${state.sort.endsWith("_asc") ? "rotate-180" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              aria-haspopup="dialog"
              aria-label={copy.toolbar.filterLabel(filters)}
              className={`flex h-8 min-w-0 cursor-pointer items-center rounded-control border px-[calc(0.5rem-1px)] text-body ${filters > 0 ? "border-text-primary font-bold" : "border-line"} text-text-primary ${focusRing}`}
            >
              <span className="truncate">{filters > 0 ? copy.toolbar.filterActive(filters) : copy.toolbar.filter}</span>
            </button>
          </div>
        )}

        <div role="group" aria-label={copy.pills.label} className="mt-2 flex gap-2">
          {(["expense", "donation"] as const satisfies HistoryType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => go(withFilters(state, { type: nextTypeFilter(state.type, type) }))}
              aria-pressed={state.type === type}
              className={`h-8 cursor-pointer rounded-full border px-[calc(var(--spacing-gutter)-1px)] text-meta ${focusRing} ${
                state.type === type ? "border-inverse-surface bg-inverse-surface text-inverse-content" : "border-line text-text-primary"
              }`}
            >
              {type === "expense" ? copy.pills.expenses : copy.pills.donations}
            </button>
          ))}
        </div>

        {overview ? <ClickableStatsRow stats={buildStats(overview)} className="mt-4" /> : null}
        {overview?.sampleFigures && !overview.wiseConnected ? <p className="mt-2 text-center text-meta text-text-muted">{copy.stats.sampleNote}</p> : null}
        {overview?.donationAppeal ? <DonationAppeal /> : null}

        {/* Common pages p11: 14px bold heading, 12px muted count on the same baseline. */}
        <h2 className="mt-4 text-body text-text-primary">
          <span className="font-bold">{copy.history.heading}</span>{" "}
          {history ? <span className="text-meta text-text-muted">{new Intl.NumberFormat("en-US").format(history.total)}</span> : null}
        </h2>
        <div aria-busy={pending} aria-live="polite" className={pending ? "opacity-60 transition-opacity" : undefined}>
          <History
            history={history}
            filters={filters}
            now={now}
            onErase={() => {
              setQuery("");
              setSearchOpen(false);
              go(withFilters(clearFilters(state), { q: null }));
            }}
            state={state}
          />
        </div>
      </Container>

      <TreasurySortSheet open={sortOpen} onClose={() => setSortOpen(false)} sort={state.sort} onSort={(sort) => go(withFilters(state, { sort }))} />
      <TreasuryFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        state={state}
        options={overview?.filters ?? null}
        today={zurichToday(now)}
        onChange={(changes) => go(withFilters(state, changes))}
        onErase={() => go(clearFilters(state))}
      />

      <StickyActionBar>
        <Button variant="primary" href="/donate" icon="volunteer_activism" fullWidth>
          {copy.donateCta}
        </Button>
      </StickyActionBar>
    </main>
  );
}

/** The header's label: the code, or "All". */
const currencyLabel = (currency: TreasuryCurrencyChoice) => (currency === "all" ? copy.header.allShort : currency);

const sortField = (state: TreasuryState) => (state.sort.startsWith("amount") ? copy.sort.amount : copy.sort.date);

function History({ history, filters, now, onErase, state }: { history: TreasuryEntriesPage | null; filters: number; now: Date; onErase: () => void; state: TreasuryState }) {
  if (!history) return <p className="mt-3 text-body text-text-muted">{copy.history.unavailable}</p>;
  if (history.total === 0) {
    return filters > 0 || state.q ? (
      <div className="mt-3">
        <p className="text-body text-text-muted">{state.q && filters === 0 ? copy.history.noSearchMatch(state.q) : copy.history.noMatch}</p>
        <Button onClick={onErase} className="mt-3">
          {copy.filter.erase}
        </Button>
      </div>
    ) : (
      <p className="mt-3 text-body text-text-muted">{copy.history.empty}</p>
    );
  }
  const pages = Math.max(1, Math.ceil(history.total / history.pageSize));
  return (
    <>
      <HistoryList entries={history.items} now={now} className="mt-[0.6875rem]" />
      {pages > 1 ? (
        <nav aria-label={copy.history.pagination} className="mt-4 flex items-center justify-between gap-2">
          {history.page > 1 ? <Button href={treasuryHref({ ...state, page: history.page - 1 })}>{copy.history.newer}</Button> : <span />}
          <span className="text-meta text-text-muted">{copy.history.page(history.page, pages)}</span>
          {history.page < pages ? <Button href={treasuryHref({ ...state, page: history.page + 1 })}>{copy.history.older}</Button> : <span />}
        </nav>
      ) : null}
    </>
  );
}

/**
 * The stats (p11). Balance and Sustainability come from the Wise account:
 * hidden until it's connected (Q22). Med. donation and Expenses are the
 * published entries of the chosen currency, never converted.
 */
function buildStats(overview: TreasuryOverview): StatItem[] {
  const { currency } = overview;
  const stats = copy.stats;
  const items: StatItem[] = [];
  const trends = overview.trends;
  // Sample figures (before Wise) say so in the sheet's caption and under the row.
  const sample = overview.sampleFigures === true && !overview.wiseConnected;
  if (overview.wiseConnected || sample) {
    items.push(
      {
        id: "balance",
        value: overview.balance === null ? stats.noValue : formatStatAmount(overview.balance, currency),
        trend: formatTrend(trends?.balance ?? null),
        label: stats.balance,
        detail: {
          title: stats.balanceDetail.title,
          value: overview.balance === null ? stats.noValue : formatCodeAmount(overview.balance, currency),
          caption: sample ? stats.sampleCaption : stats.balanceDetail.caption,
          paragraphs: stats.balanceDetail.paragraphs.map((body) => ({ body })),
        },
      },
      {
        id: "sustainability",
        value: overview.sustainability === null ? stats.noValue : String(overview.sustainability),
        trend: formatTrend(trends?.sustainability ?? null),
        label: stats.sustainability,
        detail: {
          title: stats.sustainabilityDetail.title,
          value: overview.sustainability === null ? stats.noValue : String(overview.sustainability),
          caption: sample ? stats.sampleCaption : stats.sustainabilityDetail.caption,
          paragraphs: [...stats.sustainabilityDetail.paragraphs],
        },
      },
    );
  }
  items.push(
    {
      id: "median-donation",
      value: overview.medianDonation === null ? stats.noValue : formatMedian(overview.medianDonation, currency),
      trend: formatTrend(trends?.medianDonation ?? null),
      label: stats.median,
      detail: {
        title: stats.medianDetail.title,
        value: overview.medianDonation === null ? stats.noValue : formatExact(overview.medianDonation, currency),
        caption: stats.medianDetail.caption(currency),
        paragraphs: stats.medianDetail.paragraphs.map((body) => ({ body })),
      },
    },
    {
      id: "expenses",
      value: formatCompact(overview.expensesTotal),
      trend: formatTrend(trends?.expenses ?? null),
      label: stats.expenses,
      detail: {
        title: stats.expensesDetail.title,
        value: formatCodeAmount(overview.expensesTotal, currency),
        caption: stats.expensesDetail.caption(currency),
        paragraphs: [...stats.expensesDetail.paragraphs],
      },
    },
  );
  return items;
}

function readAppealDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(APPEAL_DISMISSED) === "1";
  } catch {
    // Storage blocked: the banner simply shows again.
    return false;
  }
}
/** sessionStorage has no same-tab change event; the component's own state covers its dismissal. */
const subscribeAppeal = () => () => {};

/**
 * "Cry for donation" (p11): shown while treasury.donation_appeal is on;
 * "sustainability" explains the score, "donating" opens Donate. Dismissing
 * hides it for the rest of the visit (this tab only).
 */
function DonationAppeal() {
  // The server renders it; the browser hides it if this tab dismissed it before.
  const stored = useSyncExternalStore(subscribeAppeal, readAppealDismissed, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  if (dismissed || stored) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(APPEAL_DISMISSED, "1");
    } catch {
      // Storage blocked: hidden until the page reloads.
    }
  };
  const appeal = copy.appeal;
  const sustainability = copy.stats.sustainabilityDetail;
  return (
    <section aria-label={appeal.title} className="relative mt-4 rounded-control bg-surface-raised px-2 pt-2 pb-2.5 text-text-primary">
      <h2 className="pr-6 text-meta font-bold">{appeal.title}</h2>
      <p className="mt-1 pr-6 text-meta">
        {appeal.before}
        <button type="button" onClick={() => setExplainOpen(true)} aria-haspopup="dialog" className={`cursor-pointer underline underline-offset-2 ${focusRing}`}>
          {appeal.sustainability}
        </button>
        {appeal.middle}
        <a href="/donate" className={`underline underline-offset-2 ${focusRing}`}>
          {appeal.donating}
        </a>
        {appeal.after}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={appeal.dismiss}
        className="absolute top-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text-primary"
      >
        <Icon name="close" />
      </button>
      <Sheet open={explainOpen} onClose={() => setExplainOpen(false)} title={sustainability.title}>
        <div className="mt-2 flex flex-col gap-paragraph">
          {sustainability.paragraphs.map((paragraph, index) => (
            <div key={index}>
              {"heading" in paragraph ? <p className="text-body font-bold">{paragraph.heading}</p> : null}
              <p className={`text-body ${"heading" in paragraph ? "mt-1" : ""}`}>{paragraph.body}</p>
            </div>
          ))}
        </div>
        <Button href="/donate" icon="volunteer_activism" fullWidth className="mt-4">
          {copy.donateCta}
        </Button>
      </Sheet>
    </section>
  );
}
