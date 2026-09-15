import Link from "next/link";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

interface ButtonBaseProps {
  variant?: ButtonVariant;
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
  /** Rendered as an inert, non-focusable control. Never use this for navigation. */
  disabled: true;
}

type ButtonProps = ButtonAsLink | ButtonAsAction | ButtonDisabled;

const baseClasses =
  "inline-flex items-center gap-2 rounded-control border px-4 py-3 text-sm font-semibold transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-white text-black hover:bg-white/90 active:bg-white/80",
  secondary: "border-border-subtle bg-transparent text-text-primary hover:bg-white/5 active:bg-white/10",
};

export function Button(props: ButtonProps) {
  const { variant = "secondary", icon, children, className = "", fullWidth } = props;
  const classes = [
    baseClasses,
    variantClasses[variant],
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
        className={`${classes} cursor-not-allowed opacity-40`}
      >
        {icon}
        {children}
      </button>
    );
  }

  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={`${classes} cursor-pointer`}>
        {icon}
        {children}
      </button>
    );
  }

  return (
    <Link href={props.href} className={`${classes} cursor-pointer`}>
      {icon}
      {children}
    </Link>
  );
}
