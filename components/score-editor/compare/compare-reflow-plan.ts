import type { Positions } from '@/lib/webmscore-loader';

/**
 * Reconciles the two coordinate systems that meet in compare reflow.
 *
 * Compare carries two independent orientations and they are easy to confuse:
 *
 *   - **pane** — `left` / `right`, i.e. where something is on screen. Measure
 *     alignments are pane-oriented: they are computed from the pane-oriented
 *     `compareLeftXml` / `compareRightXml`.
 *   - **score identity** — `live` / `auxiliary`. Line breaks are score-oriented:
 *     they are read from, and written back to, specific `Score` instances.
 *
 * Which pane holds the live score depends on the compare mode, so the two are not
 * interchangeable. Combining them by position applies one pane's line-break plan to
 * the other pane's score whenever the live score maps to the right pane. This module
 * exists so that mapping is explicit and testable rather than implied by variable
 * names — two separate defects in this area came from a `left`-named value that
 * actually held live-keyed data.
 */
export type MeasureAlignmentRow = {
  leftIndex: number | null;
  rightIndex: number | null;
  match: boolean;
};

export type ReflowAlignment = {
  rows: MeasureAlignmentRow[];
  leftCount: number;
  rightCount: number;
};

export type ComparePane = 'left' | 'right';

export type CompareReflowPlanInput = {
  /** Existing line breaks read from the live score. */
  liveBreaks: boolean[];
  /** Existing line breaks read from the auxiliary score. */
  auxiliaryBreaks: boolean[];
  /** True when the live score is displayed in the left pane. */
  liveIsLeftPane: boolean;
  /** Pane-oriented alignments. */
  alignments: ReflowAlignment[];
  /** Pane-oriented mismatch break builder. */
  buildMismatchBreaks: (
    rows: MeasureAlignmentRow[],
    pane: ComparePane,
    measureCount: number,
  ) => boolean[];
};

export type CompareReflowPlan = {
  /** Line breaks to apply to the live score. */
  liveReflow: boolean[];
  /** Line breaks to apply to the auxiliary score. */
  auxiliaryReflow: boolean[];
};

/** Which system a measure landed in, by measure index. Undefined when not laid out. */
export type SystemOfMeasure = (measureIndex: number) => number | undefined;

/**
 * Measure indices to break at so both panes wrap at the same alignment rows.
 *
 * `LayoutMode::SYSTEM` honours explicit breaks but still wraps a system when it runs out of
 * width, and the two scores have different content widths — an overfull bar in one wraps
 * where the other does not — so the panes drift apart between block boundaries.
 *
 * Taking the union of both panes' natural wrap points converges in a single pass: every
 * resulting segment ends at the earlier of the two wraps, so it is no longer than a segment
 * that already fitted on either side, and a shorter system cannot overflow. That also makes
 * the result viewport-independent in the way a fixed bars-per-system rule is not — it is
 * derived from where the panes actually wrapped at the current width.
 */
export function buildResyncBreaks(
  rows: MeasureAlignmentRow[],
  leftSystemOf: SystemOfMeasure,
  rightSystemOf: SystemOfMeasure,
): { left: number[]; right: number[] } {
  const left: number[] = [];
  const right: number[] = [];

  const wrapsBetween = (systemOf: SystemOfMeasure, current: number | null, next: number | null) => {
    if (current === null || next === null) {
      return false;
    }
    const currentSystem = systemOf(current);
    const nextSystem = systemOf(next);
    if (currentSystem === undefined || nextSystem === undefined) {
      return false;
    }
    return currentSystem !== nextSystem;
  };

  for (let index = 0; index < rows.length - 1; index += 1) {
    const row = rows[index];
    const nextRow = rows[index + 1];
    const wraps =
      wrapsBetween(leftSystemOf, row.leftIndex, nextRow.leftIndex) ||
      wrapsBetween(rightSystemOf, row.rightIndex, nextRow.rightIndex);
    if (!wraps) {
      continue;
    }
    // Break on both panes at this row, so the next row starts a system in each.
    if (row.leftIndex !== null) {
      left.push(row.leftIndex);
    }
    if (row.rightIndex !== null) {
      right.push(row.rightIndex);
    }
  }

  return { left, right };
}

