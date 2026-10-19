import type { ReactNode } from "react";
import { Container } from "./Container";
import { HistoryBackButton } from "./HistoryBackButton";
import { ShareButton } from "./ShareButton";

interface NavHeaderProps {
  title: string;
  /** Back destination when there's no real in-app history to return to (see HistoryBackButton). Omit for pages without a back control (Home, success/error states). */
  backHref?: string;
  /** Right-aligned icon controls after the share button (currency, overflow menu). */
  actions?: ReactNode;
  /** The share button, on every header by default (client feedback 2026-10-19); false only where the page has nothing to share (an error state). */
  share?: boolean;
  /** Overrides the shared URL (default: the current page). */
  shareUrl?: string;
}

/**
 * 40px top row, no border (figma.pdf p15/p19/p31: the app area starts at
 * y=104 under the browser chrome and every header glyph/title is centered
 * 20px below that; the rule visible above belongs to the browser chrome).
 * Each page sets its own gap under the header, as Figma does.
 *
 * Icon controls are 32×40 boxes around 16px glyphs (see IconButton): the
 * back box is pulled into the 8px gutter so its glyph sits at 8–24 and the
 * title at 32; the action boxes are pulled into the right gutter and overlap
 * by 8px so their glyphs sit 24px apart, ending 8px from the edge — all as
 * measured on figma.pdf p15. The row is a minimum height: a long article
 * title wraps onto a second line instead of being clipped.
 *
 * Sticky at the top of the page (client feedback 2026-10-19), on the page
 * background so content scrolls under it; every header carries the share
 * button first, then the page's own actions.
 */
export function NavHeader({ title, backHref, actions, share = true, shareUrl }: NavHeaderProps) {
  return (
    <header data-nav-header className="sticky top-0 z-30 bg-surface-base">
      <Container className="flex min-h-10 items-center">
        {backHref ? <HistoryBackButton fallbackHref={backHref} className="-ml-gutter" /> : null}
        <h1 className="min-w-0 py-1 break-words text-body font-bold text-text-primary">{title}</h1>
        {actions || share ? (
          /* Only icon controls overlap; the <dialog> a menu renders beside its trigger keeps its own margins. */
          <div className="-mr-gutter ml-auto flex shrink-0 items-center [&>:is(a,button)~:is(a,button)]:-ml-2">
            {share ? <ShareButton url={shareUrl} title={title} /> : null}
            {actions}
          </div>
        ) : null}
      </Container>
    </header>
  );
}
