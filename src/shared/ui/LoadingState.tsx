export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-4">
      <div className="flex max-w-sm flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            className="h-3 animate-pulse rounded-control bg-line motion-reduce:animate-none"
            style={{ width: `${80 - i * 15}%` }}
          />
        ))}
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
