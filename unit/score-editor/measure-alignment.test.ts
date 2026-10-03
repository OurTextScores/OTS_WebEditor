import { describe, expect, it } from 'vitest';
import {
  buildIndexAlignment,
  buildLcsAlignment,
  buildMismatchBlocks,
  buildMismatchBreaks,
  normalizeAlignmentRows,
} from '../../components/score-editor/alignment';

const row = (leftIndex: number | null, rightIndex: number | null, match: boolean) => ({
  leftIndex,
  rightIndex,
  match,
});

describe('buildIndexAlignment', () => {
  it('pairs measures by position and marks equal signatures as matches', () => {
    expect(buildIndexAlignment(['a', 'b', 'c'], ['a', 'x'])).toEqual([
      row(0, 0, true),
      row(1, 1, false),
      row(2, null, false),
    ]);
  });

  it('is empty for two empty scores', () => {
    expect(buildIndexAlignment([], [])).toEqual([]);
  });
});

describe('buildMismatchBlocks', () => {
  it('groups consecutive mismatches, including a run that reaches the end', () => {
    const rows = [
      row(0, 0, true),
      row(1, 1, false),
      row(2, 2, false),
      row(3, 3, true),
      row(4, null, false),
    ];
    expect(buildMismatchBlocks(rows)).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 4 },
    ]);
  });

  it('finds no blocks when everything matches', () => {
    expect(buildMismatchBlocks([row(0, 0, true), row(1, 1, true)])).toEqual([]);
  });
});

describe('buildMismatchBreaks', () => {
  const rows = buildIndexAlignment(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'd']);

  it('breaks the line before and after each mismatched block, on the left score', () => {
    // the block covers measures 1..2, so a break goes after measure 0 and after measure 2
    expect(buildMismatchBreaks(rows, 'left', 4)).toEqual([true, false, true, false]);
  });

  it('uses the right-hand indices for the right score', () => {
    expect(buildMismatchBreaks(rows, 'right', 4)).toEqual([true, false, true, false]);
  });

  it('breaks only after a block that starts at the first measure', () => {
    const start = buildIndexAlignment(['a', 'b'], ['x', 'b']);
    expect(buildMismatchBreaks(start, 'left', 2)).toEqual([true, false]);
  });

  it('returns all false for no rows or a non-positive measure count', () => {
    expect(buildMismatchBreaks([], 'left', 3)).toEqual([false, false, false]);
    expect(buildMismatchBreaks(rows, 'left', 0)).toEqual([]);
  });

  it('skips a block that has no measure on this side', () => {
    const leftOnly = [row(0, 0, true), row(null, 1, false)];
    expect(buildMismatchBreaks(leftOnly, 'left', 1)).toEqual([false]);
  });
});

describe('normalizeAlignmentRows', () => {
  it('pairs a run of unmatched left and right measures into replacements', () => {
    expect(
      normalizeAlignmentRows([row(0, null, false), row(null, 0, false), row(1, 1, true)]),
    ).toEqual([row(0, 0, false), row(1, 1, true)]);
  });

  it('keeps the surplus of the longer run as insertions or deletions', () => {
    expect(
      normalizeAlignmentRows([row(0, null, false), row(1, null, false), row(null, 0, false)]),
    ).toEqual([row(0, 0, false), row(1, null, false)]);
  });

  it('passes matched and already-paired rows through unchanged', () => {
    const rows = [row(0, 0, true), row(1, 1, false)];
    expect(normalizeAlignmentRows(rows)).toEqual(rows);
  });
});

describe('buildLcsAlignment', () => {
  it('aligns the common subsequence and leaves the extra measure unmatched', () => {
    const { rows, lcsRatio } = buildLcsAlignment(['a', 'b', 'c'], ['a', 'c']);
    expect(rows).toEqual([row(0, 0, true), row(1, null, false), row(2, 1, true)]);
    expect(lcsRatio).toBeCloseTo(2 / 3);
  });

  it('turns a one-for-one change into a paired replacement', () => {
    const { rows, lcsRatio } = buildLcsAlignment(['a', 'b'], ['a', 'x']);
    expect(rows).toEqual([row(0, 0, true), row(1, 1, false)]);
    expect(lcsRatio).toBe(0.5);
  });

  it('reports a ratio of 1 for identical scores and 0 for empty ones', () => {
    expect(buildLcsAlignment(['a', 'b'], ['a', 'b']).lcsRatio).toBe(1);
    expect(buildLcsAlignment([], [])).toEqual({ rows: [], lcsRatio: 0 });
  });

  it('keeps every measure of both scores exactly once', () => {
    const left = ['a', 'b', 'c', 'd', 'e'];
    const right = ['x', 'b', 'd', 'e', 'f', 'g'];
    const { rows } = buildLcsAlignment(left, right);
    expect(rows.flatMap((r) => (r.leftIndex === null ? [] : [r.leftIndex]))).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(rows.flatMap((r) => (r.rightIndex === null ? [] : [r.rightIndex]))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});
