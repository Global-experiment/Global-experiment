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
  href: string;
  disabled?: false;
}

interface ButtonDisabled extends ButtonBaseProps {
  href?: string;
  /** Rendered as an inert, non-focusable control — used for routes not yet built in this milestone. */
  disabled: true;
}

type ButtonProps = ButtonAsLink | ButtonDisabled;

const baseClasses =
  "inline-flex items-center gap-2 rounded-control border px-4 py-3 text-sm font-semibold transition-colors";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-white text-black hover:bg-white/90",
  secondary: "border-border-subtle bg-transparent text-text-primary hover:bg-white/5",
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

  return (
    <Link href={props.href} className={classes}>
      {icon}
      {children}
    </Link>
  );
}
