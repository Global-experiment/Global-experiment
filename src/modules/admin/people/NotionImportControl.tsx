"use client";

import type { ImportStatus } from "../api/types";
import { useAdminData } from "../api/useAdminData";
import { AdminIcon, NotionMark } from "../ui/adminIcons";
import { AdminButtonLink } from "../ui/controls";

/**
 * Figma's "Notion import" control (figma.pdf p40) with its appearances:
 * the Notion mark when idle, sync while an import runs. It opens the
 * import page (/admin/imports), where dry runs and applies happen.
 */
export function NotionImportControl() {
  const status = useAdminData<ImportStatus>("/imports/status");
  const running = status.data?.activeJob?.status === "running";
  return (
    <AdminButtonLink href="/admin/imports" data-state={running ? "running" : "idle"} leading={running ? <AdminIcon name="sync" /> : <NotionMark />}>
      Notion import
    </AdminButtonLink>
  );
}
