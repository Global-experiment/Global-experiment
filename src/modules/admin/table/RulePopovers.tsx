"use client";

import { useRef, useState, type DragEvent, type ReactNode, type RefObject } from "react";
import { AdminIcon } from "../ui/adminIcons";
import { AdminButton, ChipSelect, chipInput, focusRing, Popover } from "../ui/controls";
import { directionLabel, OPERATOR_LABEL, type ListField } from "./fields";
import { VALUELESS_OPERATORS, type FilterOperator, type FilterRule, type SortRule } from "./listState";

/**
 * Figma's filter (p41) and sort (p42) popovers: 40px rows of
 * [⠿ drag] [field ▾] [operator/direction ▾] [value] … [duplicate] [remove],
 * then "New …" / "Remove all …". Rows reorder by dragging the handle
 * (order matters for sorts: the first rule is the primary sort).
 */

function fresh(field: ListField): FilterRule {
  const operator = field.operators[0]!;
  return { field: field.id, operator, value: VALUELESS_OPERATORS.has(operator) ? undefined : (field.options?.[0]?.value ?? "") };
}

/**
 * The rules being edited while the popover is open. Each edit is applied
 * locally first and then pushed to the URL, so quick successive edits
 * (field, then direction) never build on a not-yet-updated prop.
 */
function useDraft<Item>(open: boolean, value: Item[], onChange: (next: Item[]) => void, seed?: () => Item[]) {
  const [draft, setDraft] = useState(value);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    // Opening with no rules shows one starter row; it only reaches the URL once edited.
    if (open) setDraft(value.length === 0 && seed ? seed() : value);
  }
  const change = (next: Item[]) => {
    setDraft(next);
    onChange(next);
  };
  return [open ? draft : value, change] as const;
}

function useReorder<Item>(items: Item[], onChange: (items: Item[]) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  return {
    handleProps: (index: number) => ({
      draggable: true,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        setDragging(index);
      },
      onDragEnd: () => setDragging(null),
    }),
    rowProps: (index: number) => ({
      onDragOver: (event: DragEvent) => {
        if (dragging !== null) event.preventDefault();
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (dragging === null || dragging === index) return;
        const next = [...items];
        const [moved] = next.splice(dragging, 1);
        next.splice(index, 0, moved!);
        onChange(next);
        setDragging(null);
      },
    }),
  };
}

function RowShell({
  children,
  onDuplicate,
  onRemove,
  handleProps,
  rowProps,
  label,
}: {
  children: ReactNode;
  onDuplicate: () => void;
  onRemove: () => void;
  handleProps: object;
  rowProps: object;
  label: string;
}) {
  return (
    <li className="flex h-10 items-center gap-2 border-b border-line pr-2 pl-2" {...rowProps}>
      <span {...handleProps} title="Drag to reorder" className="cursor-grab text-text-muted">
        <AdminIcon name="drag_indicator" />
      </span>
      {children}
      <span className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onDuplicate} aria-label={`Duplicate ${label}`} className={`cursor-pointer text-text-muted ${focusRing}`}>
          <AdminIcon name="content_copy" />
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className={`cursor-pointer text-text-muted ${focusRing}`}>
          <AdminIcon name="close" />
        </button>
      </span>
    </li>
  );
}

