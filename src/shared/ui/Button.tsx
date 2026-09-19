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
 * Geometry measured from figma.pdf: 1px border, 4px radius, 14px bold label.
 * With an icon the label starts 32px in (10px padding + 18px glyph + 4px
 * gap); without one it starts 8px in. Labels are left-aligned in
 * full-width rows, exactly as in the action grid and sheets.
 */
const baseClasses =
  "inline-flex items-center rounded-control border pr-2 text-body font-bold transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const sizeClasses: Record<ButtonSize, string> = {
  control: "h-10",
  compact: "h-8",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-white bg-white text-black hover:bg-white/90 active:bg-white/80",
  secondary: "border-line bg-transparent text-text-primary hover:bg-white/5 active:bg-white/10",
};

export function Button(props: ButtonProps) {
  const { variant = "secondary", size = "control", icon, children, className = "", fullWidth } = props;
  const classes = [
    baseClasses,
    sizeClasses[size],
    icon ? "gap-1 pl-2.5" : "pl-2",
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
