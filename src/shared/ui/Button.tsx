import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "control" | "compact";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  /** control = 40px (action grid, CTAs, action rows); compact = 32px (inline actions under article text). */
  size?: ButtonSize;
  /**
   * Platform icon by name. Button picks the form (client rule): FILLED on a
   * primary CTA, OUTLINED everywhere else — pages never choose it.
   */
  icon?: IconName;
  /** Non-icon leading artwork (payment brand marks), rendered as given. */
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

interface ButtonAsLink extends ButtonBaseProps {
  /** Internal navigation — renders a real <Link>, never a disabled control. */
  href: string;
  onClick?: never;
  /**
   * Runs on click before navigation; calling `event.preventDefault()`
   * keeps the visitor on the page (e.g. report entry points open their
   * qualification sheet first, while staying a real link for new tabs).
   */
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: false;
}

interface ButtonAsAction extends ButtonBaseProps {
  /** A real, enabled action that isn't navigation (e.g. a not-yet-connected form submit). */
  href?: never;
  onClick: () => void;
  onNavigate?: never;
  disabled?: false;
}

interface ButtonDisabled extends ButtonBaseProps {
  href?: string;
  onClick?: never;
  onNavigate?: never;
  /** Inert control (e.g. submit before the form is fillable). Rendered as the gray CTA state from figma.pdf p19. Never use this for navigation. */
  disabled: true;
}

type ButtonProps = ButtonAsLink | ButtonAsAction | ButtonDisabled;

/*
 * Geometry: 40/32px height, 1px border, 4px radius, 14px bold label, 8px
 * padding on both sides (client feedback item 4) regardless of whether an
 * icon is present — a 16px icon then an 8px gap, so the label starts 32px
 * in (figma.pdf p1/p4: label x=40 in a button at x=8). Heights are minimums
 * with matching vertical padding: one line renders at exactly 40/32px, and
 * a label that wraps (narrow screen, enlarged text) grows the button
 * instead of overflowing it.
 *
 * Hover changes the outline stroke only, never the background (client
 * feedback item 5): secondary/outlined buttons move to the `content-50`
 * token; the primary filled CTA has no distinct hover of its own since its
 * border already matches its fill and Figma shows no separate hover state
 * for it (a static export can't capture hover) — only its focus ring.
 */
// Figma's 8px padding is measured from the button's outer edge (its 1px
// stroke sits inside the frame); CSS padding starts inside the border, so
// it's 8px minus the border to land the icon/label at the same x.
const baseClasses =
  "inline-flex items-center rounded-control border px-[calc(var(--spacing-gutter)-1px)] text-left text-body font-bold transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

const sizeClasses: Record<ButtonSize, string> = {
  control: "min-h-10 py-2.5",
  compact: "min-h-8 py-1.5",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-inverse-surface bg-inverse-surface text-inverse-content",
  secondary: "border-line bg-transparent text-text-primary hover:border-content-50",
};

export function Button(props: ButtonProps) {
  const { variant = "secondary", size = "control", children, className = "", fullWidth } = props;
  const icon = props.icon ? (
    <Icon name={props.icon} variant={variant === "primary" && !props.disabled ? "filled" : "outlined"} />
  ) : (
    props.leading
  );
  const classes = [
    baseClasses,
    sizeClasses[size],
    icon ? "gap-2" : "",
    fullWidth ? "w-full justify-start" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (props.disabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={`${classes} cursor-not-allowed border-text-muted bg-text-muted text-black`}
      >
        {icon}
        {children}
      </button>
    );
  }

  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={`${classes} ${variantClasses[variant]} cursor-pointer`}>
        {icon}
        {children}
      </button>
    );
  }

  return (
    <Link href={props.href} onClick={props.onNavigate} className={`${classes} ${variantClasses[variant]} cursor-pointer`}>
      {icon}
      {children}
    </Link>
  );
}
