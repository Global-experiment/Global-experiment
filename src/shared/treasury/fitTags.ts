/**
 * How many leading tags fit in `available` px (client: show as many tags as
 * actually fit, "+N" only for the ones genuinely hidden). When not all fit,
 * room is kept for the "+N" badge after the visible ones. Pure, so the
 * measuring component (TransactionTags) only has to supply widths.
 *
 * `badgeWidth(n)` is the rendered width of the "+n" badge; `gap` is the
 * flex gap between chips. Sub-pixel layout is tolerated by half a pixel.
 */
export function fitTagCount(
  available: number,
  tagWidths: readonly number[],
  gap: number,
  badgeWidth: (hidden: number) => number,
): number {
  const total = tagWidths.length;
  if (total === 0) return 0;
  const slack = available + 0.5;

  const widthOf = (count: number) =>
    tagWidths.slice(0, count).reduce((sum, width) => sum + width, 0) + gap * Math.max(0, count - 1);

  if (widthOf(total) <= slack) return total;
  for (let count = total - 1; count > 0; count--) {
    if (widthOf(count) + gap + badgeWidth(total - count) <= slack) return count;
  }
  return 0;
}
