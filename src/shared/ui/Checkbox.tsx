"use client";

import { Icon } from "./icons";

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}

/**
 * A real `<input type="checkbox">` (native semantics, keyboard and form
 * behavior) visually replaced by the Material Sharp `check_box` /
 * `check_box_outline_blank` glyphs (client feedback item 8) instead of the
 * browser's own checkbox rendering.
 */
export function Checkbox({ checked, onChange, label, description }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-start gap-1 py-2.5">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <Icon
        name={checked ? "check_box" : "check_box_outline_blank"}
        size={20}
        className="mt-px shrink-0 text-text-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text-primary"
      />
      <span>
        <span className="block text-body text-text-primary">{label}</span>
        {description ? <span className="mt-1 block text-meta text-text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
