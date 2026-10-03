// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithTimeout } from '../../components/score-editor/async-timeout';
import { getReviewStatusForFeedback } from '../../components/score-editor/block-review-status';
import { isEditableTarget } from '../../components/score-editor/editable-target';
import {
  escapeXml,
  newScoreCommonInstrumentPreferences,
  pickupDurationToRestType,
} from '../../components/score-editor/new-score';
import { parsePartsFromMetadata } from '../../components/score-editor/part-metadata';
import { summarizeScoreId } from '../../components/score-editor/score-id';
import {
  applyMeasureLineBreaks,
  buildMeasureBounds,
  fetchMeasureLineBreaks,
  fetchMeasureSignatures,
  getPageMeasureRange,
  hitTestMeasure,
  refreshMeasurePositions,
} from '../../components/score-editor/score-measures';
import type { Positions, Score } from '../../lib/webmscore-loader';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runWithTimeout', () => {
  it('resolves with the value and clears its timer', async () => {
    vi.useFakeTimers();
    await expect(runWithTimeout(Promise.resolve(7), 1000, 'load')).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the label and the limit when the promise is too slow', async () => {
    vi.useFakeTimers();
    const slow = new Promise<number>(() => {});
    const result = runWithTimeout(slow, 500, 'layout');
    const assertion = expect(result).rejects.toThrow('layout timed out after 500ms');
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('passes through the promise’s own rejection', async () => {
    vi.useFakeTimers();
    await expect(runWithTimeout(Promise.reject(new Error('boom')), 1000, 'x')).rejects.toThrow(
      'boom',
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('summarizeScoreId', () => {
  it('describes each kind of score id', () => {
    expect(summarizeScoreId('url:https://x.test/a/b.mscz')).toEqual({
      title: 'b.mscz',
      detail: 'https://x.test/a/b.mscz',
      type: 'url',
    });
    expect(summarizeScoreId('file:song.xml:123')).toEqual({
      title: 'song.xml',
      detail: 'File import',
      type: 'file',
    });
    expect(summarizeScoreId('file:')).toEqual({
      title: 'File import',
      detail: 'File import',
      type: 'file',
    });
    expect(summarizeScoreId('new:abc')).toEqual({ title: 'New score', detail: 'abc', type: 'new' });
    expect(summarizeScoreId('legacy')).toEqual({
      title: 'Legacy checkpoints',
      detail: 'Unscoped checkpoints',
      type: 'legacy',
    });
    expect(summarizeScoreId('ots:w1:s2')).toEqual({
      title: 'OTS source s2',
      detail: 'Work w1',
      type: 'other',
    });
    expect(summarizeScoreId('ots:')).toEqual({
      title: 'OurTextScores source',
      detail: 'OurTextScores source',
      type: 'other',
    });
    expect(summarizeScoreId('whatever')).toEqual({ title: 'whatever', detail: '', type: 'other' });
  });
});

describe('new score helpers', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
    );
  });

  it('maps a pickup fraction to a rest type', () => {
    expect(pickupDurationToRestType(1, 4)).toBe('quarter');
    expect(pickupDurationToRestType(1, 16)).toBe('16th');
    expect(pickupDurationToRestType(3, 8)).toBe('quarter'); // dotted quarter
    expect(pickupDurationToRestType(3, 4)).toBe('half'); // dotted half
    expect(pickupDurationToRestType(3, 2)).toBe('whole');
    expect(pickupDurationToRestType(2, 4)).toBe('quarter'); // falls back to the denominator
    expect(pickupDurationToRestType(1, 3)).toBe('quarter'); // unknown denominator
  });

  it('lists each common instrument once', () => {
    const keys = newScoreCommonInstrumentPreferences.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(newScoreCommonInstrumentPreferences.every((entry) => entry.ids.length > 0)).toBe(true);
  });
});

describe('parsePartsFromMetadata', () => {
  it('reads parts, defaulting what is missing', () => {
    expect(
      parsePartsFromMetadata({
        parts: [
          { name: 'Violin', instrumentName: 'Violin I', instrumentId: 'violin', isVisible: 'TRUE' },
          { isVisible: false },
          'junk',
        ],
      }),
    ).toEqual([
      {
        index: 0,
        name: 'Violin',
        instrumentName: 'Violin I',
        instrumentId: 'violin',
        isVisible: true,
      },
      { index: 1, name: '', instrumentName: '', instrumentId: '', isVisible: false },
      { index: 2, name: '', instrumentName: '', instrumentId: '', isVisible: false },
    ]);
  });

  it('returns no parts for anything else', () => {
    expect(parsePartsFromMetadata(null)).toEqual([]);
    expect(parsePartsFromMetadata({ parts: 'x' })).toEqual([]);
  });
});

describe('getReviewStatusForFeedback', () => {
  it('treats a missing review and an empty comment as pending', () => {
    expect(getReviewStatusForFeedback(undefined)).toBe('pending');
    expect(getReviewStatusForFeedback({ status: 'comment', comment: '  ' } as never)).toBe(
      'pending',
    );
  });

  it('keeps a real comment and any other status', () => {
    expect(getReviewStatusForFeedback({ status: 'comment', comment: 'fix' } as never)).toBe(
      'comment',
    );
    expect(getReviewStatusForFeedback({ status: 'accepted', comment: '' } as never)).toBe(
      'accepted',
    );
  });
});

describe('isEditableTarget', () => {
  it('is true for form fields and contenteditable, false for anything else', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});

const asScore = (methods: Record<string, unknown>) => methods as unknown as Score;

describe('fetchMeasureSignatures', () => {
  it('uses the bulk call when it returns signatures, as an array or as JSON', async () => {
    expect(
      await fetchMeasureSignatures(asScore({ measureSignatures: async () => ['a', 7, 'b'] }), 0),
    ).toEqual(['a', 'b']);
    expect(
      await fetchMeasureSignatures(asScore({ measureSignatures: async () => '["a","b"]' }), 0),
    ).toEqual(['a', 'b']);
  });

  it('falls back to the per-measure calls when the bulk call is empty', async () => {
    const score = asScore({
      measureSignatures: async () => [],
      measureSignatureCount: async () => 2,
      measureSignatureAt: async (_part: number, index: number) => `m${index}`,
    });
    expect(await fetchMeasureSignatures(score, 0)).toEqual(['m0', 'm1']);
  });

  it('returns the empty answer when there is nothing to fall back to', async () => {
    expect(await fetchMeasureSignatures(asScore({ measureSignatures: async () => [] }), 0)).toEqual(
      [],
    );
    expect(await fetchMeasureSignatures(asScore({}), 0)).toEqual([]);
  });

  it('warns and falls back when the payload is not JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const score = asScore({
      measureSignatures: async () => 'not json',
      measureSignatureCount: async () => 1,
      measureSignatureAt: async () => 'only',
    });
    expect(await fetchMeasureSignatures(score, 0)).toEqual(['only']);
    expect(warn).toHaveBeenCalled();
  });
});

