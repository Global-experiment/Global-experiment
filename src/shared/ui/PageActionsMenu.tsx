"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Sheet } from "./Sheet";
import { Icon, type IconName } from "./icons";

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
}

/**
 * The `more_vert` overflow control from the Figma headers. Opens the shared
 * Sheet with one 40px action row per entry (p3, p12, p16) — no visible
 * title, matching Figma.
 */
export function PageActionsMenu({ label, actions, children }: PageActionsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton onClick={() => setOpen(true)} label={label} icon="more_vert" />
      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel={label}>
        {children ? <div className="pb-4 text-body">{children}</div> : null}
        <div className="flex flex-col gap-2">
          {actions.map((action) =>
            action.href ? (
              <Button key={action.label} href={action.href} icon={<Icon name={action.icon} />} fullWidth>
                {action.label}
              </Button>
            ) : (
              <Button
                key={action.label}
                onClick={() => {
                  setOpen(false);
                  action.onClick?.();
                }}
                icon={<Icon name={action.icon} />}
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
