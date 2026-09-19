import type { ReactNode } from "react";

/**
 * The single content column: full width minus an 8px gutter on mobile, a
 * centered 640px column on desktop (figma.pdf p1 vs p33 — identical layout,
 * only the width changes). Both values are theme tokens; no route defines
 * its own width.
 */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-page px-gutter ${className}`}>{children}</div>;
}
