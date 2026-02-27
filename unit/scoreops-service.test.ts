import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  let nextId = 1;
  const artifacts = new Map<string, Record<string, unknown>>();
  const createFakeWasmScore = (initialXml: string) => {
    let xml = initialXml;
    let selectedMeasure = 1;
    const updateSelectedMeasure = (updater: (measureXml: string) => string) => {
      const measureRegex = new RegExp(`(<measure\\\\b[^>]*number=\"${selectedMeasure}\"[^>]*>[\\\\s\\\\S]*?<\\\\/measure>)`, 'i');
      const match = xml.match(measureRegex);
      if (!match) {
        return;
      }
      const next = updater(match[1]);
      xml = xml.replace(measureRegex, next);
    };
    return {
      destroy: vi.fn(),
      relayout: vi.fn(async () => undefined),
      saveXml: vi.fn(async () => new TextEncoder().encode(xml)),
      selectPartMeasureByIndex: vi.fn(async (_partIndex: number, measureIndex: number) => {
        selectedMeasure = measureIndex + 1;
      }),
      setKeySignature: vi.fn(async (fifths: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/(<fifths>)-?\d+(<\/fifths>)/i, `$1${fifths}$2`));
      }),
      setTitleText: vi.fn(async (title: string) => {
        xml = xml.replace(/<movement-title>[\s\S]*?<\/movement-title>/i, `<movement-title>${title}</movement-title>`);
      }),
      setTimeSignature: vi.fn(async (numerator: number, denominator: number) => {
        updateSelectedMeasure((measureXml) => (
          measureXml
            .replace(/(<beats>)\d+(<\/beats>)/i, `$1${numerator}$2`)
            .replace(/(<beat-type>)\d+(<\/beat-type>)/i, `$1${denominator}$2`)
        ));
      }),
      setClef: vi.fn(async (clefType: number) => {
        const map: Record<number, { sign: string; line: string }> = {
          0: { sign: 'G', line: '2' },
          20: { sign: 'F', line: '4' },
          10: { sign: 'C', line: '3' },
          11: { sign: 'C', line: '4' },
        };
        const target = map[clefType] || map[0];
        updateSelectedMeasure((measureXml) => (
          measureXml
            .replace(/(<clef>[\s\S]*?<sign>)[A-Z](<\/sign>)/i, `$1${target.sign}$2`)
            .replace(/(<clef>[\s\S]*?<line>)\d+(<\/line>)/i, `$1${target.line}$2`)
        ));
      }),
    };
  };
  return {
    artifacts,
    loadWebMscoreInProcess: vi.fn(async () => ({
      load: vi.fn(async (_format: string, data: Uint8Array) => createFakeWasmScore(new TextDecoder().decode(data))),
    })),
    createScoreArtifact: vi.fn(async (input: Record<string, unknown>) => {
      const id = `art-${nextId++}`;
      const artifact = {
        id,
        kind: 'score-artifact@1',
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        ...input,
      };
      artifacts.set(id, artifact);
      return artifact;
    }),
    getScoreArtifact: vi.fn(async (id: string) => artifacts.get(id) || null),
    summarizeScoreArtifact: vi.fn((artifact: Record<string, unknown>) => ({
      id: artifact.id,
      format: artifact.format,
      contentBytes: typeof artifact.content === 'string' ? artifact.content.length : 0,
      contentPreview: typeof artifact.content === 'string' ? artifact.content.slice(0, 80) : '',
    })),
    reset: () => {
      artifacts.clear();
      nextId = 1;
    },
  };
});

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

vi.mock('../lib/webmscore-loader', () => ({
  loadWebMscoreInProcess: mocked.loadWebMscoreInProcess,
}));

import { runMusicScoreOpsPromptService, runMusicScoreOpsService, __scoreOpsTestOnly } from '../lib/music-services/scoreops-service';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <movement-title>Original Title</movement-title>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

