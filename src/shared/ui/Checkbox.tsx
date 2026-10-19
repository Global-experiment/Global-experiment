"use client";

import { Icon } from "./icons";

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  /** Shown but not changeable (e.g. the last type left checked in a filter). */
  disabled?: boolean;
  /** Row padding/borders come from the list it sits in. */
  className?: string;
}

/**
 * A real `<input type="checkbox">` (native semantics, keyboard and form
 * behavior) visually replaced by the Material Sharp `check_box` /
 * `check_box_outline_blank` glyphs (client feedback item 8) instead of the
 * browser's own checkbox rendering. The glyph is 24px (client feedback
 * 2026-10-19; every other icon stays 16px), centred on the 20px first text
 * line so rows keep their height.
 */
export function Checkbox({ checked, onChange, label, description, disabled = false, className = "py-2.5" }: CheckboxProps) {
  return (
    <label className={`flex items-start gap-1 ${disabled ? "cursor-default" : "cursor-pointer"} ${className}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
      <Icon
        name={checked ? "check_box" : "check_box_outline_blank"}
        size={24}
        // figma.pdf p23: unchecked boxes are drawn in the line color, checked ones in white.
        className={`-my-0.5 shrink-0 ${checked ? "text-text-primary" : "text-line"} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text-primary`}
      />
      <span>
        <span className="block text-body text-text-primary">{label}</span>
        {description ? <span className="mt-[0.3125rem] block text-meta text-text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
