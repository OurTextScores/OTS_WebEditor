import { describe, expect, it } from 'vitest';

import {
  findIntroducedMusicXmlStructuralIssues,
  findMusicXmlStructuralIssues,
} from '../lib/musicxml-structural-validation';

const score = (note: string) => `<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1">${note}</measure></part>
</score-partwise>`;

describe('MusicXML structural validation', () => {
  it('accepts pitched notes and rests with one origin', () => {
    expect(
      findMusicXmlStructuralIssues(score('<note><rest/><duration>4</duration></note>')),
    ).toEqual([]);
    expect(
      findMusicXmlStructuralIssues(
        score('<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>'),
      ),
    ).toEqual([]);
  });

  it('reports a note containing both rest and pitch', () => {
    const issues = findMusicXmlStructuralIssues(
      score(
        '<note><rest/><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>',
      ),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'note-origin-count',
        location: 'P1/measure-1/note-1',
      }),
    ]);
  });

  it('only reports violations introduced by the proposal', () => {
    const invalid = score('<note><rest/><pitch><step>C</step><octave>4</octave></pitch></note>');
    expect(findIntroducedMusicXmlStructuralIssues(invalid, invalid)).toEqual([]);
    expect(
      findIntroducedMusicXmlStructuralIssues(
        score('<note><rest/><duration>4</duration></note>'),
        invalid,
      ),
    ).toHaveLength(1);
  });
});
