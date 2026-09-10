import { describe, expect, it } from 'vitest';
import { isZipArchive, readZipEntryNames } from '../lib/zip-central-directory';
import { detectScoreInputFormat } from '../lib/public-score-url';

/**
 * Builds a real STORE-only ZIP so the tests exercise archive bytes, not a mock. Entry
 * contents matter as much as names here: the defect being fixed matched a needle
 * anywhere in the file, including inside entry data.
 */
const buildZip = (entries: { name: string; content: string }[]): Uint8Array => {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const content = encoder.encode(entry.content);

    const local = new Uint8Array(30 + name.length + content.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(18, content.length, true); // compressed size
    localView.setUint32(22, content.length, true); // uncompressed size
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(content, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true); // local header offset
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, eocd];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
};

describe('readZipEntryNames', () => {
  it('lists entry names from the central directory', () => {
    const zip = buildZip([
      { name: 'META-INF/container.xml', content: '<container/>' },
      { name: 'score.xml', content: '<score-partwise/>' },
    ]);

    expect(readZipEntryNames(zip)).toEqual(['META-INF/container.xml', 'score.xml']);
  });

  it('returns null for bytes that only look like a ZIP', () => {
    expect(readZipEntryNames(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull();
  });

  it('returns null for a truncated archive rather than guessing', () => {
    const zip = buildZip([{ name: 'score.xml', content: '<score-partwise/>' }]);

    expect(readZipEntryNames(zip.subarray(0, zip.length - 10))).toBeNull();
  });

  it('recognises the ZIP magic without parsing', () => {
    expect(isZipArchive(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(isZipArchive(new TextEncoder().encode('<score-partwise/>'))).toBe(false);
  });
});

describe('detectScoreInputFormat, archive contents', () => {
  it('identifies an MSCZ by a real .mscx entry', () => {
    const zip = buildZip([
      { name: 'META-INF/container.xml', content: '<container/>' },
      { name: 'Nocturne.mscx', content: '<museScore/>' },
    ]);

    expect(detectScoreInputFormat('https://example.test/download', zip)).toBe('mscz');
  });

  it('identifies an MXL with no .mscx entry', () => {
    const zip = buildZip([
      { name: 'META-INF/container.xml', content: '<container/>' },
      { name: 'score.xml', content: '<score-partwise/>' },
    ]);

    expect(detectScoreInputFormat('https://example.test/download', zip)).toBe('mxl');
  });

  it('does not call an MXL a MuseScore file because a name merely contains .mscx', () => {
    // The L4 false positive. A folder or file whose *name* contains the substring
    // decided the format, because the old check scanned for it anywhere.
    const zip = buildZip([
      { name: 'META-INF/container.xml', content: '<container/>' },
      { name: 'exported.mscx.backup/score.xml', content: '<score-partwise/>' },
    ]);

    expect(detectScoreInputFormat('https://example.test/download', zip)).toBe('mxl');
  });

  it('does not let entry *contents* decide the format', () => {
    // The stronger half of the same defect: the needle was matched against every
    // byte, so a MusicXML file that merely mentions ".mscx" was read as MuseScore.
    const zip = buildZip([
      { name: 'META-INF/container.xml', content: '<container/>' },
      {
        name: 'score.xml',
        content: '<score-partwise><!-- converted from song.mscx --></score-partwise>',
      },
    ]);

    expect(detectScoreInputFormat('https://example.test/download', zip)).toBe('mxl');
  });

  it('still trusts the file extension when there is one', () => {
    const zip = buildZip([{ name: 'score.xml', content: '<score-partwise/>' }]);

    expect(detectScoreInputFormat('https://example.test/piece.mscz', zip)).toBe('mscz');
    expect(detectScoreInputFormat('https://example.test/piece.mxl', zip)).toBe('mxl');
  });

  it('reads plain XML without touching the archive path', () => {
    const xml = new TextEncoder().encode('<?xml version="1.0"?><score-partwise version="4.0"/>');

    expect(detectScoreInputFormat('https://example.test/download', xml)).toBe('musicxml');
  });

  it('scales to a large archive without scanning its body', () => {
    // 8 MB of payload whose bytes spell the needle repeatedly. The old scan walked
    // all of it, twice in the worst case, on the main thread — and got the answer
    // wrong. Reading the directory is bounded and correct.
    const zip = buildZip([
      { name: 'META-INF/container.xml', content: '<container/>' },
      {
        name: 'score.xml',
        content: `<score-partwise>${'.mscx'.repeat(1_600_000)}</score-partwise>`,
      },
    ]);
    expect(zip.byteLength).toBeGreaterThan(8_000_000);

    const started = performance.now();
    const format = detectScoreInputFormat('https://example.test/download', zip);
    const elapsed = performance.now() - started;

    expect(format).toBe('mxl');
    // Generous bound: the point is that it does not depend on payload size.
    expect(elapsed).toBeLessThan(250);
  });
});
