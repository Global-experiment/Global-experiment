import type { ReactNode } from "react";
import { Container } from "./Container";

export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border-faint bg-surface-base">
      <Container className="py-3">{children}</Container>
    </div>
  );
}
