// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildNewScoreXmlImpl,
  type BuildNewScoreXmlContext,
} from '../../components/score-editor/new-score';

type Options = Parameters<typeof buildNewScoreXmlImpl>[1];

const SINGLE_STAFF = { staves: 1, clefs: [{ staff: 1, clef: 'G' }] };
const PIANO = {
  staves: 2,
  clefs: [
    { staff: 1, clef: 'G' },
    { staff: 2, clef: 'F' },
  ],
};

const ctx = (spec: (id: string) => typeof SINGLE_STAFF = () => SINGLE_STAFF) =>
  ({ resolveInstrumentClefs: (id: string) => spec(id) }) as BuildNewScoreXmlContext;

const build = (over: Partial<Options> = {}, context = ctx()) =>
  buildNewScoreXmlImpl(context, {
    title: 'Sonata',
    composer: 'A. Composer',
    instruments: [{ id: 'violin', name: 'Violin' }],
    measures: 4,
    keyFifths: 2,
    timeNumerator: 3,
    timeDenominator: 4,
    ...over,
  });
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const text = (doc: Document, selector: string) => doc.querySelector(selector)?.textContent;

describe('buildNewScoreXmlImpl', () => {
  it('produces well-formed MusicXML partwise with the title and composer', () => {
    const doc = parse(build());
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.tagName).toBe('score-partwise');
    expect(doc.documentElement.getAttribute('version')).toBe('3.1');
    expect(text(doc, 'work-title')).toBe('Sonata');
    expect(text(doc, 'creator[type="composer"]')).toBe('A. Composer');
  });

  it('escapes special characters in the title, composer and instrument name', () => {
    const doc = parse(
      build({
        title: 'Tom & "Jerry" <1>',
        composer: "O'Brien",
        instruments: [{ id: 'x', name: 'A&B' }],
      }),
    );
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(text(doc, 'work-title')).toBe('Tom & "Jerry" <1>');
    expect(text(doc, 'creator')).toBe("O'Brien");
    expect(text(doc, 'part-name')).toBe('A&B');
  });

  it('leaves out the work and creator lines when there is no title or composer', () => {
    const doc = parse(build({ title: '  ', composer: '' }));
    expect(doc.querySelector('work')).toBeNull();
    expect(doc.querySelector('identification')).toBeNull();
  });

  it('writes one part per instrument, named, with a fallback name', () => {
    const doc = parse(
      build({
        instruments: [
          { id: 'a', name: 'Flute' },
          { id: 'b', name: '   ' },
          { id: 'c', name: 'Cello' },
        ],
      }),
    );
    expect(Array.from(doc.querySelectorAll('score-part')).map((p) => p.getAttribute('id'))).toEqual(
      ['P1', 'P2', 'P3'],
    );
    expect(Array.from(doc.querySelectorAll('part-name')).map((n) => n.textContent)).toEqual([
      'Flute',
      'Instrument',
      'Cello',
    ]);
    expect(doc.querySelectorAll('part')).toHaveLength(3);
  });

  it('writes the requested number of whole-measure rests', () => {
    const doc = parse(build({ measures: 5 }));
    const measures = Array.from(doc.querySelectorAll('part measure'));
    expect(measures.map((m) => m.getAttribute('number'))).toEqual(['1', '2', '3', '4', '5']);
    expect(doc.querySelectorAll('part note rest[measure="yes"]')).toHaveLength(5);
  });

  it('puts the key, time and clef in the first measure only, with a measure length from the time signature', () => {
    const doc = parse(build());
    const measures = Array.from(doc.querySelectorAll('part measure'));
    expect(measures[0].querySelector('attributes')).not.toBeNull();
    expect(measures.slice(1).every((m) => m.querySelector('attributes') === null)).toBe(true);
    expect(text(doc, 'key fifths')).toBe('2');
    expect(text(doc, 'time beats')).toBe('3');
    expect(text(doc, 'time beat-type')).toBe('4');
    expect(text(doc, 'clef sign')).toBe('G');
    // 16 divisions per quarter, 3 quarters
    expect(text(doc, 'note duration')).toBe('48');
    expect(doc.querySelector('staves')).toBeNull();
  });

  it('measures a compound time signature in divisions', () => {
    expect(text(parse(build({ timeNumerator: 6, timeDenominator: 8 })), 'note duration')).toBe(
      '48',
    );
    expect(text(parse(build({ timeNumerator: 4, timeDenominator: 4 })), 'note duration')).toBe(
      '64',
    );
  });

  it('writes two staves with a backup and numbered clefs for a grand-staff instrument', () => {
    const doc = parse(
      build(
        { instruments: [{ id: 'piano', name: 'Piano' }] },
        ctx(() => PIANO),
      ),
    );
    expect(text(doc, 'staves')).toBe('2');
    expect(Array.from(doc.querySelectorAll('clef')).map((c) => c.getAttribute('number'))).toEqual([
      '1',
      '2',
    ]);
    expect(Array.from(doc.querySelectorAll('clef sign')).map((c) => c.textContent)).toEqual([
      'G',
      'F',
    ]);
    const first = doc.querySelector('part measure')!;
    expect(first.querySelectorAll('note')).toHaveLength(2);
    expect(first.querySelector('backup duration')?.textContent).toBe('48');
    expect(Array.from(first.querySelectorAll('note staff')).map((s) => s.textContent)).toEqual([
      '1',
      '2',
    ]);
    // each staff has its own voice
    expect(Array.from(first.querySelectorAll('note voice')).map((v) => v.textContent)).toEqual([
      '1',
      '5',
    ]);
  });

  it('writes each clef from its code: sign, line and octave change, with treble for an unknown code', () => {
    const clef = (code: string) =>
      parse(
        build(
          {},
          ctx(() => ({ staves: 1, clefs: [{ staff: 1, clef: code }] })),
        ),
      );
    const bass8vb = clef('F8vb');
    expect([
      text(bass8vb, 'clef sign'),
      text(bass8vb, 'clef line'),
      text(bass8vb, 'clef-octave-change'),
    ]).toEqual(['F', '4', '-1']);
    const alto = clef('C3');
    expect([text(alto, 'clef sign'), text(alto, 'clef line')]).toEqual(['C', '3']);
    expect(alto.querySelector('clef-octave-change')).toBeNull();
    const perc = clef('PERC');
    expect(text(perc, 'clef sign')).toBe('percussion');
    const unknown = clef('nonsense');
    expect([text(unknown, 'clef sign'), text(unknown, 'clef line')]).toEqual(['G', '2']);
  });

  it('puts a pickup in an implicit measure 0 that carries the attributes, and none on measure 1', () => {
    const doc = parse(build({ pickup: { numerator: 1, denominator: 4 }, timeNumerator: 4 }));
    const measures = Array.from(doc.querySelectorAll('part measure'));
    expect(measures.map((m) => m.getAttribute('number'))).toEqual(['0', '1', '2', '3', '4']);
    expect(measures[0].getAttribute('implicit')).toBe('yes');
    expect(measures[0].querySelector('attributes')).not.toBeNull();
    expect(measures[1].querySelector('attributes')).toBeNull();
    expect(text(doc, 'measure[number="0"] note duration')).toBe('16');
    expect(text(doc, 'measure[number="0"] note type')).toBe('quarter');
    expect(measures[0].querySelector('rest[measure="yes"]')).toBeNull();
  });

  it('sizes the pickup rest from its fraction, including a dotted value', () => {
    const doc = parse(build({ pickup: { numerator: 3, denominator: 8 } }));
    expect(text(doc, 'measure[number="0"] note duration')).toBe('24');
    expect(text(doc, 'measure[number="0"] note type')).toBe('quarter');
  });

  it('gives a pickup measure to every part and every staff', () => {
    const doc = parse(
      build(
        {
          instruments: [
            { id: 'piano', name: 'Piano' },
            { id: 'v', name: 'Violin' },
          ],
          pickup: { numerator: 1, denominator: 4 },
        },
        ctx((id) => (id === 'piano' ? PIANO : SINGLE_STAFF)),
      ),
    );
    const parts = Array.from(doc.querySelectorAll('part'));
    expect(parts.map((p) => p.querySelectorAll('measure[number="0"] note').length)).toEqual([2, 1]);
  });

  it('asks for the clefs of each instrument by id and name', () => {
    const asked: Array<[string, string]> = [];
    build(
      { instruments: [{ id: 'violin', name: ' Violin ' }] },
      {
        resolveInstrumentClefs: (id: string, name: string) => (
          asked.push([id, name]),
          SINGLE_STAFF
        ),
      },
    );
    expect(asked).toEqual([['violin', 'Violin']]);
  });
});
