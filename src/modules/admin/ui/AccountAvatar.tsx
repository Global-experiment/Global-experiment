/**
 * The profile picture, wherever the admin shows one (client, 2026-11-25):
 * the account's photo, or, without one, a circle with the first letter of
 * the name, centred (Figma Design system, Desktop menu, "Collapsed
 * fallback"). CSS only, in theme colours. Decorative: the name is always
 * written beside it or given to the control around it.
 */
const SIZES = {
  16: "size-4 text-caption",
  24: "size-6 text-meta",
  32: "size-8 text-body",
} as const;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The first character as a reader sees it (an accented or composed letter stays whole), case kept; "" for an empty name. */
export function initialOf(name: string): string {
  const first = graphemes.segment(name.trim())[Symbol.iterator]().next();
  return first.done ? "" : first.value.segment;
}

/** An account's current photo. `version` makes a just-changed picture load at once; the API serves it revalidated (no-cache) anyway. */
export function accountPictureUrl(id: string, version?: string | number) {
  return `/api/admin/accounts/${id}/picture${version !== undefined ? `?v=${encodeURIComponent(String(version))}` : ""}`;
}

export function AccountAvatar({
  name,
  picture,
  size = 24,
  className = "",
}: {
  name: string;
  /** The photo's URL; null or absent: the initial. */
  picture?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const shape = ["shrink-0 rounded-full", SIZES[size], className].filter(Boolean).join(" ");
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a same-origin API image behind the session cookie, not an optimisable asset
      <img src={picture} alt="" width={size} height={size} className={`${shape} bg-avatar object-cover`} />
    );
  }
  return (
    // The letter is drawn by CSS from the attribute, so it never joins the text beside it (copying "Created by Ada" stays clean).
    <span
      aria-hidden="true"
      data-avatar-initial={initialOf(name)}
      className={`${shape} flex items-center justify-center leading-none text-text-primary inset-ring-1 inset-ring-line before:content-[attr(data-avatar-initial)]`}
    />
  );
}
