"use client";

import { useState, type ReactNode } from "react";
import { useCurrentSourcePage } from "@/shared/navigation/useCurrentSourcePage";
import { reportKindForHref } from "@/shared/report/reportKinds";
import { ReportLaunchButton } from "@/shared/report/ReportLauncher";
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
 * title, matching Figma. "/feedback" and "/issue" rows close this menu and
 * open the report's qualification sheet over the same page (Review #3
 * item 5), carrying this page as the report's source.
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
          {actions.map((action) => {
            const reportKind = action.href ? reportKindForHref(action.href) : undefined;
            return reportKind ? (
              <ReportLaunchButton
                key={action.label}
                kind={reportKind}
                source={source}
                icon={action.icon}
                fullWidth
                onLaunch={() => setOpen(false)}
              >
                {action.label}
              </ReportLaunchButton>
            ) : action.href ? (
              <Button key={action.label} href={action.href} icon={action.icon} fullWidth>
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
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
