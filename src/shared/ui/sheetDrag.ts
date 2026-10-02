/**
 * Drag-down-to-close rules for the mobile bottom sheet. Pure so the
 * thresholds are unit-tested; Sheet.tsx only feeds it pointer samples.
 */

/** Released past this share of the sheet's height (or DISTANCE_MAX_PX), it closes. */
export const DISTANCE_RATIO = 0.25;
export const DISTANCE_MAX_PX = 120;
/** A downward flick faster than this (px/ms) closes even when short… */
export const FLICK_VELOCITY = 0.5;
/** …as long as it moved at least this far (filters out taps/jitter). */
export const FLICK_MIN_PX = 16;

/** Downward offset to render for a raw pointer delta: never above the resting position. */
export function sheetDragOffset(deltaY: number): number {
  return Math.max(0, deltaY);
}

export function shouldDismissSheet({
  offset,
  velocity,
  height,
}: {
  /** Current downward offset in px (already clamped ≥ 0). */
  offset: number;
  /** Recent downward velocity in px/ms (negative = moving up). */
  velocity: number;
  /** Rendered sheet height in px. */
  height: number;
}): boolean {
  const distanceThreshold = Math.min(DISTANCE_MAX_PX, height * DISTANCE_RATIO);
  if (offset >= distanceThreshold) return true;
  return offset >= FLICK_MIN_PX && velocity >= FLICK_VELOCITY;
}

export interface DragSample {
  y: number;
  t: number;
}

/** Velocity (px/ms) over the samples from the last `windowMs`. */
export function recentVelocity(samples: readonly DragSample[], windowMs = 100): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}
