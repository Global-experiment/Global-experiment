"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import type { CsvTable, ImportStatus } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { useCan } from "../session";
import { AdminIcon, NotionMark } from "../ui/adminIcons";
import { AdminButton, focusRing, Popover } from "../ui/controls";

/** A row of the menu, drawn like the record panel's buttons (admin-desktop.pdf p11): glyph, bold label, 32px, its own ring. */
function MenuLink({ href, glyph, children }: { href: string; glyph: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} role="menuitem" className={`flex h-8 w-full items-center gap-2 rounded-control px-2 text-body font-bold whitespace-nowrap text-text-primary ring-1 ring-line hover:bg-surface-raised ${focusRing}`}>
      {glyph}
      {children}
    </Link>
  );
}

/**
 * "More options" on People and Organizations (the only tables with an
 * import, decision of 2026-10-23): Import CSV for roles that can create
 * records there (directory.create), Import Notion for those that run the
 * Notion import (imports.read and directory.import) — its glyph turns to
 * sync while an import runs (p12). Nothing shows to a role that can do
 * neither, and no request is made for it.
 */
export function DirectoryMoreOptions({ table }: { table: CsvTable }) {
  const canCsv = useCan("directory.create");
  const canOpenImports = useCan("imports.read");
  const canNotion = useCan("directory.import") && canOpenImports;
  const status = useAdminData<ImportStatus>(canNotion ? "/imports/status" : null);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!canCsv && !canNotion) return null;
  const running = status.data?.activeJob?.status === "running";
  return (
    <div className="relative">
      <AdminButton ref={trigger} icon="expand_more" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        More options
      </AdminButton>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={trigger} label="More options" className="top-[calc(100%+8px)] right-0 w-56 p-2">
        <div role="menu" aria-label="More options" className="flex flex-col gap-2">
          {canCsv ? (
            <MenuLink href={`/admin/imports/csv?table=${table}`} glyph={<AdminIcon name="insert_drive_file" />}>
              Import CSV
            </MenuLink>
          ) : null}
          {canNotion ? (
            <MenuLink href="/admin/imports" glyph={running ? <AdminIcon name="sync" /> : <NotionMark />}>
              <span data-state={running ? "running" : "idle"}>Import Notion</span>
            </MenuLink>
          ) : null}
        </div>
      </Popover>
    </div>
  );
}
