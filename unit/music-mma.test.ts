import { afterEach, describe, expect, it } from 'vitest';
import { buildStarterTemplateFromXml, validateMmaScript } from '../lib/music-mma';

const XML_WITH_HARMONY = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>2</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <sound tempo="92" />
      <harmony>
        <root><root-step>D</root-step></root>
        <kind text="maj7">major-seventh</kind>
      </harmony>
    </measure>
    <measure number="2">
      <harmony>
        <root><root-step>A</root-step></root>
        <kind>dominant</kind>
      </harmony>
    </measure>
  </part>
</score-partwise>`;

const XML_WITHOUT_HARMONY = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes></measure>
    <measure number="2" />
  </part>
</score-partwise>`;

describe('music-mma helpers', () => {
  const originalMaxScriptBytes = process.env.MUSIC_MMA_MAX_SCRIPT_BYTES;

  afterEach(() => {
    if (originalMaxScriptBytes === undefined) {
      delete process.env.MUSIC_MMA_MAX_SCRIPT_BYTES;
    } else {
      process.env.MUSIC_MMA_MAX_SCRIPT_BYTES = originalMaxScriptBytes;
    }
  });

  it('builds an MMA starter template from MusicXML harmony/meter/key/tempo', () => {
    const result = buildStarterTemplateFromXml(XML_WITH_HARMONY, {
      maxMeasures: 8,
      defaultGroove: 'BossaNova',
    });

    expect(result.warnings).toEqual([]);
    expect(result.analysis).toMatchObject({
      meter: '3/4',
      key: 'D',
      tempo: 92,
      measureCount: 2,
      harmonyMeasureCount: 2,
    });
    expect(result.analysis.harmonyCoverage).toBe(1);
    expect(result.template).toContain('TimeSig 3 4');
    expect(result.template).toContain('KeySig D');
    expect(result.template).toContain('Tempo 92');
    expect(result.template).toContain('Groove BossaNova');
    expect(result.template).toContain('1  Dmaj7 | A7 |');
  });

  it('falls back to placeholder chords and warning when no harmony tags exist', () => {
    const result = buildStarterTemplateFromXml(XML_WITHOUT_HARMONY, { maxMeasures: 4 });

    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('No <harmony> tags');
    expect(result.analysis.harmonyMeasureCount).toBe(0);
    expect(result.template).toContain('1  C | C |');
  });

  it('validates empty and oversized scripts', () => {
    process.env.MUSIC_MMA_MAX_SCRIPT_BYTES = '8';

    const empty = validateMmaScript('   ');
    expect(empty.ok).toBe(false);
    expect(empty.error).toContain('empty');

    const oversized = validateMmaScript('Tempo 120\nGroove Swing\n1 C | F | G7 | C |\n');
    expect(oversized.ok).toBe(false);
    expect(oversized.error).toContain('exceeds size limit');
  });
});
