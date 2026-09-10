import { describe, expect, it, vi } from 'vitest';
import {
  buildCompareReflowPlan,
  buildCompareSystemGeometry,
  buildAlignmentGaps,
  buildResyncBreaks,
  measureStructuralGapResidual,
  mergeAlignmentGaps,
  type ComparePane,
  type MeasureAlignmentRow,
  type ReflowAlignment,
} from '../components/score-editor/compare/compare-reflow-plan';
import type { Positions } from '../lib/webmscore-loader';

const rows = (count: number): MeasureAlignmentRow[] =>
  Array.from({ length: count }, (_, index) => ({
    leftIndex: index,
    rightIndex: index,
    match: true,
  }));

const alignment = (leftCount: number, rightCount: number): ReflowAlignment => ({
  rows: rows(Math.max(leftCount, rightCount)),
  leftCount,
  rightCount,
});

/** Marks a distinct index per pane, so a pane mix-up is visible in the output. */
const paneMarker =
  (markIndex: Record<ComparePane, number>) =>
  (_rows: MeasureAlignmentRow[], pane: ComparePane, count: number) =>
    Array.from({ length: count }, (_, index) => index === markIndex[pane]);

describe('buildCompareReflowPlan', () => {
  it("sends each pane's mismatch breaks to the score that pane displays", () => {
    const buildMismatchBreaks = vi.fn(paneMarker({ left: 0, right: 2 }));

    const asLeft = buildCompareReflowPlan({
      liveBreaks: [false, false, false],
      auxiliaryBreaks: [false, false, false],
      liveIsLeftPane: true,
      alignments: [alignment(3, 3)],
      buildMismatchBreaks,
    });

    // Live sits in the left pane, so it takes the left marker at index 0.
    expect(asLeft.liveReflow).toEqual([true, false, false]);
    expect(asLeft.auxiliaryReflow).toEqual([false, false, true]);
  });

  it('follows the swap: the same inputs invert when the live score is on the right', () => {
    const buildMismatchBreaks = vi.fn(paneMarker({ left: 0, right: 2 }));

    const asRight = buildCompareReflowPlan({
      liveBreaks: [false, false, false],
      auxiliaryBreaks: [false, false, false],
      liveIsLeftPane: false,
      alignments: [alignment(3, 3)],
      buildMismatchBreaks,
    });

    // This is the case the old position-based combination got wrong: it handed the
    // left pane's plan to the live score regardless of which pane displayed it.
    expect(asRight.liveReflow).toEqual([false, false, true]);
    expect(asRight.auxiliaryReflow).toEqual([true, false, false]);
  });

  it('queries mismatch rows for the pane each score is actually shown in', () => {
    const buildMismatchBreaks = vi.fn(paneMarker({ left: 0, right: 1 }));

    buildCompareReflowPlan({
      liveBreaks: [false, false],
      auxiliaryBreaks: [false, false],
      liveIsLeftPane: false,
      alignments: [alignment(2, 2)],
      buildMismatchBreaks,
    });

    const panes = buildMismatchBreaks.mock.calls.map((call) => call[1]);
    expect(panes).toEqual(['right', 'left']);
  });

  it('preserves existing breaks and unions them with mismatch breaks', () => {
    const plan = buildCompareReflowPlan({
      liveBreaks: [true, false, false],
      auxiliaryBreaks: [false, true, false],
      liveIsLeftPane: true,
      alignments: [alignment(3, 3)],
      buildMismatchBreaks: paneMarker({ left: 2, right: 2 }),
    });

    expect(plan.liveReflow).toEqual([true, false, true]);
    expect(plan.auxiliaryReflow).toEqual([false, true, true]);
  });

  it('takes the measure count from the matching pane when a score has no breaks yet', () => {
    const plan = buildCompareReflowPlan({
      liveBreaks: [],
      auxiliaryBreaks: [],
      liveIsLeftPane: false,
      // Deliberately different per pane: a mix-up changes the output length.
      alignments: [alignment(2, 5)],
      buildMismatchBreaks: () => [],
    });

    // Live is on the right, so it gets the right pane's count of 5.
    expect(plan.liveReflow).toHaveLength(5);
    expect(plan.auxiliaryReflow).toHaveLength(2);
  });

  it("prefers a score's own break length over the pane count", () => {
    const plan = buildCompareReflowPlan({
      liveBreaks: [false, false, false, false],
      auxiliaryBreaks: [],
      liveIsLeftPane: true,
      alignments: [alignment(2, 7)],
      buildMismatchBreaks: () => [],
    });

    expect(plan.liveReflow).toHaveLength(4);
    expect(plan.auxiliaryReflow).toHaveLength(7);
  });

  it('unions mismatch breaks across every part alignment', () => {
    const perAlignment = [0, 2];
    let call = 0;
    const plan = buildCompareReflowPlan({
      liveBreaks: [false, false, false],
      auxiliaryBreaks: [false, false, false],
      liveIsLeftPane: true,
      alignments: [alignment(3, 3), alignment(3, 3)],
      buildMismatchBreaks: (_rows, pane, count) => {
        // Only vary the live (left) pane; index alternates per alignment.
        const mark = pane === 'left' ? perAlignment[call++ % 2] : -1;
        return Array.from({ length: count }, (_, index) => index === mark);
      },
    });

    expect(plan.liveReflow).toEqual([true, false, true]);
  });

  it('returns empty plans when there is nothing to lay out', () => {
    const plan = buildCompareReflowPlan({
      liveBreaks: [],
      auxiliaryBreaks: [],
      liveIsLeftPane: true,
      alignments: [],
      buildMismatchBreaks: () => [],
    });

    expect(plan.liveReflow).toEqual([]);
    expect(plan.auxiliaryReflow).toEqual([]);
  });
});

