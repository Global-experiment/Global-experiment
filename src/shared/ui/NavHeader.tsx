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
 * 44px top row, no border (figma.pdf p15/p31: the app header has no rule
 * under it — the line visible there belongs to the browser chrome).
 *
 * Icon controls are 40px hit areas around 20px glyphs; the boxes are pulled
 * out by the 8px gutter so the glyphs sit where the design puts them
 * without extending past the viewport.
 */
export function NavHeader({ title, backHref, actions }: NavHeaderProps) {
  return (
    <header>
      <Container className="flex h-11 items-center">
        {backHref ? <HistoryBackButton fallbackHref={backHref} className="-mx-gutter" /> : null}
        <h1 className="min-w-0 truncate text-body font-bold text-text-primary">{title}</h1>
        {actions ? (
          /* Only icon controls overlap; the <dialog> a menu renders beside its trigger keeps its own margins. */
          <div className="-mr-gutter ml-auto flex items-center [&>:is(a,button)~:is(a,button)]:-ml-3">
            {actions}
          </div>
        ) : null}
      </Container>
    </header>
  );
}
