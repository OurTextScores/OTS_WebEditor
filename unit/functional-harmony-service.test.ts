import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import { runFunctionalHarmonyAnalyzeService } from '../lib/music-services/functional-harmony-service';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;

describe('functional harmony service', () => {
  const originalPython = process.env.MUSIC_FUNCTIONAL_HARMONY_PYTHON;
  const originalScript = process.env.MUSIC_FUNCTIONAL_HARMONY_SCRIPT;

  afterEach(() => {
    mocked.createScoreArtifact.mockReset();
    if (originalPython === undefined) {
      delete process.env.MUSIC_FUNCTIONAL_HARMONY_PYTHON;
    } else {
      process.env.MUSIC_FUNCTIONAL_HARMONY_PYTHON = originalPython;
    }
    if (originalScript === undefined) {
      delete process.env.MUSIC_FUNCTIONAL_HARMONY_SCRIPT;
    } else {
      process.env.MUSIC_FUNCTIONAL_HARMONY_SCRIPT = originalScript;
    }
  });

  it('rejects non-MusicXML input', async () => {
    const result = await runFunctionalHarmonyAnalyzeService({ content: 'X:1\nK:C\nCDEF' });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
      },
    });
  });

  it('runs the configured helper and returns functional analysis exports', async () => {
    process.env.MUSIC_FUNCTIONAL_HARMONY_PYTHON = 'python3';
    process.env.MUSIC_FUNCTIONAL_HARMONY_SCRIPT = `${process.cwd()}/unit/fixtures/fake_functional_harmony.py`;

    const result = await runFunctionalHarmonyAnalyzeService({
      content: SAMPLE_XML,
      includeSegments: true,
      includeTextExport: true,
      persistArtifacts: false,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      engine: 'music21-roman',
      analysis: {
        segmentCount: 2,
      },
      annotatedXml: expect.stringContaining('<direction'),
      exports: {
        rntxt: expect.stringContaining('m1 I'),
      },
    });
    expect(result.body).toMatchObject({
      segments: expect.arrayContaining([
        expect.objectContaining({
          romanNumeral: 'I',
        }),
      ]),
    });
    expect(mocked.createScoreArtifact).not.toHaveBeenCalled();
  });

  it('persists json and rntxt artifacts when requested', async () => {
    process.env.MUSIC_FUNCTIONAL_HARMONY_PYTHON = 'python3';
    process.env.MUSIC_FUNCTIONAL_HARMONY_SCRIPT = `${process.cwd()}/unit/fixtures/fake_functional_harmony.py`;
    mocked.createScoreArtifact
      .mockResolvedValueOnce({ id: 'json-1', format: 'json', content: '{}' })
      .mockResolvedValueOnce({ id: 'rntxt-1', format: 'rntxt', content: 'm1 I' })
      .mockResolvedValueOnce({ id: 'xml-1', format: 'musicxml', content: '<score-partwise />' });

    const result = await runFunctionalHarmonyAnalyzeService({
      content: SAMPLE_XML,
      persistArtifacts: true,
    });

    expect(result.status).toBe(200);
    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(3);
    expect(result.body).toMatchObject({
      ok: true,
      artifacts: {
        annotatedXml: { id: 'xml-1', format: 'musicxml' },
        json: { id: 'json-1', format: 'json' },
        rntxt: { id: 'rntxt-1', format: 'rntxt' },
      },
    });
  });
});
