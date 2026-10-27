"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { EntityRef } from "../api/types";
import { AdminIcon } from "./adminIcons";
import { AdminButton, focusRing } from "./controls";

export interface RelationOption {
  id: string;
  label: string;
  /** Secondary text, e.g. "Technology > Software" for an expertise. */
  detail?: string;
  /** The linked record's own page; when set, the chip's label links to it. */
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

const tag = "inline-flex items-center rounded-control border border-line px-1 text-meta leading-[18px] text-text-muted";

/**
 * Many-to-many editor as drawn on admin-desktop.pdf p12: an inline
 * "🔍 Search" line (glyph at the value column's edge, text 24px in) whose
 * results drop down under it, and the linked records as 32px chips (1px
 * ring, 8px apart) with a remove button each. `search` gets the typed text
 * and a page number — the caller decides whether that hits the API or
 * filters a small local list. The list stays open after a pick, for
 * picking several. `max` caps the links (the API enforces the same cap):
 * at the cap the list says so instead of offering more.
 *
 * Keyboard: ↓ from the search box into the results, ↑/↓ between them,
 * Enter picks, Esc closes (Enter in the box never submits the record).
 *
 * `reorderable` (client, 2026-10-22: contact channels, organizations,
 * expertise): the chips keep the order given and can be reordered — dragged
 * with the mouse, or focused and moved with Alt+← / Alt+→ (each move is
 * announced). The first one comes first everywhere (the preferred contact
 * channel).
 */
export function RelationPicker({
  label,
  selected,
  onChange,
  search,
  max,
  limitMessage,
  reorderable = false,
}: {
  label: string;
  selected: RelationOption[];
  onChange: (next: RelationOption[]) => void;
  search: (text: string, signal: AbortSignal, page: number) => Promise<RelationSearchResult>;
  max?: number;
  /** Shown when `max` is reached, e.g. "People can have up to 10 expertise." */
  limitMessage?: string;
  /** The chips can be reordered (drag and drop, Alt+← / Alt+→). */
  reorderable?: boolean;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const chips = useRef<HTMLUListElement>(null);
  /** Moves a chip to another index; announces it and keeps the focus on the moved chip. */
  const move = (id: string, to: number) => {
    const from = selected.findIndex((option) => option.id === id);
    if (from === -1 || to < 0 || to >= selected.length || from === to) return;
    const next = [...selected];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
    setAnnouncement(`${item!.label} moved to position ${to + 1} of ${next.length}.`);
    requestAnimationFrame(() => chips.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(id)}"]`)?.focus());
  };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ query: string; page: number; options: RelationOption[]; hasMore: boolean; failed?: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const noun = label.toLowerCase();
  const atLimit = max !== undefined && selected.length >= max;

  useEffect(() => {
    if (!open || atLimit) return;
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
  }, [open, atLimit, query, page, search]);

  // Close on a press outside the picker.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const selectedIds = new Set(selected.map((option) => option.id));
  const available = (results?.options ?? []).filter((option) => !selectedIds.has(option.id));
  const pending = results?.query !== query || results.page !== page;

  const pick = (option: RelationOption) => {
    if (atLimit || option.disabled) return;
    onChange([...selected, option]);
    // The picked option leaves the list: keep focus in the picker (search box), not on <body>.
    input.current?.focus();
  };

  /** ↑/↓ move between the search box and the result buttons; Esc closes. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      input.current?.focus();
      return;
    }
    if (event.key === "Enter" && event.target === input.current) {
      event.preventDefault(); // never submit the record from the search box
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!open) setOpen(true);
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button[data-option]:not(:disabled)") ?? [])];
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) buttons[event.key === "ArrowDown" ? 0 : buttons.length - 1]!.focus();
    else if (event.key === "ArrowUp" && index === 0) input.current?.focus();
    else buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]!.focus();
  }

  return (
    <div ref={root} onKeyDown={onKeyDown} data-relation-picker={noun}>
      <div className="relative">
        <label className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-text-muted ring-1 ring-transparent focus-within:ring-text-primary hover:ring-line">
          <AdminIcon name="search" />
          <span className="sr-only">Search {noun}</span>
          <input
            ref={input}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            placeholder="Search"
            autoComplete="off"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
        {open ? (
          <ul
            ref={list}
            id={listId}
            aria-label={`${label} results`}
            aria-busy={!atLimit && pending}
            className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-control bg-surface-base text-body ring-1 ring-line"
          >
            {atLimit ? (
              <li role="status" data-limit-reached className="px-2 py-2 text-text-primary">
                {limitMessage ?? `Up to ${max} ${noun}.`} Remove one to add another.
              </li>
            ) : results?.failed ? (
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
                    data-option
                    disabled={option.disabled}
                    title={option.disabledReason ?? option.title}
                    onClick={() => pick(option)}
                    className={`flex w-full cursor-pointer flex-col items-start gap-0.5 border-b border-line px-2 py-2 text-left last:border-b-0 disabled:cursor-not-allowed ${option.muted ? "text-text-muted" : ""} ${focusRing}`}
                  >
                    <span>
                      {option.label}
                      {option.disabled && option.disabledReason ? <span className="sr-only"> — {option.disabledReason}</span> : null}
                    </span>
                    {option.detail ? <span className="text-meta text-text-muted">{option.detail}</span> : null}
                    {option.tags?.length ? (
                      <span className="flex flex-wrap gap-1" aria-label="Teams">
                        {option.tags.map((value) => (
                          <span key={value} className={tag}>
                            {value}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
            {!atLimit && results?.hasMore && !pending ? (
              <li className="p-2">
                <AdminButton onClick={() => setPage((value) => value + 1)}>Load more</AdminButton>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {selected.length > 0 ? (
        // 8px between the chips, across and down, and 8px from the search line above (client, 2026-10-22).
        <ul ref={chips} className="mt-2 flex flex-wrap gap-2" aria-label={`Linked ${noun}`} data-reorderable={reorderable || undefined}>
          {selected.map((option, index) => (
            <li
              key={option.id}
              data-chip={option.id}
              title={option.title ?? (reorderable ? "Drag to reorder, or Alt+← / Alt+→" : undefined)}
              data-muted={option.muted ? "true" : undefined}
              data-dragging={dragged === option.id || undefined}
              {...(reorderable
                ? {
                    tabIndex: 0,
                    "aria-roledescription": "reorderable chip",
                    "aria-label": `${option.label}, ${index + 1} of ${selected.length}. Alt+Left or Alt+Right to move.`,
                    draggable: true,
                    onDragStart: (event: React.DragEvent) => {
                      setDragged(option.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", option.id);
                    },
                    onDragOver: (event: React.DragEvent) => {
                      if (!dragged) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    },
                    onDrop: (event: React.DragEvent) => {
                      event.preventDefault();
                      const id = dragged ?? event.dataTransfer.getData("text/plain");
                      if (id) move(id, index);
                      setDragged(null);
                    },
                    onDragEnd: () => setDragged(null),
                    onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => {
                      if (!event.altKey || event.target !== event.currentTarget) return;
                      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                        event.preventDefault();
                        move(option.id, index - 1);
                      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                        event.preventDefault();
                        move(option.id, index + 1);
                      }
                    },
                  }
                : {})}
              className={`inline-flex h-8 items-center gap-1 rounded-control pr-2 pl-2 ring-1 ring-line ${option.muted ? "text-text-muted line-through" : ""} ${reorderable ? `cursor-grab active:cursor-grabbing data-[dragging]:opacity-50 ${focusRing}` : ""}`}
            >
              {option.href ? (
                <Link href={option.href} className={`hover:underline ${focusRing}`}>
                  {option.label}
                </Link>
              ) : (
                <span>{option.label}</span>
              )}
              {option.muted && option.title ? <span className="sr-only">{option.title}</span> : null}
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={() => onChange(selected.filter((item) => item.id !== option.id))}
                className={`cursor-pointer text-text-muted hover:text-text-primary ${focusRing}`}
              >
                <AdminIcon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {reorderable ? (
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      ) : null}
    </div>
  );
}
