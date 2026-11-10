"use client";

import { useCallback, useState } from "react";

/**
 * When a form shows its field errors (OPS-70, every edit form):
 *
 * - a field is checked when it is left (blur), never while it is first typed in;
 * - once it shows an error, it is checked again as it changes, so the error goes as soon as it's fixed (the
 *   errors are worked out from the draft on every render; only *which* are shown is remembered here);
 * - on submit, every field is checked: all errors show, the focus moves to the first invalid field (in the
 *   form's order) and the caller sends nothing.
 *
 * The errors come from the form's own function over its draft, built on the shared rules
 * (src/shared/validation/fieldRules.ts; the API's copy refuses the same values). PropertyRow (or FieldError)
 * shows the message with role="alert", read out when it appears, and invalidProps links the field to it
 * (aria-invalid, aria-describedby).
 *
 * Called before a form's loading state returns (a hook), so the errors are passed to `shown` and `checkAll`.
 */
export function useFieldValidation<Field extends string>(order: readonly Field[], idOf: (field: Field) => string) {
  const [shownFor, setShownFor] = useState<ReadonlySet<Field>>(new Set());

  /** onBlur: from now on, this field's error (if any) is shown. */
  const leave = useCallback((field: Field) => setShownFor((previous) => (previous.has(field) ? previous : new Set(previous).add(field))), []);

  /** The errors to show now: only for fields that were left or submitted. */
  const shown = (errors: Partial<Record<Field, string>>): Partial<Record<Field, string>> => {
    const visible: Partial<Record<Field, string>> = {};
    for (const field of order) if (shownFor.has(field) && errors[field]) visible[field] = errors[field];
    return visible;
  };

  /** Before sending: true when everything is valid; otherwise shows every error and focuses the first invalid field. */
  const checkAll = (errors: Partial<Record<Field, string>>): boolean => {
    const invalid = order.filter((field) => errors[field]);
    if (invalid.length === 0) return true;
    setShownFor((previous) => new Set([...previous, ...invalid]));
    // After the render that marks it invalid, so a screen reader reads the field with its message.
    requestAnimationFrame(() => {
      const target = idOf(invalid[0]!);
      // An element id, or a selector for a control without one (a picker's search box).
      (document.getElementById(target) ?? document.querySelector<HTMLElement>(target))?.focus();
    });
    return false;
  };

  /** Discard, or a fresh record: nothing shown any more. */
  const reset = useCallback(() => setShownFor(new Set()), []);

  return { shown, leave, checkAll, reset };
}
