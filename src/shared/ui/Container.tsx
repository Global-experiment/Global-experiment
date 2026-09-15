import type { ReactNode } from "react";

/**
 * Constrains content to a centered max-width column above mobile widths —
 * matches the desktop pattern observed in the Figma audit (same content,
 * more breathing room, no distinct desktop layout invented).
 */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-2xl px-6 ${className}`}>{children}</div>;
}
