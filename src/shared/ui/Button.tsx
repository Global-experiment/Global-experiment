import Link from "next/link";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "control" | "compact";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  /** control = 40px (action grid, CTAs, action rows); compact = 32px (inline actions under article text). */
  size?: ButtonSize;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

interface ButtonAsLink extends ButtonBaseProps {
  /** Internal navigation — renders a real <Link>, never a disabled control. */
  href: string;
  onClick?: never;
  disabled?: false;
}

interface ButtonAsAction extends ButtonBaseProps {
  /** A real, enabled action that isn't navigation (e.g. a not-yet-connected form submit). */
  href?: never;
  onClick: () => void;
  disabled?: false;
}

interface ButtonDisabled extends ButtonBaseProps {
  href?: string;
  onClick?: never;
  /** Inert control (e.g. submit before the form is fillable). Rendered as the gray CTA state from figma.pdf p19. Never use this for navigation. */
  disabled: true;
}

type ButtonProps = ButtonAsLink | ButtonAsAction | ButtonDisabled;

/*
 * Geometry: 40/32px height, 1px border, 4px radius, 14px bold label, 8px
 * padding on both sides (client feedback item 4) regardless of whether an
 * icon is present — the icon sits inside that padding with a 4px gap to the
 * label, not additional outer padding.
 *
 * Hover changes the outline stroke only, never the background (client
 * feedback item 5): secondary/outlined buttons move to the `content-50`
 * token; the primary filled CTA has no distinct hover of its own since its
 * border already matches its fill and Figma shows no separate hover state
 * for it (a static export can't capture hover) — only its focus ring.
 */
const baseClasses =
  "inline-flex items-center rounded-control border px-2 text-body font-bold transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary";

const sizeClasses: Record<ButtonSize, string> = {
  control: "h-10",
  compact: "h-8",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-inverse-surface bg-inverse-surface text-inverse-content",
  secondary: "border-line bg-transparent text-text-primary hover:border-content-50",
};

export function Button(props: ButtonProps) {
  const { variant = "secondary", size = "control", icon, children, className = "", fullWidth } = props;
  const classes = [
    baseClasses,
    sizeClasses[size],
    icon ? "gap-1" : "",
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
    <Link href={props.href} className={`${classes} ${variantClasses[variant]} cursor-pointer`}>
      {icon}
      {children}
    </Link>
  );
}
