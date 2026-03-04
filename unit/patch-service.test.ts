import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  getScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/score-artifacts', () => ({
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import { applyMusicXmlPatch, parseMusicXmlPatch, runMusicPatchService } from '../lib/music-services/patch-service';

describe('runMusicPatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it('returns 400 when prompt is missing', async () => {
    const result = await runMusicPatchService({
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing prompt for music patch generation.',
    });
  });

  it('returns dry-run response without calling OpenAI', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await runMusicPatchService({
      prompt: 'Change key signature to G major',
      content: '<score-partwise version="4.0"></score-partwise>',
      dryRun: true,
      model: 'gpt-5.2',
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ready: false,
      request: {
        model: 'gpt-5.2',
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when no API key is provided for non-dry-run requests', async () => {
    const result = await runMusicPatchService({
      prompt: 'Remove CLEAN VERSION text',
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing OpenAI API key for music patch generation.',
    });
  });

  it('returns 422 when model response is not a patch payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [{ type: 'message', content: [{ text: '{"oops":true}' }] }],
      }),
    } as Response);

    const result = await runMusicPatchService({
      prompt: 'Fix beaming in measure 29',
      content: '<score-partwise version="4.0"></score-partwise>',
      apiKey: 'sk-test',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      error: 'Model response is not a musicxml-patch@1 payload.',
      retried: true,
    });
  });

  it('returns parsed patch for successful OpenAI responses output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [{
          type: 'message',
          content: [{
            text: '{"format":"musicxml-patch@1","ops":[{"op":"setText","path":"/score-partwise/part[@id=\\"P1\\"]/measure[@number=\\"1\\"]/attributes/key/fifths","value":"1"}]}',
          }],
        }],
      }),
    } as Response);

    const result = await runMusicPatchService({
      prompt: 'Change key signature to G major',
      content: '<score-partwise version="4.0"></score-partwise>',
      apiKey: 'sk-test',
      model: 'gpt-5.2',
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      mode: 'openai-responses',
      model: 'gpt-5.2',
      patch: {
        format: 'musicxml-patch@1',
        ops: [
          {
            op: 'setText',
            path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/attributes/key/fifths',
            value: '1',
          },
        ],
      },
    });
  });
});

describe('applyMusicXmlPatch', () => {
  it('creates missing measure attributes chain for clef setText targets', async () => {
    const baseXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

    const patch = {
      format: 'musicxml-patch@1' as const,
      ops: [
        {
          op: 'setText' as const,
          path: '/score-partwise/part[@id="P1"]/measure[@number="2"]/attributes/clef/sign',
          value: 'G',
        },
        {
          op: 'setText' as const,
          path: '/score-partwise/part[@id="P1"]/measure[@number="2"]/attributes/clef/line',
          value: '2',
        },
      ],
    };

    const result = await applyMusicXmlPatch(baseXml, patch);

    expect(result.error).toBe('');
    expect(result.xml).toContain('<measure number="1">');
    expect(result.xml).toContain('<fifths>1</fifths>');
    expect(result.xml).toMatch(
      /<measure number="2">[\s\S]*?<attributes><clef><sign>G<\/sign><line>2<\/line><\/clef><\/attributes>/,
    );
  });
});

describe('parseMusicXmlPatch', () => {
  it('rejects replace values with multiple top-level elements', () => {
    const payload = JSON.stringify({
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'replace',
          path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]',
          value: '<note><pitch><step>C</step><octave>4</octave></pitch></note><backup><duration>1</duration></backup>',
        },
      ],
    });
    const parsed = parseMusicXmlPatch(payload);
    expect(parsed.patch).toBeNull();
    expect(parsed.error).toContain('expected exactly one');
  });

  it('rejects replace values with top-level text', () => {
    const payload = JSON.stringify({
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'replace',
          path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]',
          value: 'text<note><pitch><step>C</step><octave>4</octave></pitch></note>',
        },
      ],
    });
    const parsed = parseMusicXmlPatch(payload);
    expect(parsed.patch).toBeNull();
    expect(parsed.error).toContain('top-level text');
  });

  it('rejects setText values that contain XML markup', () => {
    const payload = JSON.stringify({
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'setText',
          path: '/score-partwise/part[@id="P1"]/measure[@number="39"]/attributes',
          value: '<clef><sign>G</sign><line>2</line></clef>',
        },
      ],
    });
    const parsed = parseMusicXmlPatch(payload);
    expect(parsed.patch).toBeNull();
    expect(parsed.error).toContain('setText value appears to contain XML');
  });
});
