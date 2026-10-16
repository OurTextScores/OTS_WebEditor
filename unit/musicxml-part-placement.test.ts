import { describe, expect, it } from 'vitest';
import { placeMusicXmlPartsAtMeasure, type ScoreMeasure } from '../lib/musicxml-part-placement';

const sig = (numerator: number, denominator: number) => ({ numerator, denominator });
const bar = (n: number, d: number, actual = sig(n, d)): ScoreMeasure => ({
  actual,
  nominal: sig(n, d),
});

const GENERATED = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>1920</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const measuresOf = (xml: string) => Array.from(parse(xml).querySelectorAll('part > measure'));

describe('placeMusicXmlPartsAtMeasure', () => {
  it('pads with rest bars before and after the generated bars', () => {
    const score = [bar(4, 4), bar(4, 4), bar(4, 4), bar(4, 4), bar(4, 4)];
    const result = placeMusicXmlPartsAtMeasure(GENERATED, score, 2);
    const measures = measuresOf(result.xml);

    expect(measures.map((m) => m.getAttribute('number'))).toEqual(['1', '2', '3', '4', '5']);
    expect(result.placedMeasureCount).toBe(2);
    // Bar 1: rest with the part's clef, key, divisions and the opening time signature.
    expect(measures[0].querySelector('attributes divisions')?.textContent).toBe('480');
    expect(measures[0].querySelector('attributes clef sign')?.textContent).toBe('G');
    expect(measures[0].querySelector('attributes time beats')?.textContent).toBe('4');
    expect(measures[0].querySelector('note rest')?.getAttribute('measure')).toBe('yes');
    expect(measures[0].querySelector('note duration')?.textContent).toBe('1920');
    // Generated bars land at bars 3-4 without restating clef/key.
    expect(measures[2].querySelector('pitch step')?.textContent).toBe('C');
    expect(measures[2].querySelector('attributes')).toBeNull();
    expect(measures[3].querySelector('pitch step')?.textContent).toBe('G');
    expect(measures[4].querySelector('note rest')).not.toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('numbers a pickup as bar 0 and sizes its rest to the pickup', () => {
    const score = [bar(4, 4, sig(1, 4)), bar(4, 4), bar(4, 4)];
    const result = placeMusicXmlPartsAtMeasure(GENERATED, score, 1);
    const measures = measuresOf(result.xml);
    expect(measures.map((m) => m.getAttribute('number'))).toEqual(['0', '1', '2']);
    expect(measures[0].getAttribute('implicit')).toBe('yes');
    expect(measures[0].querySelector('note duration')?.textContent).toBe('480');
  });

  it('restates a time-signature change in the rest bars and drops bars past the end', () => {
    const score = [bar(3, 4), bar(4, 4), bar(4, 4)];
    const result = placeMusicXmlPartsAtMeasure(GENERATED, score, 2);
    const measures = measuresOf(result.xml);
    expect(measures).toHaveLength(3);
    expect(measures[0].querySelector('time beats')?.textContent).toBe('3');
    expect(measures[0].querySelector('note duration')?.textContent).toBe('1440');
    expect(measures[1].querySelector('time beats')?.textContent).toBe('4');
    expect(measures[2].querySelector('pitch step')?.textContent).toBe('C');
    expect(result.warnings.join(' ')).toMatch(/Dropped 1 generated bar/);
  });

  it('writes a rest on each staff of a grand-staff part', () => {
    const grand = GENERATED.replace('<clef>', '<staves>2</staves><clef>');
    const measures = measuresOf(
      placeMusicXmlPartsAtMeasure(grand, [bar(4, 4), bar(4, 4), bar(4, 4)], 1).xml,
    );
    const rests = Array.from(measures[0].querySelectorAll('note'));
    expect(rests.map((n) => n.querySelector('staff')?.textContent)).toEqual(['1', '2']);
    expect(measures[0].querySelector('backup duration')?.textContent).toBe('1920');
  });

  it('rejects a start outside the score', () => {
    expect(() => placeMusicXmlPartsAtMeasure(GENERATED, [bar(4, 4)], 3)).toThrow(
      /outside the score/,
    );
  });
});
