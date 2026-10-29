"use client";

import { useRef, useState } from "react";
import { AdminIcon } from "./adminIcons";
import { AdminButtonLink, focusRing, Popover } from "./controls";
import { useToast } from "./Toast";

const iconButton = `flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control text-text-primary ${focusRing}`;

/**
 * The header of a public page shown inside the admin (admin-desktop.pdf p6,
 * p8): the page title, then "Administrate" (the page's backend view), Share
 * and ⋮ — Administrate ends 8px before the share glyph, the glyphs are 24px
 * apart and ⋮ ends 8px from the edge. Sticky at the top of the content
 * column. Share copies the PUBLIC page's address (what visitors see); ⋮
 * opens the public page itself or the backend view.
 */
export function PublicPageHeader({ title, administrateHref, publicPath }: { title: string; administrateHref: string; publicPath: string }) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  async function share() {
    try {
      await navigator.clipboard.writeText(new URL(publicPath, window.location.origin).toString());
      toast("Link copied to clipboard");
    } catch {
      toast("Couldn't copy the link");
    }
  }

  return (
    <header data-public-view-header className="sticky top-0 z-20 flex h-10 items-center gap-2 bg-surface-base pr-1 pl-2">
      <h1 className="mr-auto min-w-0 truncate text-body font-bold">{title}</h1>
      {/* p6: a 12px bold label (93px wide button), smaller than the list headers' 14px actions. */}
      <AdminButtonLink href={administrateHref} className="text-meta!">
        Administrate
      </AdminButtonLink>
      <div className="relative -ml-1 flex items-center">
        <button type="button" onClick={() => void share()} aria-label="Share" title="Copy the public page's link" className={iconButton}>
          <AdminIcon name="share" />
        </button>
        <button
          ref={menuTrigger}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Page actions"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className={iconButton}
        >
          <AdminIcon name="more_vert" />
        </button>
        <Popover open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={menuTrigger} label="Page actions" className="top-[calc(100%+8px)] right-1 w-56 p-1">
          <a
            href={publicPath}
            target="_blank"
            rel="noopener"
            onClick={() => setMenuOpen(false)}
            className={`flex h-8 items-center gap-2 rounded-control px-2 hover:bg-surface-raised ${focusRing}`}
          >
            <AdminIcon name="arrow_outward" />
            Open the public page
          </a>
          <a href={administrateHref} className={`flex h-8 items-center gap-2 rounded-control px-2 hover:bg-surface-raised ${focusRing}`}>
            <AdminIcon name="settings" />
            Administrate
          </a>
        </Popover>
      </div>
    </header>
  );
}