describe('runMusicScoreOpsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.reset();
    __scoreOpsTestOnly.clearSessions();
  });

  it('returns normalized invalid_request errors for bad payloads', async () => {
    const result = await runMusicScoreOpsService({ action: 'apply', content: SAMPLE_XML }, 'apply');
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
      },
    });
  });

  it('opens, inspects, and applies deterministic operations', async () => {
    const open = await runMusicScoreOpsService({
      action: 'open',
      content: SAMPLE_XML,
    }, 'open');
    expect(open.status).toBe(200);
    const scoreSessionId = String(open.body.scoreSessionId);

    const inspect = await runMusicScoreOpsService({
      action: 'inspect',
      scoreSessionId,
      include: { capabilities: true, scoreSummary: true },
    }, 'inspect');
    expect(inspect.status).toBe(200);
    expect(inspect.body).toMatchObject({
      ok: true,
      scoreSessionId,
      capabilities: {
        ops: expect.arrayContaining(['set_key_signature', 'set_time_signature', 'set_clef']),
      },
      scoreSummary: {
        measureCountEstimate: 2,
      },
    });

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [
        { op: 'set_key_signature', fifths: 1 },
        { op: 'set_time_signature', numerator: 3, denominator: 4 },
        { op: 'set_clef', clef: 'treble' },
      ],
      options: { includeXml: true, includePatch: true },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      baseRevision: 0,
      newRevision: 1,
      patchMode: 'op-derived',
    });

    const output = (apply.body.output as { content?: string })?.content || '';
    expect(output).toContain('<fifths>1</fifths>');
    expect(output).toContain('<beats>3</beats>');
    expect(output).toContain('<beat-type>4</beat-type>');
    expect(output).toContain('<clef><sign>G</sign><line>2</line></clef>');

    const patch = apply.body.patch as { format?: string; ops?: Array<{ op: string; path: string; value?: string }> };
    expect(patch.format).toBe('musicxml-patch@1');
    expect(Array.isArray(patch.ops)).toBe(true);
    expect(patch.ops?.some((op) => op.path.includes('/attributes/key/fifths') && op.value === '1')).toBe(true);
    expect(patch.ops?.some((op) => op.path.includes('/attributes/time/beats') && op.value === '3')).toBe(true);
  });

  it('returns stale_revision when baseRevision does not match latest', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const first = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'set_metadata_text', field: 'title', value: 'Updated' }],
    }, 'apply');
    expect(first.status).toBe(200);

    const stale = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'set_metadata_text', field: 'title', value: 'Again' }],
    }, 'apply');

    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      ok: false,
      error: {
        code: 'stale_revision',
      },
    });
  });

  it('rolls back atomically when one op fails', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [
        { op: 'set_metadata_text', field: 'title', value: 'Rollback Candidate' },
        { op: 'remove_measures', scope: { measureStart: 99, measureEnd: 100 } },
      ],
      options: { atomic: true },
    }, 'apply');

    expect(apply.status).toBe(422);
    expect(apply.body).toMatchObject({
      ok: false,
      error: {
        code: 'execution_failure',
      },
    });

    const inspect = await runMusicScoreOpsService({
      action: 'inspect',
      scoreSessionId,
      include: { scoreSummary: true },
    }, 'inspect');

    expect(inspect.status).toBe(200);
    expect(inspect.body).toMatchObject({ revision: 0 });
  });

  it('maps prompts to scoreops and returns execution output', async () => {
    const result = await runMusicScoreOpsPromptService({
      prompt: 'Change key signature to G major and remove the text "Original"',
      content: SAMPLE_XML,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      mode: 'scoreops-heuristic',
      planner: {
        parsedOps: expect.any(Array),
      },
      execution: {
        ok: true,
      },
    });

    const execution = result.body.execution as { output?: { content?: string } };
    expect(execution.output?.content || '').toContain('<fifths>1</fifths>');
  });

  it('decomposes multi-step prompts and reports unsupported steps explicitly', async () => {
    const result = await runMusicScoreOpsPromptService({
      prompt: '1. Change key signature to G major, 2. Remove the text "Original Title", 3. Fix weird beaming in measures 29-30',
      content: SAMPLE_XML,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      planner: {
        mode: 'heuristic-v2',
        supportedSteps: expect.any(Array),
        unsupportedSteps: expect.any(Array),
      },
    });
    const planner = result.body.planner as {
      supportedSteps?: Array<Record<string, unknown>>;
      unsupportedSteps?: Array<{ text?: string; reason?: string }>;
    };
    expect((planner.supportedSteps || []).length).toBeGreaterThan(0);
    expect((planner.unsupportedSteps || []).some((step) => (
      `${step.text || ''} ${step.reason || ''}`.toLowerCase().includes('beaming')
    ))).toBe(true);
  });

  it('returns structured unsupported-step details when no operations can be mapped', async () => {
    const result = await runMusicScoreOpsPromptService({
      prompt: 'Please fix weird voicing and normalize beaming in bars 10-12.',
      content: SAMPLE_XML,
    });

    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'unsupported_op',
        details: {
          planner: {
            mode: 'heuristic-v2',
            unsupportedSteps: expect.any(Array),
          },
        },
      },
    });
  });

  it('falls back to measure-diff patch when op emitter is unavailable', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [
        { op: 'insert_measures', count: 1, target: 'after_measure', afterMeasure: 1 },
      ],
      options: { includePatch: true, includeXml: true },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      patchMode: 'measure-diff-fallback',
    });
    const patch = apply.body.patch as { format?: string; ops?: Array<{ op: string; path: string }> };
    expect(patch.format).toBe('musicxml-patch@1');
    expect((patch.ops || []).length).toBeGreaterThan(0);
  });

  it('uses wasm executor when requested and available', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [
        { op: 'set_metadata_text', field: 'title', value: 'Updated via WASM' },
      ],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: {
        preferred: 'wasm',
        selected: 'wasm',
      },
    });
    const output = (apply.body.output as { content?: string })?.content || '';
    expect(output).toContain('<movement-title>Updated via WASM</movement-title>');
    expect(mocked.loadWebMscoreInProcess).toHaveBeenCalledTimes(1);
  });

  it('falls back to xml executor when wasm cannot handle operation', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [
        { op: 'delete_text_by_content', text: 'Original', maxDeletes: 10 },
      ],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: {
        preferred: 'wasm',
        selected: 'xml',
        usedFallback: true,
      },
    });
    const output = (apply.body.output as { content?: string })?.content || '';
    expect(output.includes('Original')).toBe(false);
  });
});