describe('line breaks and measure positions', () => {
  it('reads line breaks as booleans, and is empty without the API', async () => {
    expect(
      await fetchMeasureLineBreaks(asScore({ measureLineBreaks: async () => [1, 0, true] })),
    ).toEqual([true, false, true]);
    expect(await fetchMeasureLineBreaks(asScore({ measureLineBreaks: async () => null }))).toEqual(
      [],
    );
    expect(await fetchMeasureLineBreaks(asScore({}))).toEqual([]);
  });

  it('applies line breaks only when the engine can', async () => {
    const set = vi.fn(async () => true);
    expect(await applyMeasureLineBreaks(asScore({ setMeasureLineBreaks: set }), [true])).toBe(true);
    expect(set).toHaveBeenCalledWith([true]);
    expect(await applyMeasureLineBreaks(asScore({}), [true])).toBe(false);
  });

  it('hands measure positions to the setter, and reports failure', async () => {
    const setter = vi.fn();
    const positions = { elements: [] } as unknown as Positions;
    expect(
      await refreshMeasurePositions(asScore({ measurePositions: async () => positions }), setter),
    ).toBe(true);
    expect(setter).toHaveBeenCalledWith(positions);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await refreshMeasurePositions(
        asScore({
          measurePositions: async () => {
            throw new Error('x');
          },
        }),
        setter,
      ),
    ).toBe(false);
    expect(await refreshMeasurePositions(asScore({}), setter)).toBe(false);
  });
});

