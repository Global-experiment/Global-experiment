"use client";

import { Icon } from "./icons";

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  /** Row padding/borders come from the list it sits in. */
  className?: string;
}

/**
 * A real `<input type="checkbox">` (native semantics, keyboard and form
 * behavior) visually replaced by the Material Sharp `check_box` /
 * `check_box_outline_blank` glyphs (client feedback item 8) instead of the
 * browser's own checkbox rendering.
 */
export function Checkbox({ checked, onChange, label, description, className = "py-2.5" }: CheckboxProps) {
  return (
    <label className={`flex cursor-pointer items-start gap-1 ${className}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <Icon
        name={checked ? "check_box" : "check_box_outline_blank"}
        // figma.pdf p23: unchecked boxes are drawn in the line color, checked ones in white.
        className={`mt-px shrink-0 ${checked ? "text-text-primary" : "text-line"} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text-primary`}
      />
      <span>
        <span className="block text-body text-text-primary">{label}</span>
        {description ? <span className="mt-[0.3125rem] block text-meta text-text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
