"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { EntityRef } from "../api/types";
import { AdminIcon } from "./adminIcons";
import { AdminButton, chipInput, focusRing, Popover } from "./controls";

export interface RelationOption {
  id: string;
  label: string;
  /** Secondary text, e.g. "Technology > Software" for an expertise. */
  detail?: string;
  /** The linked record's own page; when set, the selected item is a link to it. */
  href?: string;
  /** Tooltip (e.g. the full "Domain > Field > Expertise" path). */
  title?: string;
  /** Shown greyed out (e.g. a Deprecated expertise). */
  muted?: boolean;
  /** Small chips after the label (e.g. an expertise's teams). */
  tags?: string[];
  /** Listed but can't be picked (e.g. Proposed / Deprecated expertise). */
  disabled?: boolean;
  disabledReason?: string;
  /** What this option rolls up to (expertise → field, domain). */
  group?: { field: EntityRef; domain: EntityRef };
}

/** A page of search results; `hasMore` shows a "Load more" button. */
export type RelationSearchResult = RelationOption[] | { options: RelationOption[]; hasMore: boolean };

const chip = "inline-flex items-center rounded-control border border-line px-1 text-meta leading-[18px] text-text-muted";

/**
 * Many-to-many editor: current links as removable lines (or chips), plus an
 * "Add" popover with a search box. `search` is called with the typed text
 * and a page number — the caller decides whether that hits the API
 * (organizations, expertise) or filters a small local list. The popover
 * stays open after a pick, for picking several. Keyboard: ↓ from the search
 * box into the results, ↑/↓ between them, Enter picks, Esc closes.
 */
export function RelationPicker({
  label,
  selected,
  onChange,
  search,
  display = "lines",
}: {
  label: string;
  selected: RelationOption[];
  onChange: (next: RelationOption[]) => void;
  search: (text: string, signal: AbortSignal, page: number) => Promise<RelationSearchResult>;
  display?: "lines" | "chips";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ query: string; page: number; options: RelationOption[]; hasMore: boolean; failed?: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search(query, controller.signal, page).then(
        (result) => {
          const { options, hasMore } = Array.isArray(result) ? { options: result, hasMore: false } : result;
          setResults((previous) => ({
            query,
            page,
            // Later pages append to what the same query already showed.
            options: page > 1 && previous?.query === query ? [...previous.options, ...options] : options,
            hasMore,
          }));
        },
        () => {
          if (!controller.signal.aborted) setResults({ query, page, options: [], hasMore: false, failed: true });
        },
      );
    }, page > 1 ? 0 : 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, page, search]);

  const selectedIds = new Set(selected.map((option) => option.id));
  const available = (results?.options ?? []).filter((option) => !selectedIds.has(option.id));
  const pending = results?.query !== query || results.page !== page;
  const noun = label.toLowerCase();

  /** ↑/↓ move between the search box and the result buttons. */
  function onListKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) buttons[event.key === "ArrowDown" ? 0 : buttons.length - 1]!.focus();
    else if (event.key === "ArrowUp" && index === 0) (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus();
    else buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]!.focus();
  }

  const remove = (option: RelationOption) => (
    <button
      type="button"
      aria-label={`Remove ${option.label}`}
      onClick={() => onChange(selected.filter((item) => item.id !== option.id))}
      className={`cursor-pointer text-text-muted ${focusRing}`}
    >
      <AdminIcon name="close" />
    </button>
  );

  return (
    <div>
      {selected.length > 0 ? (
        display === "chips" ? (
          <ul className="flex flex-wrap gap-1" aria-label={`Linked ${noun}`}>
            {selected.map((option) => (
              <li
                key={option.id}
                title={option.title}
                data-muted={option.muted ? "true" : undefined}
                className={`inline-flex min-h-[26px] items-center gap-1 rounded-control border border-line pr-1 pl-2 ${option.muted ? "text-text-muted" : ""}`}
              >
                <span>{option.label}</span>
                {option.muted && option.title ? <span className="sr-only">{option.title}</span> : null}
                {remove(option)}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col">
            {selected.map((option) => (
              <li key={option.id} title={option.title} className={`flex min-h-[26px] items-center gap-2 ${option.muted ? "text-text-muted" : ""}`}>
                <span>
                  {option.href ? (
                    <Link href={option.href} className={`underline underline-offset-2 ${focusRing}`}>
                      {option.label}
                    </Link>
                  ) : (
                    option.label
                  )}
                  {option.detail ? <span className="text-text-muted"> · {option.detail}</span> : null}
                </span>
                {remove(option)}
              </li>
            ))}
          </ul>
        )
      ) : null}
      <div className="relative mt-1">
        <AdminButton ref={trigger} icon="add" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Add {noun}
        </AdminButton>
        <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label={`Add ${noun}`} className="top-[calc(100%+8px)] left-0 w-[420px]">
          <div onKeyDown={onListKeyDown}>
            <div className="border-b border-line p-2">
              <input
                aria-label={`Search ${noun}`}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search"
                autoComplete="off"
                spellCheck={false}
                className={`${chipInput} w-full`}
              />
            </div>
            <ul ref={list} className="max-h-80 overflow-y-auto" aria-busy={pending}>
              {results?.failed ? (
                <li role="alert" className="px-2 py-2 text-text-primary">
                  Couldn&rsquo;t load {noun}.
                </li>
              ) : available.length === 0 ? (
                <li className="px-2 py-2 text-text-muted">{pending ? "Searching…" : "No matches."}</li>
              ) : (
                available.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={option.disabled}
                      title={option.disabledReason ?? option.title}
                      onClick={() => onChange([...selected, option])}
                      className={`flex w-full cursor-pointer flex-col items-start gap-0.5 border-b border-line px-2 py-2 text-left last:border-b-0 disabled:cursor-not-allowed ${option.muted ? "text-text-muted" : ""} ${focusRing}`}
                    >
                      <span>
                        {option.label}
                        {option.disabled && option.disabledReason ? <span className="sr-only"> — {option.disabledReason}</span> : null}
                      </span>
                      {option.detail ? <span className="text-meta text-text-muted">{option.detail}</span> : null}
                      {option.tags?.length ? (
                        <span className="flex flex-wrap gap-1" aria-label="Teams">
                          {option.tags.map((tag) => (
                            <span key={tag} className={chip}>
                              {tag}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
              {results?.hasMore && !pending ? (
                <li className="p-2">
                  <AdminButton onClick={() => setPage((value) => value + 1)}>Load more</AdminButton>
                </li>
              ) : null}
            </ul>
          </div>
        </Popover>
      </div>
    </div>
  );
}
