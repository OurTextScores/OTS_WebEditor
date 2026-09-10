import { describe, expect, it } from 'vitest';
import { buildCompareUserEditDiff } from '../lib/compare-user-edit-diff';

describe('buildCompareUserEditDiff', () => {
  it('returns a compact unified diff for a manual MusicXML edit', () => {
    const before = [
      '<score-partwise>',
      '  <part id="P1">',
      '    <measure number="1"/>',
      '  </part>',
      '</score-partwise>',
    ].join('\n');
    const after = before.replace(
      '    <measure number="1"/>',
      '    <measure number="1"><note/></measure>',
    );

    const result = buildCompareUserEditDiff(before, after, 'Assistant proposal');

    expect(result).toContain('Assistant proposal-before.musicxml');
    expect(result).toContain('-    <measure number="1"/>');
    expect(result).toContain('+    <measure number="1"><note/></measure>');
  });

  it('omits unchanged scores and bounds large diffs', () => {
    expect(buildCompareUserEditDiff('<score/>', '<score/>', 'Current')).toBe('');

    const result = buildCompareUserEditDiff(
      Array.from({ length: 100 }, (_, index) => `<measure number="${index}"/>`).join('\n'),
      Array.from(
        { length: 100 },
        (_, index) => `<measure number="${index}"><note/></measure>`,
      ).join('\n'),
      'Current',
      500,
    );
    expect(result.length).toBeLessThanOrEqual(510);
    expect(result).toContain('truncated');
  });
});