/** Vertical padding to add below a measure, in spatium. */
export type MeasureGap = { measureIndex: number; gap: number };

/** Height of a system, in the same units the caller measured positions in. */
export type SystemHeight = (system: number) => number | undefined;

export type CompareSystemGeometry = {
  systemOf: SystemOfMeasure;
  systemHeight: SystemHeight;
};

/** Layout geometry from one settled `measurePositions()` snapshot. */
export function buildCompareSystemGeometry(positions: Positions): CompareSystemGeometry {
  const systemByMeasure = new Map<number, number>();
  const systemByPosition = new Map<string, number>();
  const heightBySystem = new Map<number, number>();
  const topBySystem = new Map<number, { page: number; y: number }>();

  positions.elements.forEach((element, measureIndex) => {
    const key = `${element.page}:${Math.round(element.y)}`;
    let system = systemByPosition.get(key);
    if (system === undefined) {
      system = systemByPosition.size;
      systemByPosition.set(key, system);
      topBySystem.set(system, { page: element.page, y: element.y });
    }
    systemByMeasure.set(measureIndex, system);
    const height = typeof element.sy === 'number' ? element.sy : (element.height ?? 0);
    if (height > 0) {
      heightBySystem.set(system, Math.max(heightBySystem.get(system) ?? 0, height));
    }
  });

  // A measure box describes the system's ink, not the vertical slot the next system
  // occupies. Prefer the distance between consecutive system tops so the spacer also
  // accounts for normal inter-system leading; retain ink height for the last system on
  // a page, where no following top can provide that measurement.
  for (let system = 0; system < systemByPosition.size - 1; system += 1) {
    const current = topBySystem.get(system);
    const next = topBySystem.get(system + 1);
    if (current && next && current.page === next.page && next.y > current.y) {
      heightBySystem.set(system, next.y - current.y);
    }
  }

  return {
    systemOf: (measureIndex) => systemByMeasure.get(measureIndex),
    systemHeight: (system) => heightBySystem.get(system),
  };
}

/** Remaining vertical offset between paired rows downstream of a structural gap. */
export function measureStructuralGapResidual(
  alignments: Array<{ rows: MeasureAlignmentRow[] }>,
  leftPositions: Positions,
  rightPositions: Positions,
): { left: number; right: number } {
  let left = 0;
  let right = 0;
  const documentY = (positions: Positions, measureIndex: number) => {
    const element = positions.elements[measureIndex];
    if (!element) {
      return undefined;
    }
    return element.y + element.page * (positions.pageSize?.height ?? 0);
  };

  alignments.forEach((alignment) => {
    let structuralGapSeen = false;
    alignment.rows.forEach((row) => {
      if (row.leftIndex === null || row.rightIndex === null) {
        structuralGapSeen = true;
        return;
      }
      if (!structuralGapSeen) {
        return;
      }
      const leftY = documentY(leftPositions, row.leftIndex);
      const rightY = documentY(rightPositions, row.rightIndex);
      if (leftY === undefined || rightY === undefined) {
        return;
      }
      const delta = rightY - leftY;
      left = Math.max(left, delta);
      right = Math.max(right, -delta);
    });
  });

  return { left, right };
}

/**
 * Combine identical gap anchors reported by multiple parts.
 *
 * Every part carries the same temporal insertion/deletion rows, so adding their plans
 * would multiply a vertical deficit by the part count. A score needs one spacer at an
 * anchor: retain the largest requirement any part measured there.
 */
export function mergeAlignmentGaps(plans: MeasureGap[][]): MeasureGap[] {
  const byMeasure = new Map<number, number>();
  plans.flat().forEach(({ measureIndex, gap }) => {
    if (gap > 0) {
      byMeasure.set(measureIndex, Math.max(byMeasure.get(measureIndex) ?? 0, gap));
    }
  });
  return [...byMeasure.entries()]
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
    .map(([measureIndex, gap]) => ({ measureIndex, gap }));
}

