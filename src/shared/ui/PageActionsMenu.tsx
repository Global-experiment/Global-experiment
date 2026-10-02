"use client";

import { useState, type ReactNode } from "react";
import { withReportSource } from "@/shared/navigation/sourcePage";
import { useCurrentSourcePage } from "@/shared/navigation/useCurrentSourcePage";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Sheet } from "./Sheet";
import type { IconName } from "./icons";

export interface PageAction {
  label: string;
  icon: IconName;
  href?: string;
  onClick?: () => void;
}

interface PageActionsMenuProps {
  /** Accessible name of the sheet and the trigger button. Not shown visually — these menus have no header in Figma (client feedback item 9). */
  label: string;
  actions: PageAction[];
  /** Optional lead text above the rows (figma.pdf p3/p12/p16). */
  children?: ReactNode;
  /** Page the Send feedback / Report issue rows report from; defaults to the current page. */
  source?: string;
}

/**
 * The `more_vert` overflow control from the Figma headers. Opens the shared
 * Sheet with one 40px action row per entry (p3, p12, p16) — no visible
 * title, matching Figma. Feedback/Issue rows carry `?source=`.
 */
export function PageActionsMenu({ label, actions, children, source: explicitSource }: PageActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const currentPage = useCurrentSourcePage();
  const source = explicitSource ?? currentPage;

  return (
    <>
      <IconButton onClick={() => setOpen(true)} label={label} icon="more_vert" />
      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel={label}>
        {/* figma.pdf p3/p12/p16/p18: paragraphs one line apart, rows 12px under the copy. */}
        {children ? <div className="flex flex-col gap-paragraph pb-3 text-body">{children}</div> : null}
        <div className="flex flex-col gap-2">
          {actions.map((action) =>
            action.href ? (
              <Button key={action.label} href={withReportSource(action.href, source)} icon={action.icon} fullWidth>
                {action.label}
              </Button>
            ) : (
              <Button
                key={action.label}
                onClick={() => {
                  setOpen(false);
                  action.onClick?.();
                }}
                icon={action.icon}
                fullWidth
              >
                {action.label}
              </Button>
            ),
          )}
        </div>
      </Sheet>
    </>
  );
}
