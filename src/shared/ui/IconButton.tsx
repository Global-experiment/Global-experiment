import Link from "next/link";
import { Icon, type IconName } from "./icons";

interface IconButtonBase {
  /** Accessible name — the icon itself is decorative. */
  label: string;
  icon: IconName;
  className?: string;
}

type IconButtonProps =
  | (IconButtonBase & { href: string; onClick?: never })
  | (IconButtonBase & { onClick: () => void; href?: never });

/*
 * A 16px outlined glyph (the visible artwork) inside an invisible 32×40 hit
 * area (above the WCAG 2.2 AA 24×24 target minimum). Width is 32, not 40,
 * because figma.pdf puts adjacent header glyphs 24px apart and the outermost
 * ones 8px from the screen edge: a 32px box pulled into the 8px gutter lands
 * its glyph exactly on the design without the hit area extending past the
 * viewport.
 *
 * No hover visuals at all (client: "No hover state on icon buttons") — only
 * the pointer cursor, plus the keyboard focus-visible outline, which is an
 * accessibility indicator, not a hover state.
 */
export const iconButtonClasses =
  "inline-flex h-10 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-text-primary " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

export function IconButton({ label, icon, className = "", ...props }: IconButtonProps) {
  const icon_ = <Icon name={icon} />;
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