/**
 * Vertical gaps that let the panes stay level across an insertion or deletion.
 *
 * `buildResyncBreaks` can only mirror a wrap onto a row both panes have. Where one side
 * has a bar the other does not, the row carries a null, the extra bar can push that side
 * onto another system, and no arrangement of line breaks brings them back level — a break
 * moves a bar to another system but cannot leave a hole. Measured on the two-staff fixture:
 * 4 bars laid out as 2 systems against 5 bars as 3, never converging.
 *
 * So wherever one side consumes a system the other does not, the side left behind is padded
 * by that system's height. Gaps are attached to the last measure that side actually has, as
 * that is the only anchor available — the missing bar has no measure to hang anything on.
 */
export function buildAlignmentGaps(
  rows: MeasureAlignmentRow[],
  leftSystemOf: SystemOfMeasure,
  rightSystemOf: SystemOfMeasure,
  leftSystemHeight: SystemHeight,
  rightSystemHeight: SystemHeight,
): { left: MeasureGap[]; right: MeasureGap[] } {
  const left = new Map<number, number>();
  const right = new Map<number, number>();

  const seenLeft = new Set<number>();
  const seenRight = new Set<number>();
  let lastLeftMeasure: number | null = null;
  let lastRightMeasure: number | null = null;

  for (const row of rows) {
    const leftSystem = row.leftIndex !== null ? leftSystemOf(row.leftIndex) : undefined;
    const rightSystem = row.rightIndex !== null ? rightSystemOf(row.rightIndex) : undefined;

    const leftGained = leftSystem !== undefined && !seenLeft.has(leftSystem);
    const rightGained = rightSystem !== undefined && !seenRight.has(rightSystem);

    if (leftGained) {
      seenLeft.add(leftSystem!);
    }
    if (rightGained) {
      seenRight.add(rightSystem!);
    }

    // Only a structural gap can require padding. Different wrap points with measures
    // on both sides are transient until buildResyncBreaks settles and must never add a
    // spacer of their own.
    if (row.leftIndex === null && rightGained && lastLeftMeasure !== null) {
      const height = rightSystemHeight(rightSystem!);
      if (height && height > 0) {
        left.set(lastLeftMeasure, (left.get(lastLeftMeasure) ?? 0) + height);
      }
    }
    if (row.rightIndex === null && leftGained && lastRightMeasure !== null) {
      const height = leftSystemHeight(leftSystem!);
      if (height && height > 0) {
        right.set(lastRightMeasure, (right.get(lastRightMeasure) ?? 0) + height);
      }
    }

    if (row.leftIndex !== null) {
      lastLeftMeasure = row.leftIndex;
    }
    if (row.rightIndex !== null) {
      lastRightMeasure = row.rightIndex;
    }
  }

  const toGaps = (gaps: Map<number, number>) =>
    [...gaps.entries()].map(([measureIndex, gap]) => ({ measureIndex, gap }));
  return { left: toGaps(left), right: toGaps(right) };
}

export function buildCompareReflowPlan({
  liveBreaks,
  auxiliaryBreaks,
  liveIsLeftPane,
  alignments,
  buildMismatchBreaks,
}: CompareReflowPlanInput): CompareReflowPlan {
  const livePane: ComparePane = liveIsLeftPane ? 'left' : 'right';
  const auxiliaryPane: ComparePane = liveIsLeftPane ? 'right' : 'left';

  const paneCount = (pane: ComparePane) =>
    Math.max(
      0,
      ...alignments.map((alignment) =>
        pane === 'left' ? alignment.leftCount : alignment.rightCount,
      ),
    );

  const planFor = (pane: ComparePane, breaks: boolean[]) => {
    // The measure count must come from the same pane as the mismatch rows; taking
    // it from the other pane silently truncates or over-extends the plan.
    const count = breaks.length || paneCount(pane);
    const normalized = Array.from({ length: count }, (_, index) => Boolean(breaks[index]));
    const mismatch = Array.from({ length: count }, () => false);
    alignments.forEach((alignment) => {
      buildMismatchBreaks(alignment.rows, pane, count).forEach((value, index) => {
        if (value) {
          mismatch[index] = true;
        }
      });
    });
    return normalized.map((value, index) => value || mismatch[index]);
  };

  return {
    liveReflow: planFor(livePane, liveBreaks),
    auxiliaryReflow: planFor(auxiliaryPane, auxiliaryBreaks),
  };
}
