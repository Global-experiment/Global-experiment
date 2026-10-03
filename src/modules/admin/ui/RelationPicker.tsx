"use client";

import { useEffect, useRef, useState } from "react";
import { AdminIcon } from "./adminIcons";
import { AdminButton, chipInput, focusRing, Popover } from "./controls";

export interface RelationOption {
  id: string;
  label: string;
  /** Secondary text, e.g. "Software · Technology" for an expertise. */
  detail?: string;
}

/**
 * Many-to-many editor: current links as removable lines, plus an "Add"
 * popover with a search box. `search` is called with the typed text — the
 * caller decides whether that hits the API (organizations) or filters a
 * small local list (the expertise taxonomy).
 */
export function RelationPicker({
  label,
  selected,
  onChange,
  search,
}: {
  label: string;
  selected: RelationOption[];
  onChange: (next: RelationOption[]) => void;
  search: (text: string, signal: AbortSignal) => Promise<RelationOption[]>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; options: RelationOption[]; failed?: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search(query, controller.signal).then(
        (options) => setResults({ query, options }),
        () => {
          if (!controller.signal.aborted) setResults({ query, options: [], failed: true });
        },
      );
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, search]);

  const selectedIds = new Set(selected.map((option) => option.id));
  const available = (results?.options ?? []).filter((option) => !selectedIds.has(option.id));
  const pending = results?.query !== query;

  return (
    <div>
      {selected.length > 0 ? (
        <ul className="flex flex-col">
          {selected.map((option) => (
            <li key={option.id} className="flex min-h-[26px] items-center gap-2">
              <span>
                {option.label}
                {option.detail ? <span className="text-text-muted"> · {option.detail}</span> : null}
              </span>
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={() => onChange(selected.filter((item) => item.id !== option.id))}
                className={`cursor-pointer text-text-muted ${focusRing}`}
              >
                <AdminIcon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative mt-1">
        <AdminButton ref={trigger} icon="add" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Add {label.toLowerCase()}
        </AdminButton>
        <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label={`Add ${label.toLowerCase()}`} className="top-[calc(100%+8px)] left-0 w-[360px]">
          <div className="border-b border-line p-2">
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              autoComplete="off"
              spellCheck={false}
              className={`${chipInput} w-full`}
            />
          </div>
          <ul className="max-h-72 overflow-y-auto" aria-busy={pending}>
            {results?.failed ? (
              <li role="alert" className="px-2 py-2 text-text-primary">
                Couldn&rsquo;t load {label.toLowerCase()}.
              </li>
            ) : available.length === 0 ? (
              <li className="px-2 py-2 text-text-muted">{pending ? "Searching…" : "No matches."}</li>
            ) : (
              available.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => onChange([...selected, option])}
                    className={`flex w-full cursor-pointer flex-col items-start border-b border-line px-2 py-2 text-left last:border-b-0 ${focusRing}`}
                  >
                    <span>{option.label}</span>
                    {option.detail ? <span className="text-meta text-text-muted">{option.detail}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </Popover>
      </div>
    </div>
  );
}