describe('buildResyncBreaks', () => {
  const rows = [0, 1, 2, 3, 4, 5].map((n) => ({ leftIndex: n, rightIndex: n, match: true }));

  it('breaks both panes wherever either one wrapped', () => {
    // Left wraps after bar 2, right after bar 1 — the wider score ran out of room
    // sooner. Both must break at the earlier point or the rows come apart.
    const leftSystemOf = (m: number) => (m <= 2 ? 0 : 1);
    const rightSystemOf = (m: number) => (m <= 1 ? 0 : 1);

    expect(buildResyncBreaks(rows, leftSystemOf, rightSystemOf)).toEqual({
      left: [1, 2],
      right: [1, 2],
    });
  });

  it('adds nothing when both panes already wrap together', () => {
    const same = (m: number) => (m <= 2 ? 0 : 1);
    expect(buildResyncBreaks(rows, same, same)).toEqual({ left: [2], right: [2] });
  });

  it('skips rows a pane does not have, rather than guessing an index', () => {
    // An inserted bar has no counterpart. A break cannot leave a gap for it, so the
    // row contributes nothing on the side that is missing it — that case needs a
    // spacer, not a line break.
    const withGap = [
      { leftIndex: 0, rightIndex: 0, match: true },
      { leftIndex: null, rightIndex: 1, match: false },
      { leftIndex: 1, rightIndex: 2, match: true },
    ];
    const leftSystemOf = (m: number) => (m <= 0 ? 0 : 1);
    const rightSystemOf = () => 0;

    expect(buildResyncBreaks(withGap, leftSystemOf, rightSystemOf)).toEqual({
      left: [],
      right: [],
    });
  });

  it('ignores measures with no laid-out system', () => {
    const unlaid = () => undefined;
    expect(buildResyncBreaks(rows, unlaid, unlaid)).toEqual({ left: [], right: [] });
  });
});

