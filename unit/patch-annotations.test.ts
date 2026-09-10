import { describe, expect, it } from 'vitest';

import { extractPatchAnnotations } from '../lib/patch-annotations';

describe('extractPatchAnnotations (Part B)', () => {
  it('extracts annotations sibling to ops (1-based part → 0-based index)', () => {
    const out = extractPatchAnnotations({
      format: 'musicxml-patch@1',
      ops: [],
      annotations: [{ part: 2, measure: 3, comment: 'Raised the third.' }],
    });
    expect(out).toEqual([{ partIndex: 1, measure: 3, comment: 'Raised the third.' }]);
  });

  it('reads annotations nested under .patch', () => {
    const out = extractPatchAnnotations({
      patch: { annotations: [{ part: 1, measure: 5, comment: 'x' }] },
    });
    expect(out).toEqual([{ partIndex: 0, measure: 5, comment: 'x' }]);
  });

  it('honors an explicit 0-based partIndex over 1-based part', () => {
    const out = extractPatchAnnotations({
      annotations: [{ partIndex: 0, measure: 1, comment: 'y' }],
    });
    expect(out[0].partIndex).toBe(0);
  });

  it('accepts measureNumber/bar and text aliases', () => {
    expect(extractPatchAnnotations({ annotations: [{ measureNumber: 4, text: 'a' }] })[0]).toEqual({
      partIndex: 0,
      measure: 4,
      comment: 'a',
    });
    expect(extractPatchAnnotations({ annotations: [{ bar: 7, comment: 'b' }] })[0].measure).toBe(7);
  });

  it('skips entries with no comment and clamps bad numbers', () => {
    const out = extractPatchAnnotations({
      annotations: [
        { part: 1, measure: 2, comment: '   ' }, // empty → skipped
        { part: 0, measure: 0, comment: 'ok' }, // part clamps to 0, measure clamps to 1
      ],
    });
    expect(out).toEqual([{ partIndex: 0, measure: 1, comment: 'ok' }]);
  });

  it('returns [] for missing/malformed input', () => {
    expect(extractPatchAnnotations(null)).toEqual([]);
    expect(extractPatchAnnotations({})).toEqual([]);
    expect(extractPatchAnnotations({ annotations: 'nope' })).toEqual([]);
    expect(extractPatchAnnotations({ annotations: [42, null, 'x'] })).toEqual([]);
  });
});
