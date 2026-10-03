import { describe, expect, it } from 'vitest';
import {
  buildPartLocalizedChangeReviewBarHighlights,
  buildPartLocalizedChangeReviewHighlights,
  buildPartLocalizedSuppliedHighlights,
  sortChangeReviewRegionsByMeasure,
} from '../../lib/compare-highlights';
import { scoreLoadErrorMessage } from '../../components/score-editor/error-messages';

// Pure functions that used to live in ScoreEditor: no component render, no mocks, no globals. Kept apart
// from the component suites so they stay fast and readable.

describe('scoreLoadErrorMessage', () => {
  it('surfaces the newer MuseScore format guidance without the WASM prefix', () => {
    expect(
      scoreLoadErrorMessage(
        new Error(
          'WebMscore Err[2007] This score was saved in a newer MuseScore format that this editor does not support yet. Export the score as MusicXML in MuseScore, then load the MusicXML file here.',
        ),
      ),
    ).toBe(
      'This score was saved in a newer MuseScore format that this editor does not support yet. Export the score as MusicXML in MuseScore, then load the MusicXML file here.',
    );
  });

  it('keeps the generic user message for unrelated parser failures', () => {
    expect(scoreLoadErrorMessage(new Error('WebMscore Err[2004] Bad format'))).toBe(
      'Failed to load score. See console for details.',
    );
  });
});

describe('sortChangeReviewRegionsByMeasure', () => {
  it('orders change review cards by measure, then part', () => {
    const region = (label: string, partIndex: number, headMeasureIndex: number) => ({
      anchorId: `${partIndex}-${headMeasureIndex}`,
      partId: `${partIndex}`,
      partIndex,
      side: 'head' as const,
      changeType: 'modified' as const,
      headMeasureIndex,
      label,
      summary: '',
      commentable: true,
      regionHash: '',
    });

    const sorted = sortChangeReviewRegionsByMeasure([
      region('Violin 1 m18', 0, 17),
      region('Viola m14', 2, 13),
      region('Violin 2 m4', 1, 3),
      region('Viola m11', 2, 10),
      region('Violin 1 m14', 0, 13),
    ]);

    expect(sorted.map(({ label }) => label)).toEqual([
      'Violin 2 m4',
      'Viola m11',
      'Violin 1 m14',
      'Viola m14',
      'Violin 1 m18',
    ]);
  });
});

describe('buildPartLocalizedChangeReviewHighlights', () => {
  it('limits each changed measure highlight to its affected part', () => {
    const positions = {
      elements: [{ id: 7, x: 10, y: 100, sx: 80, sy: 200, page: 0 }],
      events: [],
      pageSize: { width: 1000, height: 1200 },
    };
    const region = {
      anchorId: 'viola-m1',
      partId: 'viola',
      partIndex: 2,
      side: 'head' as const,
      changeType: 'modified' as const,
      baseMeasureIndex: 0,
      headMeasureIndex: 0,
      label: 'Viola m1',
      summary: '',
      commentable: true,
      regionHash: '',
    };

    expect(buildPartLocalizedChangeReviewHighlights(positions, [region], 'head', 0.5, 4)).toEqual([
      expect.objectContaining({
        left: 5,
        top: 100,
        width: 40,
        height: 25,
      }),
    ]);
  });
});

describe('buildPartLocalizedSuppliedHighlights', () => {
  const positions = {
    elements: [
      { id: 1, x: 10, y: 100, sx: 80, sy: 200, page: 0 },
      { id: 2, x: 90, y: 100, sx: 80, sy: 200, page: 0 },
      { id: 3, x: 170, y: 100, sx: 80, sy: 200, page: 0 },
    ],
    events: [],
    pageSize: { width: 1000, height: 1200 },
  };

  it('highlights every measure of a multi-measure region', () => {
    // Two independent recognitions of one page disagree about barlines, so a
    // region spans several measures. Change review's one-measure shape would
    // silently drop all but the first.
    const region = {
      blockIndex: 0,
      leftPartIndex: 0,
      rightPartIndex: 0,
      leftMeasureIndexes: [0, 1, 2],
      rightMeasureIndexes: [0],
    };
    const left = buildPartLocalizedSuppliedHighlights(positions, [region], 'left', 1, 1);
    expect(left).toHaveLength(3);
    expect(left.map((rect) => rect.left)).toEqual([10, 90, 170]);
  });

  it('gives a one-sided region no highlight on the empty side', () => {
    const region = {
      blockIndex: 4,
      leftPartIndex: 0,
      rightPartIndex: 0,
      leftMeasureIndexes: [1, 2],
      rightMeasureIndexes: [],
    };
    expect(buildPartLocalizedSuppliedHighlights(positions, [region], 'left', 1, 1)).toHaveLength(2);
    expect(buildPartLocalizedSuppliedHighlights(positions, [region], 'right', 1, 1)).toEqual([]);
  });

  it('uses each side its own part index', () => {
    // A part matched across two documents need not sit at the same ordinal in
    // both, so one shared index would highlight the wrong stave on one side.
    const region = {
      blockIndex: 1,
      leftPartIndex: 0,
      rightPartIndex: 3,
      leftMeasureIndexes: [0],
      rightMeasureIndexes: [0],
    };
    const [left] = buildPartLocalizedSuppliedHighlights(positions, [region], 'left', 1, 4);
    const [right] = buildPartLocalizedSuppliedHighlights(positions, [region], 'right', 1, 4);
    expect(left.top).toBe(100);
    expect(right.top).toBe(250);
    expect(left.height).toBe(50);
  });

  it('drops a region whose part index is missing or out of range', () => {
    const missing = {
      blockIndex: 2,
      leftMeasureIndexes: [0],
      rightMeasureIndexes: [0],
    };
    const outOfRange = {
      blockIndex: 3,
      leftPartIndex: 9,
      leftMeasureIndexes: [0],
      rightMeasureIndexes: [],
    };
    expect(buildPartLocalizedSuppliedHighlights(positions, [missing], 'left', 1, 4)).toEqual([]);
    expect(buildPartLocalizedSuppliedHighlights(positions, [outOfRange], 'left', 1, 4)).toEqual([]);
  });
});

describe('buildPartLocalizedChangeReviewBarHighlights', () => {
  it('keeps threaded bar highlights distinct by side and part', () => {
    const positions = {
      elements: [{ id: 7, x: 10, y: 100, sx: 80, sy: 200, page: 0 }],
      events: [],
      pageSize: { width: 1000, height: 1200 },
    };
    const bar = (anchorId: string, side: 'base' | 'head', partIndex: number) => ({
      kind: 'score_bar' as const,
      anchorId,
      revisionId: `rev-${side}`,
      side,
      partId: `part-${partIndex}`,
      partIndex,
      measureIndex: 0,
      measureNumber: '1',
      measureHash: `${side}-${partIndex}`,
      label: `${side} part ${partIndex}`,
      hasThread: true,
      commentable: true,
    });

    const highlights = buildPartLocalizedChangeReviewBarHighlights(
      positions,
      [bar('base-violin', 'base', 0), bar('base-cello', 'base', 3), bar('head-cello', 'head', 3)],
      'base',
      0.5,
      4,
    );

    expect(highlights).toEqual([
      expect.objectContaining({ id: 'base-violin-base', top: 50, height: 25 }),
      expect.objectContaining({ id: 'base-cello-base', top: 125, height: 25 }),
    ]);
  });
});
