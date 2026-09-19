/** 24px outlined chip, 12px label, 4px horizontal padding (figma.pdf p15 expertise tags). */
export function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-control border border-line px-1 text-meta text-text-primary">
      {children}
    </span>
  );
}
