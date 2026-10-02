"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Tag } from "@/shared/ui/Tag";
import { fitTagCount } from "./fitTags";

const GAP_PX = 8; // gap-2

/**
 * The tags of one Treasury history row: as many as actually fit between
 * the label and the date, then "+N" for the genuinely hidden rest (client
 * feedback — no fixed two-tag cap). An invisible copy of every tag and
 * every possible badge is measured, and a ResizeObserver recomputes the fit
 * whenever the available width (or the font) changes.
 *
 * Before hydration the same box falls back to CSS alone: chips wrap onto a
 * clipped second line, so only whole tags ever show and nothing overflows.
 */
export function TransactionTags({ tags }: { tags: string[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<number | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;

    const update = () => {
      const tagWidths = [...measure.querySelectorAll<HTMLElement>("[data-measure=tag]")].map(
        (node) => node.getBoundingClientRect().width,
      );
      const badgeWidths = [...measure.querySelectorAll<HTMLElement>("[data-measure=badge]")].map(
        (node) => node.getBoundingClientRect().width,
      );
      const available = box.getBoundingClientRect().width;
      setVisible(fitTagCount(available, tagWidths, GAP_PX, (hidden) => badgeWidths[hidden - 1] ?? 0));
    };

    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [tags]);

  const measured = visible !== null;
  const shown = measured ? tags.slice(0, visible) : tags;
  const hidden = tags.length - shown.length;

  return (
    <div
      ref={boxRef}
      className={`relative flex min-w-0 flex-1 gap-2 overflow-hidden whitespace-nowrap ${measured ? "" : "h-6 flex-wrap"}`}
    >
      {shown.map((tag) => (
        <Tag key={tag}>{tag}</Tag>
      ))}
      {hidden > 0 ? (
        <Tag>
          <span aria-hidden>{`+${hidden}`}</span>
          <span className="sr-only">{`${hidden} more ${hidden === 1 ? "tag" : "tags"}`}</span>
        </Tag>
      ) : null}

      <div ref={measureRef} aria-hidden className="invisible absolute top-0 left-0 flex w-max gap-2">
        {tags.map((tag) => (
          <span key={tag} data-measure="tag" className="inline-flex">
            <Tag>{tag}</Tag>
          </span>
        ))}
        {tags.map((_, index) => (
          <span key={index} data-measure="badge" className="inline-flex">
            <Tag>{`+${index + 1}`}</Tag>
          </span>
        ))}
      </div>
    </div>
  );
}
