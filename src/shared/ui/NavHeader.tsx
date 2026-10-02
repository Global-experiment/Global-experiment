import type { ReactNode } from "react";
import { Container } from "./Container";
import { HistoryBackButton } from "./HistoryBackButton";

interface NavHeaderProps {
  title: string;
  /** Back destination when there's no real in-app history to return to (see HistoryBackButton). Omit for pages without a back control (Home, success/error states). */
  backHref?: string;
  /** Right-aligned icon controls (share, overflow menu). */
  actions?: ReactNode;
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
 */
export function NavHeader({ title, backHref, actions }: NavHeaderProps) {
  return (
    <header>
      <Container className="flex min-h-10 items-center">
        {backHref ? <HistoryBackButton fallbackHref={backHref} className="-ml-gutter" /> : null}
        <h1 className="min-w-0 py-1 break-words text-body font-bold text-text-primary">{title}</h1>
        {actions ? (
          /* Only icon controls overlap; the <dialog> a menu renders beside its trigger keeps its own margins. */
          <div className="-mr-gutter ml-auto flex shrink-0 items-center [&>:is(a,button)~:is(a,button)]:-ml-2">
            {actions}
          </div>
        ) : null}
      </Container>
    </header>
  );
}
