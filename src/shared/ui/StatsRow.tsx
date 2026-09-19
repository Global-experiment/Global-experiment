/**
 * Four-up summary figures (figma.pdf p2/p9): 14px regular value over a
 * 12px muted label, centered in equal columns.
 */
export function StatsRow({ stats, className = "" }: { stats: ReadonlyArray<readonly [string, string]>; className?: string }) {
  return (
    <dl className={`grid grid-cols-4 gap-2 text-center ${className}`}>
      {stats.map(([value, label]) => (
        <div key={label}>
          <dd className="text-body text-text-primary">{value}</dd>
          <dt className="mt-1 text-meta text-text-muted">{label}</dt>
        </div>
      ))}
    </dl>
  );
}
