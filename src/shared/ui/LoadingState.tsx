export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="px-6 py-16 text-center">
      <div className="mx-auto flex max-w-sm flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            className="h-4 animate-pulse rounded-control bg-border-subtle motion-reduce:animate-none"
            style={{ width: `${80 - i * 15}%` }}
          />
        ))}
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
