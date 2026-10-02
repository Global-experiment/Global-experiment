import Link from "next/link";
import { Icon, type IconName } from "./icons";

interface IconButtonBase {
  /** Accessible name — the icon itself is decorative. */
  label: string;
  icon: IconName;
  size?: 16 | 18 | 20 | 24;
  className?: string;
}

type IconButtonProps =
  | (IconButtonBase & { href: string; onClick?: never })
  | (IconButtonBase & { onClick: () => void; href?: never });

/*
 * 32×40 hit area around a 16px glyph (above the WCAG 2.2 AA 24×24 target
 * minimum). Width is 32, not 40, because figma.pdf puts adjacent header
 * glyphs 24px apart and the outermost ones 8px from the screen edge: a 32px
 * box pulled into the 8px gutter lands its glyph exactly on the design
 * (back arrow 8–24 with the title at 32; overflow glyph ending at 404 on a
 * 412 frame) without the hit area extending past the viewport.
 *
 * These have no border at rest (bare glyph buttons, per Figma), so a hover
 * stroke is drawn with a non-layout-affecting ring instead of a border —
 * background never changes on hover (client feedback item 5).
 */
export const iconButtonClasses =
  "inline-flex h-10 w-8 shrink-0 items-center justify-center rounded-control text-text-primary " +
  "hover:ring-1 hover:ring-content-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

export function IconButton({ label, icon, size = 16, className = "", ...props }: IconButtonProps) {
  const icon_ = <Icon name={icon} size={size} />;
  if ("href" in props && props.href) {
    return (
      <Link href={props.href} aria-label={label} className={`${iconButtonClasses} ${className}`}>
        {icon_}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} aria-label={label} className={`${iconButtonClasses} ${className}`}>
      {icon_}
    </button>
  );
}
