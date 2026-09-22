import Link from "next/link";
import { Icon, type IconName } from "./icons";

interface IconButtonBase {
  /** Accessible name — the icon itself is decorative. */
  label: string;
  icon: IconName;
  size?: 18 | 20 | 24;
  className?: string;
}

type IconButtonProps =
  | (IconButtonBase & { href: string; onClick?: never })
  | (IconButtonBase & { onClick: () => void; href?: never });

/*
 * 40×40 hit area (WCAG 2.2 target size) around a 20px glyph. The visual
 * glyph, not the hit area, is what aligns to the layout: callers pull the
 * box back with negative margins so the glyph sits on the 8px gutter
 * exactly as in the Figma frames.
 *
 * These have no border at rest (bare glyph buttons, per Figma), so a hover
 * stroke is drawn with a non-layout-affecting ring instead of a border —
 * background never changes on hover (client feedback item 5).
 */
const classes =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-control text-text-primary " +
  "hover:ring-1 hover:ring-content-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

export function IconButton({ label, icon, size = 20, className = "", ...props }: IconButtonProps) {
  const icon_ = <Icon name={icon} size={size} />;
  if ("href" in props && props.href) {
    return (
      <Link href={props.href} aria-label={label} className={`${classes} ${className}`}>
        {icon_}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} aria-label={label} className={`${classes} ${className}`}>
      {icon_}
    </button>
  );
}
