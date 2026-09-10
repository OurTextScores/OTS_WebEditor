import type { Score, StaffSystemBand } from '@/lib/webmscore-loader';

/**
 * Where a part sits vertically inside a system.
 *
 * `measurePositions()` reports one box per measure spanning the whole system with no
 * staff dimension, so highlight code used to locate part N by slicing that box into
 * `partCount` equal bands. Staves are not evenly spaced -- on the reported review the head
 * score's staff 2->3 gap measures 307 units against 265 for staff 1->2, because dynamics
 * and text stretch one staff and not its neighbour -- so the slice lands off the staff.
 * Two compare panes hold different scores and stretch differently, so no single split can
 * serve both: the geometry has to come from each score separately.
 *
 * The engine now answers this directly via the `staffSystemBands` export. Horizontal
 * extent still comes from the measure box, which was already correct per pane; only the
 * vertical placement was wrong.
 */

export type StaffBands = {
  /** Empty when the engine build predates the export, which forces the even-split fallback. */
  bands: StaffSystemBand[];
};

export const EMPTY_STAFF_BANDS: StaffBands = { bands: [] };

export async function loadStaffBands(score: Score | null): Promise<StaffBands> {
  if (!score || typeof score.staffSystemBands !== 'function') {
    return EMPTY_STAFF_BANDS;
  }
  try {
    const bands = await score.staffSystemBands();
    return { bands: Array.isArray(bands) ? bands : [] };
  } catch {
    return EMPTY_STAFF_BANDS;
  }
}

/**
 * The band for `partIndex` in whichever system contains this measure.
 *
 * A measure box spans its whole system, so the right band is the one for this part that
 * overlaps it most -- matching on containment alone would be ambiguous where systems are
 * tightly packed. Both sides are page-local coordinates: callers apply the page offset and
 * zoom afterwards, exactly as they do for the measure box itself.
 */
export function resolvePartBand(
  staffBands: StaffBands,
  page: number,
  measureTop: number,
  measureHeight: number,
  partIndex: number,
): StaffSystemBand | undefined {
  if (!staffBands.bands.length) {
    return undefined;
  }
  const measureBottom = measureTop + measureHeight;
  let best: StaffSystemBand | undefined;
  let bestOverlap = 0;

  for (const band of staffBands.bands) {
    if (band.page !== page || band.partIndex !== partIndex) {
      continue;
    }
    const overlap = Math.min(measureBottom, band.y + band.height) - Math.max(measureTop, band.y);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = band;
    }
  }
  return best;
}
