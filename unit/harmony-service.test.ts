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

import { runHarmonyAnalyzeService } from '../lib/music-services/harmony-service';

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
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe('harmony service', () => {
  const originalPython = process.env.MUSIC_HARMONY_PYTHON;
  const originalScript = process.env.MUSIC_HARMONY_SCRIPT;

  afterEach(() => {
    mocked.createScoreArtifact.mockReset();
    if (originalPython === undefined) {
      delete process.env.MUSIC_HARMONY_PYTHON;
    } else {
      process.env.MUSIC_HARMONY_PYTHON = originalPython;
    }
    if (originalScript === undefined) {
      delete process.env.MUSIC_HARMONY_SCRIPT;
    } else {
      process.env.MUSIC_HARMONY_SCRIPT = originalScript;
    }
  });

  it('rejects non-MusicXML input', async () => {
    const result = await runHarmonyAnalyzeService({ content: 'X:1\nK:C\nCDEF' });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
      },
    });
  });

  it('runs the configured helper and returns tagged xml content', async () => {
    process.env.MUSIC_HARMONY_PYTHON = 'python3';
    process.env.MUSIC_HARMONY_SCRIPT = `${process.cwd()}/unit/fixtures/fake_music21_harmony.py`;

    const result = await runHarmonyAnalyzeService({
      content: SAMPLE_XML,
      includeContent: true,
      persistArtifacts: false,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      engine: 'music21',
      analysis: {
        harmonyTagCount: 1,
      },
      content: {
        musicxml: expect.stringContaining('<harmony'),
      },
    });
    expect(mocked.createScoreArtifact).not.toHaveBeenCalled();
  });

  it('persists tagged MusicXML artifact when requested', async () => {
    process.env.MUSIC_HARMONY_PYTHON = 'python3';
    process.env.MUSIC_HARMONY_SCRIPT = `${process.cwd()}/unit/fixtures/fake_music21_harmony.py`;
    mocked.createScoreArtifact.mockResolvedValue({
      id: 'artifact-1',
      format: 'musicxml',
      content: '<score-partwise/>',
    });

    const result = await runHarmonyAnalyzeService({
      content: SAMPLE_XML,
      includeContent: false,
      persistArtifacts: true,
    });

    expect(result.status).toBe(200);
    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(1);
    expect(result.body).toMatchObject({
      ok: true,
      artifacts: {
        outputArtifact: {
          id: 'artifact-1',
          format: 'musicxml',
        },
      },
    });
    expect(result.body).not.toHaveProperty('content');
  });
});
