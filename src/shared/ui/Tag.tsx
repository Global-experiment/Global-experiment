/**
 * 24px outlined chip, 12px label, 4px horizontal padding measured from the
 * outer edge like Figma's inside stroke (figma.pdf p15 expertise tags) —
 * hence 4px minus the 1px border. Minimum height, so enlarged text grows the
 * chip instead of overflowing it.
 */
export function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-control border border-line px-[calc(0.25rem-1px)] text-meta text-text-primary">
      {children}
    </span>
  );
}
