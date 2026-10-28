/**
 * An admin's round picture (user card p2, Profile settings p18): the
 * uploaded image, else the grey disc. `version` makes a just-changed
 * picture load at once; the API serves it revalidated (no-cache) anyway.
 */
export function AccountAvatar({ id, hasPicture, size = 24, version }: { id: string; hasPicture: boolean; size?: number; version?: string | number }) {
  const box = { width: size, height: size };
  if (!hasPicture) return <span aria-hidden="true" style={box} className="shrink-0 rounded-full bg-avatar" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a same-origin API image behind the session cookie, not an optimisable asset
    <img
      src={`/api/admin/accounts/${id}/picture${version !== undefined ? `?v=${encodeURIComponent(String(version))}` : ""}`}
      alt=""
      width={size}
      height={size}
      style={box}
      className="shrink-0 rounded-full bg-avatar object-cover"
    />
  );
}
