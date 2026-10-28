import { describe, expect, it } from 'vitest';
import { compareFacts, musicXmlFacts } from '../../tools/musescore/cross-engine-facts.mjs';

const score = `<score-partwise><part-list/><part id="P1"><measure number="1">
  <note print-object="no"><pitch><step>C</step><octave>4</octave></pitch></note>
  <note><pitch><step>D</step><octave>4</octave></pitch><notehead>none</notehead></note>
  <note><pitch><step>E</step><octave>4</octave></pitch></note>
  <note><rest/></note></measure></part></score-partwise>`;

describe('cross-engine triage facts', () => {
  it('counts written parts, measures, rests, pitches and the supported hidden-note forms', () => {
    expect(musicXmlFacts(score)).toEqual({
      parts: 1,
      measures: 1,
      pitchedNotes: 3,
      rests: 1,
      visiblePitchedNotes: 1,
    });
  });
  it('flags disagreement even when both engines agree with each other, and leaves unknown values unsupported', () => {
    const input = musicXmlFacts(score);
    const changed = { ...input, rests: 2, measures: null };
    const comparisons = compareFacts(input, changed, changed);
    expect(comparisons.find((item) => item.metric === 'rests')?.status).toBe('needs-review');
    expect(comparisons.find((item) => item.metric === 'measures')?.status).toBe('unsupported');
    expect(comparisons.find((item) => item.metric === 'pitchedNotes')?.status).toBe('agree');
  });
  it('does not compare unmatched part measure counts and rejects unsupported score documents', () => {
    const multi = score.replace(
      '</score-partwise>',
      '<part id="P2"><measure/><measure/></part></score-partwise>',
    );
    expect(musicXmlFacts(multi).measures).toBeNull();
    expect(() => musicXmlFacts('<score-timewise/>')).toThrow('score-partwise');
    const percussion = score.replace('<rest/>', '<unpitched><display-step>C</display-step></unpitched>');
    expect(musicXmlFacts(percussion).pitchedNotes).toBeNull();
    expect(musicXmlFacts(percussion).visiblePitchedNotes).toBeNull();
  });
});
