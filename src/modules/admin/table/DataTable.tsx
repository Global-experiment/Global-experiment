"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "../ui/adminIcons";
import { focusRing, MenuCheck, Popover } from "../ui/controls";
import {
  arrangeColumns,
  clampWidth,
  columnWidth,
  MIN_COLUMN_WIDTH,
  moveColumn,
  orderColumns,
  resetColumnWidth,
  setColumnWidth,
  stepColumn,
  stickyOffsets,
  toggleFrozen,
  toggleHidden,
  type ColumnPrefs,
} from "./columnPrefs";

export interface TableColumn<Row> {
  id: string;
  label: string;
  /** Column type glyph from Figma (T text, ⊙ select, ↗ relation, @, ☏, 🔗, 🕑…). */
  icon: AdminIconName;
  /** Default width (px); the visitor can resize it (stored in column prefs). */
  width: number;
  /** `search` is the active query, for highlighting matches (inverse tokens). */
  render: (row: Row, search: string) => ReactNode;
}

/** Keyboard resize step (px) for the column resize handle. */
const RESIZE_STEP = 16;

/**
 * The Figma admin table (figma.pdf p40): header labels muted with their
 * type glyph (header row 33px, text on the bottom edge), 1px rules above
 * every row and between cells, 4px cell padding, 14/18 text, rows growing
 * with content. Clicking a header opens its column menu (Freeze/Hide).
 * Rows link to the record (the first cell is a real link for keyboard and
 * screen-reader users; the rest of the row is a mouse convenience).
 *
 * Client feedback 2026-10-05:
 * - This wrapper is the ONLY scroll container of a list page, on both axes,
 *   so the column header row is `sticky top-0` and stays visible however
 *   deep or wide you scroll; frozen columns are `sticky left`, and frozen
 *   header cells both. The page itself never scrolls sideways.
 * - The last frozen column carries a right stroke (header and body).
 * - Columns resize from the handle on each header's right edge (drag, or
 *   ←/→ when it's focused; double-click resets) and reorder by dragging a
 *   header, or Alt+←/→ on a focused header. Both persist in column prefs;
 *   frozen offsets are recomputed from the resized widths.
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
  // A resize in progress renders live but is only stored on release.
  const [liveWidth, setLiveWidth] = useState<{ id: string; width: number } | null>(null);
  const widthOf = (column: TableColumn<Row>) =>
    liveWidth?.id === column.id ? liveWidth.width : columnWidth(column, prefs);
  const widths = arranged.map(widthOf);
  const offsets = stickyOffsets(widths, frozenCount);
  const lastFrozen = frozenCount - 1;

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuTrigger = useRef<HTMLElement | null>(null);
  const resize = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Drop insertion point in the displayed order (0..n). */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const frozenStyle = (index: number, header: boolean) =>
    index < frozenCount ? { left: offsets[index], zIndex: header ? 20 : 1 } : undefined;
  // Last frozen column: visible right stroke; the next cell drops its own left rule to avoid a double line.
  const frozenEdge = (index: number) => (index === lastFrozen ? "border-r border-line" : "");

  function commitMove(id: string, insertion: number) {
    const from = arranged.findIndex((column) => column.id === id);
    if (from === -1) return;
    // `moveColumn` wants the index in the list without the moved column.
    onPrefsChange(moveColumn(columns, prefs, id, from < insertion ? insertion - 1 : insertion));
  }

  function onHeaderKeyDown(event: KeyboardEvent<HTMLButtonElement>, column: TableColumn<Row>) {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const { prefs: next, change } = stepColumn(columns, prefs, column.id, event.key === "ArrowLeft" ? -1 : 1);
    if (change === "none") return;
    onPrefsChange(next);
    const position = arrangeColumns(columns, next).columns.findIndex((candidate) => candidate.id === column.id) + 1;
    setAnnouncement(
      change === "moved"
        ? `${column.label} moved to position ${position}.`
        : `${column.label} ${change === "frozen" ? "frozen" : "unfrozen"}.`,
    );
    // The header re-renders in its new place; keep focus on it.
    requestAnimationFrame(() => triggerRefs.current.get(column.id)?.focus());
  }

  function onResizeStart(event: PointerEvent<HTMLDivElement>, column: TableColumn<Row>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { id: column.id, startX: event.clientX, startWidth: widthOf(column) };
    setLiveWidth({ id: column.id, width: widthOf(column) });
  }
  function onResizeMove(event: PointerEvent<HTMLDivElement>) {
    const state = resize.current;
    if (!state) return;
    setLiveWidth({ id: state.id, width: clampWidth(state.startWidth + event.clientX - state.startX) });
  }
  function onResizeEnd() {
    const state = resize.current;
    resize.current = null;
    if (state && liveWidth?.id === state.id) onPrefsChange(setColumnWidth(prefs, state.id, liveWidth.width));
    setLiveWidth(null);
  }
  function onResizeKey(event: KeyboardEvent<HTMLDivElement>, column: TableColumn<Row>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onPrefsChange(setColumnWidth(prefs, column.id, widthOf(column) + (event.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP)));
    } else if (event.key === "Home") {
      event.preventDefault();
      onPrefsChange(resetColumnWidth(prefs, column.id));
    }
  }

  function onDragOver(event: DragEvent<HTMLTableCellElement>, index: number) {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDropAt(event.clientX < rect.left + rect.width / 2 ? index : index + 1);
  }

  return (
    <div
      data-table-scroller
      // `relative`: absolutely positioned descendants (sr-only cell text) must
      // be clipped by this scroller, not escape to <body> and widen the page.
      className="relative min-h-0 flex-1 overflow-auto overscroll-x-none"
      aria-busy={busy}
    >
      <table
        className="table-fixed border-separate border-spacing-0 text-body"
        style={{ width: widths.reduce((sum, width) => sum + width, 0) }}
      >
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {arranged.map((column, index) => (
            <col key={column.id} style={{ width: widths[index] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {arranged.map((column, index) => (
              <th
                key={column.id}
                scope="col"
                // The header's name is its label (not also the resize handle's).
                aria-label={column.label}
                data-column={column.id}
                data-frozen={index < frozenCount ? "" : undefined}
                style={frozenStyle(index, true)}
                draggable={liveWidth === null}
                onDragStart={(event) => {
                  if ((event.target as HTMLElement).closest("[data-resize-handle]")) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", column.label);
                  setDragging(column.id);
                }}
                onDragOver={(event) => onDragOver(event, index)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging && dropAt !== null) commitMove(dragging, dropAt);
                  setDragging(null);
                  setDropAt(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropAt(null);
                }}
                className={`sticky top-0 z-10 h-[33px] border-b border-line bg-surface-base px-1 pb-[3px] text-left align-bottom font-normal text-text-muted ${frozenEdge(index)} ${
                  dragging === column.id ? "opacity-50" : ""
                } ${dropAt === index ? "shadow-[inset_2px_0_0_var(--color-text-primary)]" : ""} ${
                  dropAt === index + 1 && index === arranged.length - 1 ? "shadow-[inset_-2px_0_0_var(--color-text-primary)]" : ""
                }`}
              >
                <button
                  type="button"
                  ref={(node) => {
                    if (node) triggerRefs.current.set(column.id, node);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={menuFor === column.id}
                  aria-describedby="data-table-column-help"
                  onClick={() => {
                    menuTrigger.current = triggerRefs.current.get(column.id) ?? null;
                    setMenuFor((open) => (open === column.id ? null : column.id));
                  }}
                  onKeyDown={(event) => onHeaderKeyDown(event, column)}
                  className={`flex w-full cursor-pointer items-center gap-1 text-left ${menuFor === column.id ? "text-text-primary" : ""} ${focusRing}`}
                >
                  <AdminIcon name={column.icon} />
                  <span className="truncate">{column.label}</span>
                </button>
                <div
                  data-resize-handle
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${column.label} column`}
                  aria-valuenow={widths[index]}
                  aria-valuemin={MIN_COLUMN_WIDTH}
                  tabIndex={0}
                  title="Drag to resize · double-click to reset"
                  onPointerDown={(event) => onResizeStart(event, column)}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                  onPointerCancel={onResizeEnd}
                  onDoubleClick={() => onPrefsChange(resetColumnWidth(prefs, column.id))}
                  onKeyDown={(event) => onResizeKey(event, column)}
                  className={`group absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize justify-end ${focusRing}`}
                >
                  <span
                    className={`h-full w-px ${liveWidth?.id === column.id ? "bg-text-primary" : "bg-transparent group-hover:bg-text-muted group-focus-visible:bg-text-muted"}`}
                  />
                </div>
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
          {rows.map((row, rowIndex) => (
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
                  data-column={column.id}
                  style={frozenStyle(index, false)}
                  className={`${index < frozenCount ? "sticky" : ""} ${rowIndex > 0 ? "border-t" : ""} border-line bg-surface-base px-1 py-1 align-top break-words text-text-primary ${
                    index > 0 && index !== frozenCount ? "border-l" : ""
                  } ${frozenEdge(index)}`}
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
      <p id="data-table-column-help" className="sr-only">
        Alt plus left or right arrow moves this column.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** The gear "columns" control (figma.pdf p40, 1416,156): every column listed (in the user's order), hidden ones unchecked. */
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
          {orderColumns(columns, prefs).map((column) => {
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
