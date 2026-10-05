"use client";

import { useState } from "react";
import type { ReportKind } from "@/shared/navigation/sourcePage";
import { Button } from "@/shared/ui/Button";
import { Checkbox } from "@/shared/ui/Checkbox";
import { Sheet, SHEET_BLEED } from "@/shared/ui/Sheet";
import { REPORT_KINDS } from "./reportKinds";

/**
 * The Feedback/Issue type picker (figma.pdf p23/p27): optional multi-select
 * qualification, then the CTA. Used by the launcher over the visitor's
 * current page, and by the composer only when it's reached directly
 * without a qualification (typed URL, new tab, no JavaScript yet).
 *
 * Remount it (React `key`) per opening so each opening starts from
 * `initialTypes`.
 */
export function ReportQualificationSheet({
  kind,
  open,
  initialTypes = [],
  onClose,
  onConfirm,
}: {
  kind: ReportKind;
  open: boolean;
  initialTypes?: readonly string[];
  onClose: () => void;
  onConfirm: (types: string[]) => void;
}) {
  const config = REPORT_KINDS[kind];
  const [selected, setSelected] = useState(() => new Set(initialTypes));

  function toggle(label: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={config.sheetTitle} headerVariant="picker">
      {/*
        figma.pdf p23/p27: 54px rows (8px top, label, 5px, description,
        8px bottom, then a full-width 1px rule under every row, the last
        one included); the list tucks 3px up under the title row; the CTA
        sits 8px under the last rule. Rows bleed exactly to the sheet's
        edges (SHEET_BLEED) — never past them.
      */}
      <fieldset className="-mt-[0.1875rem]">
        <legend className="sr-only">{config.sheetTitle}</legend>
        {config.types.map((type) => (
          <Checkbox
            key={type.label}
            checked={selected.has(type.label)}
            onChange={() => toggle(type.label)}
            label={type.label}
            description={type.description}
            className={`${SHEET_BLEED} border-b border-line pt-2 pb-2`}
          />
        ))}
      </fieldset>
      <Button
        variant="primary"
        fullWidth
        className="mt-2"
        onClick={() => onConfirm(config.types.map((type) => type.label).filter((label) => selected.has(label)))}
      >
        {config.ctaLabel}
      </Button>
    </Sheet>
  );
}
