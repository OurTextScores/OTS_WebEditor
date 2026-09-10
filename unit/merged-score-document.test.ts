import { describe, expect, it } from 'vitest';
import {
  measureCount,
  withoutDoctype,
  withoutSystemBreaks,
} from '../components/score-editor/compare/useMergedScoreDocument';
import { withForcedSystemBreaks } from '../components/score-editor/compare/ScannerSystemRows';
import { decodeScoreXml } from '../lib/webmscore-loader';

const score = (measures: number) => `<?xml version="1.0"?>
<score-partwise version="4.0"><part-list><score-part id="P1"/></part-list><part id="P1">${Array.from(
  { length: measures },
  (_value, index) => `<measure number="${index + 1}"><note/></measure>`,
).join('')}</part></score-partwise>`;

describe('withoutSystemBreaks', () => {
  it("does not save the scan page's line breaks into the work", () => {
    // The rows are a way of reading a scanned page. Persisting them would
    // push that page's engraving into a score nobody asked to lay out that
    // way — and the reviewer never chose those breaks in the first place.
    const reflowed = withForcedSystemBreaks(score(6), [0, 2, 4]);
    expect(reflowed).toContain('new-system="yes"');

    const saved = withoutSystemBreaks(reflowed);
    expect(saved).not.toContain('new-system');
    // Round-trips: the same document can be reflowed again on reload.
    expect(measureCount(saved)).toBe(6);
  });

  it('keeps a print element that carries more than a break', () => {
    const withLayout = `<?xml version="1.0"?>
<score-partwise version="4.0"><part-list><score-part id="P1"/></part-list><part id="P1">
<measure number="1"><print new-system="yes"><staff-layout><staff-distance>80</staff-distance></staff-layout></print><note/></measure>
</part></score-partwise>`;
    const saved = withoutSystemBreaks(withLayout);
    expect(saved).not.toContain('new-system');
    expect(saved).toContain('staff-distance');
  });

  it('leaves malformed input alone rather than throwing', () => {
    expect(withoutSystemBreaks('<not-xml')).toBe('<not-xml');
  });
});

describe('measureCount', () => {
  it('counts the first part, so an inserted bar can be noticed', () => {
    expect(measureCount(score(4))).toBe(4);
    // Row-to-measure mapping is by index, so a document that gained a bar
    // no longer lines up with the scan's systems.
    expect(measureCount(score(5))).not.toBe(measureCount(score(4)));
  });

  it('returns zero rather than throwing on unusable input', () => {
    expect(measureCount('<not-xml')).toBe(0);
    expect(measureCount('<score-partwise/>')).toBe(0);
  });
});

describe('decodeScoreXml', () => {
  it('accepts a typed array from another realm', async () => {
    // The bug this exists for: inside the embed iframe the bytes come from
    // the WASM realm, so `value instanceof Uint8Array` is false even though
    // the value is a perfectly good typed array. TextDecoder then refuses
    // it, and the only symptom is a save that silently does nothing.
    const bytes = new TextEncoder().encode('<score-partwise/>');
    expect(await decodeScoreXml(bytes)).toBe('<score-partwise/>');
    // jsdom reproduces the realm split on its own: this buffer fails
    // `instanceof ArrayBuffer` here, which is why the check is by brand.
    expect(await decodeScoreXml(bytes.buffer)).toBe('<score-partwise/>');

    // A view that is not `instanceof Uint8Array` in this realm.
    const offset = new Uint8Array(bytes.byteLength + 4);
    offset.set(bytes, 4);
    const view = new Uint8Array(offset.buffer, 4, bytes.byteLength);
    expect(await decodeScoreXml(view)).toBe('<score-partwise/>');
  });

  it('passes a string through and refuses what it cannot read', async () => {
    expect(await decodeScoreXml('<score-partwise/>')).toBe('<score-partwise/>');
    await expect(decodeScoreXml({ nope: true })).rejects.toThrow(/unsupported MusicXML/);
  });
});

describe('withoutDoctype', () => {
  it('drops the DTD reference MuseScore exports', () => {
    // The scanner refuses any document with a DOCTYPE — an XXE control it
    // shares with provider-output validation, so the client drops the
    // pointer rather than the server relaxing the rule. Before this, every
    // save came back "That merged score is not usable MusicXML".
    const exported =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ' +
      '"http://www.musicxml.org/dtds/partwise.dtd">\n' +
      '<score-partwise version="4.0"><part-list/></score-partwise>';
    const saved = withoutDoctype(exported);
    expect(saved).not.toMatch(/<!DOCTYPE/i);
    expect(saved).toContain('<?xml version="1.0"');
    expect(saved).toContain('<score-partwise');
  });

  it('drops an internal subset too, rather than leaving a fragment behind', () => {
    const withSubset = '<!DOCTYPE score-partwise [<!ENTITY x "y">]>\n<score-partwise/>';
    expect(withoutDoctype(withSubset)).toBe('<score-partwise/>');
  });

  it('leaves a document that has none alone', () => {
    const plain = '<?xml version="1.0"?><score-partwise/>';
    expect(withoutDoctype(plain)).toBe(plain);
  });
});
