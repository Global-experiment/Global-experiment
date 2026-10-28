"use client";

import type { ImportStatus } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { useCan } from "../session";
import { AdminIcon, NotionMark } from "../ui/adminIcons";
import { AdminButtonLink } from "../ui/controls";

/**
 * Figma's "Import Notion" control (admin-desktop.pdf p11) with its appearances:
 * the Notion mark when idle, sync while an import runs. It opens the
 * import page (/admin/imports), where dry runs and applies happen. Shown
 * only to a role that can open that page and import this list's module.
 */
export function NotionImportControl({ module }: { module: "directory" | "taxonomy" | "treasury" }) {
  const canOpen = useCan("imports.read");
  const canImport = useCan(`${module}.import`);
  const visible = canOpen && canImport;
  const status = useAdminData<ImportStatus>(visible ? "/imports/status" : null);
  if (!visible) return null;
  const running = status.data?.activeJob?.status === "running";
  return (
    <AdminButtonLink href="/admin/imports" data-state={running ? "running" : "idle"} leading={running ? <AdminIcon name="sync" /> : <NotionMark />}>
      Import Notion
    </AdminButtonLink>
  );
}