describe('buildAlignmentGaps', () => {
  it('pads the side that is missing a bar the other wrapped onto', () => {
    // Mirrors the measured fixture: base has 4 bars in 2 systems, head has 5 in 3,
    // and the extra bar is the one that starts the head's third system.
    const rows = [
      { leftIndex: 0, rightIndex: 0, match: true },
      { leftIndex: 1, rightIndex: 1, match: true },
      { leftIndex: null, rightIndex: 2, match: false },
      { leftIndex: 2, rightIndex: 3, match: true },
      { leftIndex: 3, rightIndex: 4, match: true },
    ];
    const leftSystemOf = (m: number) => (m <= 1 ? 0 : 1);
    const rightSystemOf = (m: number) => (m <= 1 ? 0 : m === 2 ? 1 : 2);

    const gaps = buildAlignmentGaps(
      rows,
      leftSystemOf,
      rightSystemOf,
      () => 40,
      () => 40,
    );

    // The head starts system 1 on the inserted bar, which the base does not have, so
    // the base is padded after its last real bar at that point.
    expect(gaps.left).toEqual([{ measureIndex: 1, gap: 40 }]);
    expect(gaps.right).toEqual([]);
  });

  it('adds nothing when both sides advance together', () => {
    const rows = [0, 1, 2, 3].map((n) => ({ leftIndex: n, rightIndex: n, match: true }));
    const same = (m: number) => (m <= 1 ? 0 : 1);

    expect(
      buildAlignmentGaps(
        rows,
        same,
        same,
        () => 40,
        () => 40,
      ),
    ).toEqual({
      left: [],
      right: [],
    });
  });

  it('does not turn an ordinary wrap difference into a structural gap', () => {
    const rows = [0, 1, 2, 3].map((n) => ({ leftIndex: n, rightIndex: n, match: true }));
    const leftSystemOf = (m: number) => (m <= 1 ? 0 : 1);
    const rightSystemOf = (m: number) => (m === 0 ? 0 : 1);

    expect(
      buildAlignmentGaps(
        rows,
        leftSystemOf,
        rightSystemOf,
        () => 40,
        () => 40,
      ),
    ).toEqual({
      left: [],
      right: [],
    });
  });

  it('accumulates every system consumed by one structural insertion at its anchor', () => {
    const rows = [
      { leftIndex: 0, rightIndex: 0, match: true },
      { leftIndex: null, rightIndex: 1, match: false },
      { leftIndex: null, rightIndex: 2, match: false },
      { leftIndex: null, rightIndex: 3, match: false },
      { leftIndex: 1, rightIndex: 4, match: true },
    ];
    const leftSystemOf = () => 0;
    const rightSystemOf = (m: number) => m;

    expect(
      buildAlignmentGaps(
        rows,
        leftSystemOf,
        rightSystemOf,
        () => 30,
        (system) => [20, 30, 40, 50][system],
      ),
    ).toEqual({
      left: [{ measureIndex: 0, gap: 120 }],
      right: [],
    });
  });

  it('pads the head when the base is the longer side', () => {
    const rows = [
      { leftIndex: 0, rightIndex: 0, match: true },
      { leftIndex: 1, rightIndex: null, match: false },
      { leftIndex: 2, rightIndex: 1, match: true },
    ];
    const leftSystemOf = (m: number) => (m === 0 ? 0 : 1);
    const rightSystemOf = () => 0;

    const gaps = buildAlignmentGaps(
      rows,
      leftSystemOf,
      rightSystemOf,
      () => 30,
      () => 30,
    );

    expect(gaps.left).toEqual([]);
    expect(gaps.right).toEqual([{ measureIndex: 0, gap: 30 }]);
  });

  it('ignores systems with no measurable height', () => {
    const rows = [
      { leftIndex: 0, rightIndex: 0, match: true },
      { leftIndex: null, rightIndex: 1, match: false },
    ];
    expect(
      buildAlignmentGaps(
        rows,
        () => 0,
        (m) => m,
        () => undefined,
        () => undefined,
      ),
    ).toEqual({
      left: [],
      right: [],
    });
  });
});

describe('mergeAlignmentGaps', () => {
  it('takes the maximum requirement across parts instead of summing duplicates', () => {
    expect(
      mergeAlignmentGaps([
        [
          { measureIndex: 1, gap: 40 },
          { measureIndex: 4, gap: 25 },
        ],
        [{ measureIndex: 1, gap: 45 }],
        [{ measureIndex: 4, gap: 20 }],
      ]),
    ).toEqual([
      { measureIndex: 1, gap: 45 },
      { measureIndex: 4, gap: 25 },
    ]);
  });
});

describe('settled compare geometry', () => {
  const positions = (ys: number[], heights: number[], pageHeight = 500): Positions => ({
    elements: ys.map((y, index) => ({
      id: index,
      x: 0,
      y,
      sx: 100,
      sy: heights[index],
      page: 0,
    })),
    events: [],
    pageSize: { width: 100, height: pageHeight },
  });

  it('measures a system slot from one top to the next, with ink height as the fallback', () => {
    const geometry = buildCompareSystemGeometry(positions([10, 10, 130, 310], [40, 40, 60, 50]));

    expect([0, 1, 2, 3].map(geometry.systemOf)).toEqual([0, 0, 1, 2]);
    expect([0, 1, 2].map(geometry.systemHeight)).toEqual([120, 180, 50]);
  });

  it('measures only paired rows downstream of a structural gap', () => {
    const alignments = [
      {
        rows: [
          { leftIndex: 0, rightIndex: 0, match: true },
          { leftIndex: null, rightIndex: 1, match: false },
          { leftIndex: 1, rightIndex: 2, match: true },
        ],
      },
    ];

    expect(
      measureStructuralGapResidual(
        alignments,
        positions([20, 200], [40, 40]),
        positions([5, 100, 260], [40, 40, 40]),
      ),
    ).toEqual({ left: 60, right: 0 });
  });
});
