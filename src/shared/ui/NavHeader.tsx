import type { ReactNode } from "react";
import { Container } from "./Container";
import { HistoryBackButton } from "./HistoryBackButton";
import { PageActionsMenu } from "./PageActionsMenu";
import { withReportRows, type PageAction } from "./reportRows";
import { ShareButton } from "./ShareButton";

interface NavHeaderMenu {
  /** Accessible name of the ⋮ button and its sheet (default "Page actions"). */
  label?: string;
  /** The page's own rows, in the page's order; Send feedback and Report issue are added when missing. */
  actions?: PageAction[];
  /** Lead text above the rows (an article's last update, an entry's sentence). */
  note?: ReactNode;
  /** The page Send feedback / Report issue report from (default: the current page). */
  source?: string;
}

interface NavHeaderProps {
  title: string;
  /** Home: the centred wordmark instead of a back control and an <h1> title (the tagline is Home's <h1>). */
  brand?: { name: string; eyebrow: string };
  /** Back destination when there's no real in-app history to return to (see HistoryBackButton). Omit for pages without a back control (Home, success/error states). */
  backHref?: string;
  /** The ⋮ menu's content. Every header has the menu, with at least Send feedback and Report issue. */
  menu?: NavHeaderMenu;
  /** Overrides the shared URL (default: the current page). */
  shareUrl?: string;
}

export const DEFAULT_MENU_LABEL = "Page actions";

/**
 * The one public header (client review 2026-10-21): back and title on the
 * left, exactly two icons on the right — Share, then the ⋮ menu. Nothing
 * else goes in the header (no theme toggle, currency or chart link: those
 * live in the menu or the page). Sticky at the top on the page background,
 * so content scrolls under it.
 *
 * 40px top row, no border (figma.pdf p15/p19/p31). Icon controls are 32×40
 * boxes around 16px glyphs (see IconButton): the back box is pulled into the
 * gutter so its glyph sits at 8–24 and the title at 32; the two action
 * boxes are pulled into the right gutter and overlap by 8px so their glyphs
 * sit 24px apart, ending 8px from the edge. The row is a minimum height: a
 * long title wraps instead of being clipped.
 */
export function NavHeader({ title, brand, backHref, menu = {}, shareUrl }: NavHeaderProps) {
  return (
    <header data-nav-header className="sticky top-0 z-30 bg-surface-base">
      <Container className="relative flex min-h-10 items-center">
        {brand ? (
          // figma.pdf p1: 14px bold brand, 12px muted eyebrow, one shared baseline, centred.
          <p className="mx-auto flex items-baseline gap-1 py-1">
            <span className="text-body font-bold text-text-primary">{brand.name}</span>
            <span className="text-meta text-text-muted">{brand.eyebrow}</span>
          </p>
        ) : (
          <>
            {backHref ? <HistoryBackButton fallbackHref={backHref} className="-ml-gutter" /> : null}
            <h1 className="min-w-0 py-1 break-words text-body font-bold text-text-primary">{title}</h1>
          </>
        )}
        <div
          data-header-actions
          className={`flex shrink-0 items-center [&>:is(a,button)~:is(a,button)]:-ml-2 ${
            brand ? "absolute top-1/2 right-0 -translate-y-1/2" : "-mr-gutter ml-auto"
          }`}
        >
          <ShareButton url={shareUrl} title={brand ? brand.name : title} />
          <PageActionsMenu label={menu.label ?? DEFAULT_MENU_LABEL} actions={withReportRows(menu.actions ?? [])} source={menu.source}>
            {menu.note}
          </PageActionsMenu>
        </div>
      </Container>
    </header>
  );
}
