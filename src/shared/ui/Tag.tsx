export function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-control border border-border-subtle px-2.5 py-1 text-xs text-text-tertiary">
      {children}
    </span>
  );
}
