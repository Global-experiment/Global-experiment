"use client";

import { adminApi } from "../api/client";
import type { ExpertiseSearchItem, Page } from "../api/types";
import { RELATION_LIMITS } from "../relationLimits";
import { RelationPicker, type RelationOption, type RelationSearchResult } from "../ui/RelationPicker";
import { expertiseRollup, searchResultOption } from "./expertiseOptions";

const PAGE_SIZE = 20;

/** Server-side search over all ~1,100 expertise items (Active only), 20 at a time. */
export async function searchExpertise(text: string, signal: AbortSignal, page: number): Promise<RelationSearchResult> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (text.trim()) query.set("q", text.trim());
  const result = await adminApi<Page<ExpertiseSearchItem>>(`/expertise/search?${query}`, { signal });
  return { options: result.items.map(searchResultOption), hasMore: result.page * result.pageSize < result.total };
}

/**
 * Expertise on a person / organization record: the inline picker (at most
 * 10, as the API enforces), linked items as chips (full path in the
 * tooltip, greyed out unless Active), and the Fields and Domains they roll
 * up to — computed from the links, not stored.
 */
export function ExpertiseField({
  selected,
  onChange,
  limitMessage,
}: {
  selected: RelationOption[];
  onChange: (next: RelationOption[]) => void;
  limitMessage: string;
}) {
  const { fields, domains } = expertiseRollup(selected);
  return (
    <div className="flex flex-col gap-1">
      <RelationPicker label="Expertise" selected={selected} onChange={onChange} search={searchExpertise} max={RELATION_LIMITS.expertise} limitMessage={limitMessage} reorderable />
      {selected.length > 0 ? (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-meta text-text-muted" aria-label="Expertise rollup">
          <dt>Fields</dt>
          <dd>{fields.map((field) => field.name).join(", ")}</dd>
          <dt>Domains</dt>
          <dd>{domains.map((domain) => domain.name).join(", ")}</dd>
        </dl>
      ) : null}
    </div>
  );
}