export function FilterPopover({
  open,
  onClose,
  triggerRef,
  fields,
  filters: filterProp,
  onChange: pushFilters,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  fields: readonly ListField[];
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}) {
  const filterable = fields.filter((field) => field.operators.length > 0);
  const [filters, onChange] = useDraft(open, filterProp, pushFilters, () => [fresh(filterable[0]!)]);
  const reorder = useReorder(filters, onChange);
  const update = (index: number, rule: FilterRule) => onChange(filters.map((current, i) => (i === index ? rule : current)));

  return (
    <Popover open={open} onClose={onClose} triggerRef={triggerRef} label="Filters" className="top-[calc(100%+8px)] right-0 w-[480px]">
      <ul>
        {filters.map((rule, index) => {
          const field = filterable.find((candidate) => candidate.id === rule.field) ?? filterable[0]!;
          return (
            <RowShell
              key={index}
              label={`filter ${index + 1}`}
              onDuplicate={() => onChange([...filters.slice(0, index + 1), { ...rule }, ...filters.slice(index + 1)])}
              onRemove={() => onChange(filters.filter((_, i) => i !== index))}
              handleProps={reorder.handleProps(index)}
              rowProps={reorder.rowProps(index)}
            >
              <ChipSelect
                aria-label="Field"
                icon={field.icon}
                value={field.id}
                onChange={(event) => update(index, fresh(filterable.find((candidate) => candidate.id === event.target.value)!))}
              >
                {filterable.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </ChipSelect>
              <ChipSelect
                aria-label="Condition"
                value={rule.operator}
                onChange={(event) => {
                  const operator = event.target.value as FilterOperator;
                  update(index, {
                    field: rule.field,
                    operator,
                    value: VALUELESS_OPERATORS.has(operator) ? undefined : (rule.value ?? field.options?.[0]?.value ?? ""),
                  });
                }}
              >
                {field.operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {OPERATOR_LABEL[operator]}
                  </option>
                ))}
              </ChipSelect>
              {VALUELESS_OPERATORS.has(rule.operator) ? null : field.options ? (
                <ChipSelect aria-label="Value" value={rule.value ?? ""} onChange={(event) => update(index, { ...rule, value: event.target.value })}>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </ChipSelect>
              ) : (
                <input
                  aria-label="Value"
                  value={rule.value ?? ""}
                  onChange={(event) => update(index, { ...rule, value: event.target.value })}
                  maxLength={200}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${chipInput} w-[120px]`}
                />
              )}
            </RowShell>
          );
        })}
      </ul>
      <div className="flex h-10 items-center gap-2 px-2">
        <AdminButton icon="add" onClick={() => onChange([...filters, fresh(filterable[0]!)])}>
          New filter
        </AdminButton>
        <AdminButton icon="close" onClick={() => onChange([])} disabled={filters.length === 0}>
          Remove all filters
        </AdminButton>
      </div>
    </Popover>
  );
}

export function SortPopover({
  open,
  onClose,
  triggerRef,
  fields,
  sort: sortProp,
  onChange: pushSort,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  fields: readonly ListField[];
  sort: SortRule[];
  onChange: (sort: SortRule[]) => void;
}) {
  const [sort, onChange] = useDraft(open, sortProp, pushSort);
  const sortable = fields.filter((field) => field.sort);
  const reorder = useReorder(sort, onChange);
  const unused = sortable.filter((field) => !sort.some((rule) => rule.field === field.id));
  const update = (index: number, rule: SortRule) => onChange(sort.map((current, i) => (i === index ? rule : current)));

  return (
    <Popover open={open} onClose={onClose} triggerRef={triggerRef} label="Sort" className="top-[calc(100%+8px)] right-0 w-[480px]">
      <ul>
        {sort.map((rule, index) => {
          const field = sortable.find((candidate) => candidate.id === rule.field);
          return (
            <RowShell
              key={rule.field}
              label={`sort ${index + 1}`}
              onDuplicate={() => {
                const next = unused[0];
                if (next) onChange([...sort.slice(0, index + 1), { field: next.id, direction: rule.direction }, ...sort.slice(index + 1)]);
              }}
              onRemove={() => onChange(sort.filter((_, i) => i !== index))}
              handleProps={reorder.handleProps(index)}
              rowProps={reorder.rowProps(index)}
            >
              <ChipSelect
                aria-label="Sort by"
                icon={field?.icon}
                value={rule.field}
                onChange={(event) => update(index, { ...rule, field: event.target.value })}
              >
                {sortable
                  .filter((candidate) => candidate.id === rule.field || !sort.some((other) => other.field === candidate.id))
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
              </ChipSelect>
              <ChipSelect
                aria-label="Direction"
                value={rule.direction}
                onChange={(event) => update(index, { ...rule, direction: event.target.value as SortRule["direction"] })}
              >
                {(field?.sort === "dates" ? (["desc", "asc"] as const) : (["asc", "desc"] as const)).map((direction) => (
                  <option key={direction} value={direction}>
                    {directionLabel(field, direction)}
                  </option>
                ))}
              </ChipSelect>
            </RowShell>
          );
        })}
      </ul>
      <div className="flex h-10 items-center gap-2 px-2">
        <AdminButton
          icon="add"
          disabled={unused.length === 0 || sort.length >= 3}
          onClick={() => onChange([...sort, { field: unused[0]!.id, direction: unused[0]!.sort === "dates" ? "desc" : "asc" }])}
        >
          New sort
        </AdminButton>
        <AdminButton icon="close" onClick={() => onChange([])} disabled={sort.length === 0}>
          Remove all sorts
        </AdminButton>
      </div>
    </Popover>
  );
}

/** Keeps a stable ref for popover triggers. */
export const useTriggerRef = () => useRef<HTMLButtonElement>(null);