describe('getPageMeasureRange', () => {
  it('returns the engine range, clamping a negative page to the first', async () => {
    const range = { startMeasureIndex: 0, endMeasureIndex: 3 };
    const measureRangeForPage = vi.fn(() => range);
    expect(await getPageMeasureRange(asScore({ measureRangeForPage }), -2)).toBe(range);
    expect(measureRangeForPage).toHaveBeenCalledWith(0);
  });

  it('explains an old build and an empty page', async () => {
    await expect(getPageMeasureRange(asScore({}), 0)).rejects.toThrow(
      'Current-page audio requires an updated webmscore build.',
    );
    await expect(
      getPageMeasureRange(
        asScore({ measureRangeForPage: () => ({ startMeasureIndex: NaN, endMeasureIndex: 1 }) }),
        2,
      ),
    ).rejects.toThrow('No measures found on page 3.');
  });
});

describe('measure geometry', () => {
  const element = (over: Record<string, number | undefined>) => ({
    id: 0,
    x: 0,
    y: 0,
    sx: 10,
    sy: 20,
    page: 0,
    ...over,
  });
  const positions = (elements: Array<ReturnType<typeof element>>, height = 100) =>
    ({ elements, events: [], pageSize: { height, width: 50 } }) as unknown as Positions;

  it('scales measure boxes and offsets later pages by the page height', () => {
    const bounds = buildMeasureBounds(
      positions([element({ y: 10 }), element({ page: 1, y: 5, sy: 10 })]),
      2,
    );
    expect(bounds).toEqual([
      { top: 20, height: 40 },
      { top: 210, height: 20 }, // (5 + 100) * 2
    ]);
  });

  it('does not offset a box that is already page-relative to a later page', () => {
    // y + height is far beyond 1.2 pages, so the engine already gave an absolute y
    expect(buildMeasureBounds(positions([element({ page: 1, y: 500, sy: 10 })]), 1)).toEqual([
      { top: 500, height: 10 },
    ]);
  });

  it('falls back to height when there is no scaled height, and is empty for no positions', () => {
    expect(buildMeasureBounds(positions([element({ sy: undefined, height: 8 })]), 1)).toEqual([
      { top: 0, height: 8 },
    ]);
    expect(buildMeasureBounds(null, 1)).toEqual([]);
    expect(buildMeasureBounds(positions([]), 1)).toEqual([]);
  });

  it('finds the measure under a point, else the nearest one', () => {
    const wrapper = { current: { getBoundingClientRect: () => ({ left: 100, top: 50 }) } } as never;
    const two = positions([
      element({ x: 0, y: 0, sx: 10, sy: 10 }),
      element({ x: 100, y: 0, sx: 10, sy: 10 }),
    ]);
    expect(hitTestMeasure(two, 105, 55, wrapper, 1)).toBe(0); // inside the first
    expect(hitTestMeasure(two, 100 + 104, 55, wrapper, 1)).toBe(1); // inside the second
    expect(hitTestMeasure(two, 100 + 80, 50 + 5, wrapper, 1)).toBe(1); // between: nearest centre
    expect(hitTestMeasure(two, 105, 55, wrapper, 2)).toBe(0); // zoom divides client offsets
    expect(hitTestMeasure(null, 0, 0, wrapper, 1)).toBe(-1);
    expect(hitTestMeasure(two, 0, 0, { current: null } as never, 1)).toBe(-1);
  });
});
