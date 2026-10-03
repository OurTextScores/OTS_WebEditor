// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  decodeXmlData,
  extractMeasureSignaturesFromXml,
  normalizeXmlData,
  replaceMeasuresInMusicXml,
} from '../../components/score-editor/musicxml';

const note = (step: string, attrs = '') =>
  `<note${attrs}><pitch><step>${step}</step></pitch></note>`;
const score = (...measures: string[]) =>
  `<score-partwise><part id="P1">${measures.join('')}</part></score-partwise>`;

describe('extractMeasureSignaturesFromXml', () => {
  it('canonicalises each measure of each part', () => {
    const signatures = extractMeasureSignaturesFromXml(
      score(
        `<measure number="1">${note('C')}</measure>`,
        `<measure number="2">${note('D')}</measure>`,
      ),
    );
    expect(signatures).toEqual([
      [
        '<measure><note><pitch><step>#C</step></pitch></note></measure>',
        '<measure><note><pitch><step>#D</step></pitch></note></measure>',
      ],
    ]);
  });

  it('ignores layout, numbering and positioning so only the music is compared', () => {
    const plain = extractMeasureSignaturesFromXml(
      score(`<measure number="1">${note('C')}</measure>`),
    );
    const decorated = extractMeasureSignaturesFromXml(
      score(
        `<measure number="7" width="200"><print new-system="yes"/>${note('C', ' default-x="12" color="#f00" font-size="9"')}</measure>`,
      ),
    );
    expect(decorated).toEqual(plain);
  });

  it('keeps attributes that change the music', () => {
    const [[a]] = extractMeasureSignaturesFromXml(
      score(`<measure>${note('C', ' dynamics="40"')}</measure>`),
    );
    const [[b]] = extractMeasureSignaturesFromXml(score(`<measure>${note('C')}</measure>`));
    expect(a).not.toBe(b);
    expect(a).toContain('dynamics=40');
  });

  it('collapses whitespace in text', () => {
    const [[a]] = extractMeasureSignaturesFromXml(
      score('<measure><words>  a \n  b </words></measure>'),
    );
    expect(a).toBe('<measure><words>#a b</words></measure>');
  });

  it('reads one list per staff from a MuseScore file, without layout breaks', () => {
    const mscx =
      '<museScore><Score><Staff id="1"><Measure><LayoutBreak><subtype>line</subtype></LayoutBreak>' +
      '<voice><Chord><durationType>quarter</durationType></Chord></voice></Measure></Staff>' +
      '<Staff id="2"><Measure/><Measure/></Staff></Score></museScore>';
    expect(extractMeasureSignaturesFromXml(mscx)).toEqual([
      ['<Measure><voice><Chord><durationType>#quarter</durationType></Chord></voice></Measure>'],
      ['<Measure></Measure>', '<Measure></Measure>'],
    ]);
  });

  it('throws on invalid XML', () => {
    expect(() => extractMeasureSignaturesFromXml('<a>')).toThrow('Invalid MusicXML');
  });
});

describe('replaceMeasuresInMusicXml', () => {
  const source = score(
    `<measure number="1">${note('C')}</measure>`,
    `<measure number="2">${note('D')}</measure>`,
  );
  const target = score(
    `<measure number="1">${note('E')}</measure>`,
    `<measure number="2">${note('F')}</measure>`,
  );
  const steps = (xml: string) =>
    Array.from(
      new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('step'),
    ).map((s) => s.textContent);
  const numbers = (xml: string) =>
    Array.from(
      new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('measure'),
    ).map((m) => m.getAttribute('number'));

  it('copies a source measure over a target measure and keeps the target numbering', () => {
    const result = replaceMeasuresInMusicXml(source, target, 0, [
      { sourceIndex: 1, targetIndex: 0 },
    ]);
    expect(result.error).toBe('');
    expect(steps(result.xml)).toEqual(['D', 'F']);
    expect(numbers(result.xml)).toEqual(['1', '2']);
  });

  it('applies several replacements', () => {
    const result = replaceMeasuresInMusicXml(source, target, 0, [
      { sourceIndex: 0, targetIndex: 1 },
      { sourceIndex: 1, targetIndex: 0 },
    ]);
    expect(steps(result.xml)).toEqual(['D', 'C']);
  });

  it('reports empty, invalid and missing input', () => {
    expect(replaceMeasuresInMusicXml('', target, 0, [])).toEqual({
      xml: '',
      error: 'MusicXML content is empty.',
    });
    expect(replaceMeasuresInMusicXml('<a>', target, 0, []).error).toBe(
      'MusicXML is not valid XML.',
    );
    const missing = 'Measure not found for the selected part/index.';
    expect(
      replaceMeasuresInMusicXml(source, target, 0, [{ sourceIndex: 5, targetIndex: 0 }]).error,
    ).toBe(missing);
    expect(
      replaceMeasuresInMusicXml(source, target, 3, [{ sourceIndex: 0, targetIndex: 0 }]).error,
    ).toBe(missing);
  });
});

describe('normalizeXmlData and decodeXmlData', () => {
  it('accepts bytes, buffers, views, strings and blobs', async () => {
    const bytes = new Uint8Array([60, 97, 62]);
    expect(await normalizeXmlData(bytes)).toBe(bytes);
    expect(Array.from((await normalizeXmlData(bytes.buffer))!)).toEqual([60, 97, 62]);
    expect(Array.from((await normalizeXmlData(new DataView(bytes.buffer, 1, 1)))!)).toEqual([97]);
    expect(Array.from((await normalizeXmlData('<a>'))!)).toEqual([60, 97, 62]);
    expect(Array.from((await normalizeXmlData(new Blob(['<a>'])))!)).toEqual([60, 97, 62]);
  });

  it('returns null for nothing or for an unexpected type', async () => {
    expect(await normalizeXmlData(null)).toBeNull();
    expect(await normalizeXmlData(0)).toBeNull();
    expect(await normalizeXmlData({})).toBeNull();
  });

  it('decodes to text, and passes null through', async () => {
    expect(await decodeXmlData(new TextEncoder().encode('héllo'))).toBe('héllo');
    expect(await decodeXmlData(undefined)).toBeNull();
  });
});
