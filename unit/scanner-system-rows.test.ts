import { describe, expect, it } from 'vitest';
import { withForcedSystemBreaks } from '../components/score-editor/compare/ScannerSystemRows';

const score = (measures: number) => `<?xml version="1.0"?>
<score-partwise version="4.0"><part id="P1">${Array.from(
  { length: measures },
  (_value, index) => `<measure number="${index + 1}"><note/></measure>`,
).join('')}</part></score-partwise>`;

describe('withForcedSystemBreaks', () => {
  it('breaks where the scan breaks, not where the engine would', () => {
    const out = withForcedSystemBreaks(score(6), [0, 2, 4]);
    const measures = out.split('<measure').slice(1);
    // Index 0 starts the page, so it needs no break of its own.
    expect(measures[0]).not.toContain('new-system');
    expect(measures[2]).toContain('new-system="yes"');
    expect(measures[4]).toContain('new-system="yes"');
    expect(measures[1]).not.toContain('new-system');
    expect(measures[3]).not.toContain('new-system');
  });

  it('discards line breaks the engine chose for itself', () => {
    const withOwnBreak = `<?xml version="1.0"?>
<score-partwise version="4.0"><part id="P1">
<measure number="1"><note/></measure>
<measure number="2"><print new-system="yes"/><note/></measure>
<measure number="3"><note/></measure>
</part></score-partwise>`;
    // The scan puts its break at measure 3, not measure 2.
    const out = withForcedSystemBreaks(withOwnBreak, [0, 2]);
    const measures = out.split('<measure').slice(1);
    expect(measures[1]).not.toContain('new-system');
    expect(measures[2]).toContain('new-system="yes"');
  });

  it('returns the score untouched when there is nothing to force', () => {
    const xml = score(3);
    expect(withForcedSystemBreaks(xml, [])).toBe(xml);
  });

  it('leaves malformed input alone rather than throwing', () => {
    expect(withForcedSystemBreaks('<not-xml', [0, 1])).toBe('<not-xml');
  });
});
