"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseFilter, serializeFilter, type FilterRule } from "./listState";
import { ViewTabs } from "./ViewTabs";

/** A saved view: a set of filters on the list contract (several values on one field mean any of them). */
export interface SavedView {
  id: string;
  label: string;
  filters: FilterRule[];
}

/** Archived records (decision 12): a view of its own, not a filter (listState's `view`). */
const ARCHIVED = { id: "archived", label: "Archived" };

const key = (filters: readonly FilterRule[]) => filters.map(serializeFilter).sort().join("&");

/**
 * Figma's view tabs (p16 "All services / Active services / Access review",
 * p17, Treasury): selecting one replaces the filters, keeping the sort; a
 * view is current while the URL holds exactly its filters, so editing the
 * filters by hand leaves no tab selected.
 */
export function SavedViews({ views, archived = false, maxVisible = 7 }: { views: readonly SavedView[]; archived?: boolean; maxVisible?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = key(params.getAll("filter").map(parseFilter).filter((rule): rule is FilterRule => rule !== undefined));
  const inArchive = params.get("view") === "archived";
  const active = inArchive ? (current === "" ? ARCHIVED.id : "") : (views.find((view) => key(view.filters) === current)?.id ?? "");
  const select = (id: string) => {
    const next = new URLSearchParams();
    if (id === ARCHIVED.id) next.set("view", "archived");
    else for (const rule of views.find((candidate) => candidate.id === id)!.filters) next.append("filter", serializeFilter(rule));
    for (const sort of params.getAll("sort")) next.append("sort", sort);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };
  return <ViewTabs views={archived ? [...views, ARCHIVED] : views} current={active} onSelect={select} maxVisible={maxVisible} />;
}
