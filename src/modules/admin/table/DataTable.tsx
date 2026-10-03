"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "../ui/adminIcons";
import { focusRing, MenuCheck, Popover } from "../ui/controls";
import { arrangeColumns, stickyOffsets, toggleFrozen, toggleHidden, type ColumnPrefs } from "./columnPrefs";

export interface TableColumn<Row> {
  id: string;
  label: string;
  /** Column type glyph from Figma (T text, ⊙ select, ↗ relation, @, ☏, 🔗, 🕑…). */
  icon: AdminIconName;
  width: number;
  /** `search` is the active query, for highlighting matches (inverse tokens). */
  render: (row: Row, search: string) => ReactNode;
}

/**
 * The Figma admin table (figma.pdf p40): header labels muted with their
 * type glyph (header row 33px, text on the bottom edge), 1px rules above
 * every row and between cells, 4px cell padding, 14/18 text, rows growing
 * with content. Clicking a header opens its column menu (Freeze/Hide).
 * Rows link to the record (the first cell is a real link for keyboard and
 * screen-reader users; the rest of the row is a mouse convenience).
 */
export function DataTable<Row extends { id: string }>({
  columns,
  rows,
  prefs,
  onPrefsChange,
  recordHref,
  search,
  busy,
  caption,
}: {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  prefs: ColumnPrefs;
  onPrefsChange: (prefs: ColumnPrefs) => void;
  recordHref: (row: Row) => string;
  search: string;
  busy: boolean;
  caption: string;
}) {
  const router = useRouter();
  const { columns: arranged, frozenCount } = arrangeColumns(columns, prefs);
  const offsets = stickyOffsets(
    arranged.map((column) => column.width),
    frozenCount,
  );
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuTrigger = useRef<HTMLElement | null>(null);

  const sticky = (index: number) =>
    index < frozenCount ? { position: "sticky" as const, left: offsets[index], zIndex: 1 } : undefined;

  return (
    <div className="overflow-x-auto" aria-busy={busy}>
      <table className="table-fixed border-separate border-spacing-0 text-body" style={{ width: arranged.reduce((sum, column) => sum + column.width, 0) }}>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {arranged.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {arranged.map((column, index) => (
              <th
                key={column.id}
                scope="col"
                style={sticky(index)}
                className="relative h-[33px] bg-surface-base px-1 pb-[3px] text-left align-bottom font-normal text-text-muted"
              >
                <button
                  type="button"
                  ref={(node) => {
                    if (node) triggerRefs.current.set(column.id, node);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={menuFor === column.id}
                  onClick={() => {
                    menuTrigger.current = triggerRefs.current.get(column.id) ?? null;
                    setMenuFor((open) => (open === column.id ? null : column.id));
                  }}
                  className={`flex w-full cursor-pointer items-center gap-1 text-left ${menuFor === column.id ? "text-text-primary" : ""} ${focusRing}`}
                >
                  <AdminIcon name={column.icon} />
                  <span className="truncate">{column.label}</span>
                </button>
                {menuFor === column.id ? (
                  <Popover
                    open
                    onClose={() => setMenuFor(null)}
                    triggerRef={menuTrigger}
                    label={`${column.label} column`}
                    className="top-[calc(100%+9px)] left-0 w-40 font-normal"
                  >
                    <button
                      type="button"
                      aria-pressed={prefs.frozen.includes(column.id)}
                      onClick={() => onPrefsChange(toggleFrozen(prefs, column.id))}
                      className={`flex h-10 w-full cursor-pointer items-center gap-2 border-b border-line px-2 text-text-primary ${focusRing}`}
                    >
                      <MenuCheck checked={prefs.frozen.includes(column.id)} />
                      Freeze column
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPrefsChange(toggleHidden(prefs, column.id));
                        setMenuFor(null);
                      }}
                      className={`flex h-10 w-full cursor-pointer items-center gap-2 px-2 text-text-primary ${focusRing}`}
                    >
                      <MenuCheck checked={false} />
                      Hide column
                    </button>
                  </Popover>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={busy ? "opacity-60" : ""}>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a, button")) return;
                router.push(recordHref(row));
              }}
              className="cursor-pointer"
            >
              {arranged.map((column, index) => (
                <td
                  key={column.id}
                  style={sticky(index)}
                  className={`border-t border-line bg-surface-base px-1 py-1 align-top break-words text-text-primary ${index > 0 ? "border-l" : ""}`}
                >
                  {index === 0 ? (
                    <Link href={recordHref(row)} className={`block ${focusRing}`}>
                      {column.render(row, search)}
                    </Link>
                  ) : (
                    column.render(row, search)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The gear "columns" control (figma.pdf p40, 1416,156): every column listed, hidden ones unchecked. */
export function ColumnsControl<Row>({
  columns,
  prefs,
  onPrefsChange,
}: {
  columns: readonly TableColumn<Row>[];
  prefs: ColumnPrefs;
  onPrefsChange: (prefs: ColumnPrefs) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative flex">
      <button
        ref={trigger}
        type="button"
        aria-label="Columns"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex size-4 cursor-pointer items-center justify-center text-text-muted ${focusRing}`}
      >
        <AdminIcon name="settings" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label="Columns" className="top-[calc(100%+14px)] right-0 w-56">
        <ul className="max-h-[60vh] overflow-y-auto">
          {columns.map((column) => {
            const visible = !prefs.hidden.includes(column.id);
            return (
              <li key={column.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  aria-pressed={visible}
                  onClick={() => onPrefsChange(toggleHidden(prefs, column.id))}
                  className={`flex h-10 w-full cursor-pointer items-center gap-2 px-2 text-text-primary ${focusRing}`}
                >
                  <MenuCheck checked={visible} />
                  <AdminIcon name={column.icon} className="text-text-muted" />
                  {column.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}
