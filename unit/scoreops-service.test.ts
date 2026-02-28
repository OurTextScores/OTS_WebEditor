import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  let nextId = 1;
  const artifacts = new Map<string, Record<string, unknown>>();
  const createFakeWasmScore = (initialXml: string) => {
    let xml = initialXml;
    let selectedMeasure = 1;
    const updateSelectedMeasure = (updater: (measureXml: string) => string) => {
      const measureRegex = new RegExp(`(<measure\\b[^>]*number="${selectedMeasure}"[^>]*>[\\s\\S]*?<\\/measure>)`, 'i');
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
      setSelectedText: vi.fn(async (text: string) => {
        // Insert a text element marker so XML changes detectably
        xml = xml.replace(/<\/score-partwise>/, `<!-- selectedText:${text} --></score-partwise>`);
      }),
      setDurationType: vi.fn(async (_durationType: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<type>[^<]*<\/type>/i, '<type>quarter</type>'));
      }),
      setVoice: vi.fn(async (_voiceIndex: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<voice>\d+<\/voice>/i, `<voice>${_voiceIndex + 1}</voice>`));
      }),
      changeSelectedElementsVoice: vi.fn(async (_voiceIndex: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<voice>\d+<\/voice>/i, `<voice>${_voiceIndex + 1}</voice>`));
      }),
      transpose: vi.fn(async (semitones: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/note>/, `</note><!-- transposed:${semitones} -->`));
      }),
      addTempoText: vi.fn(async (bpm: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<direction><sound tempo="${bpm}"/></direction></measure>`));
      }),
      addDynamic: vi.fn(async (typeCode: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<direction><dynamics type="${typeCode}"/></direction></measure>`));
      }),
      setAccidental: vi.fn(async (_accidentalType: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/note>/, `<!-- accidental:${_accidentalType} --></note>`));
      }),
      addStaffText: vi.fn(async (text: string) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<direction><words>${text}</words></direction></measure>`));
      }),
      addSystemText: vi.fn(async (text: string) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<direction><words>${text}</words></direction></measure>`));
      }),
      addExpressionText: vi.fn(async (text: string) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<direction><words>${text}</words></direction></measure>`));
      }),
      addLyricText: vi.fn(async (text: string) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<lyric>${text}</lyric></measure>`));
      }),
      addHarmonyText: vi.fn(async (_variant: number, text: string) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<harmony>${text}</harmony></measure>`));
      }),
      toggleLineBreak: vi.fn(async () => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<!-- lineBreak --></measure>`));
      }),
      togglePageBreak: vi.fn(async () => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<!-- pageBreak --></measure>`));
      }),
      toggleRepeatStart: vi.fn(async () => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<!-- repeatStart --></measure>`));
      }),
      toggleRepeatEnd: vi.fn(async () => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<!-- repeatEnd --></measure>`));
      }),
      setRepeatCount: vi.fn(async (_count: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<!-- repeatCount:${_count} --></measure>`));
      }),
      setBarLineType: vi.fn(async (_barlineType: number) => {
        updateSelectedMeasure((measureXml) => measureXml.replace(/<\/measure>/, `<!-- barline:${_barlineType} --></measure>`));
      }),
      undo: vi.fn(async () => {
        xml = xml.replace(/<\/score-partwise>/, `<!-- undo --></score-partwise>`);
      }),
      redo: vi.fn(async () => {
        xml = xml.replace(/<\/score-partwise>/, `<!-- redo --></score-partwise>`);
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
        mutationOps: expect.objectContaining({
          set_key_signature: expect.objectContaining({ xml: true }),
          delete_text_by_content: expect.objectContaining({ xml: true }),
        }),
        runtime: expect.objectContaining({
          executor: 'musicxml-string',
          wasmAvailable: true,
          supportsAtomicRollback: true,
        }),
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

  it('maps scoped key/time prompts to measure-scoped operations', async () => {
    const result = await runMusicScoreOpsPromptService({
      prompt: 'Set key signature to G major in measures 1-2 and set time signature to 3/4 in measures 1-2',
      content: SAMPLE_XML,
    });

    expect(result.status).toBe(200);
    const planner = result.body.planner as { parsedOps?: Array<Record<string, unknown>> };
    const parsedOps = planner.parsedOps || [];
    expect(parsedOps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        op: 'set_key_signature',
        fifths: 1,
        scope: { measureStart: 1, measureEnd: 2 },
      }),
      expect.objectContaining({
        op: 'set_time_signature',
        numerator: 3,
        denominator: 4,
        scope: { measureStart: 1, measureEnd: 2 },
      }),
    ]));
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

  // --- Batch 1: New mutation ops ---

  it('rejects transpose_selection with invalid semitones', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'transpose_selection', semitones: 30 }],
    }, 'apply');
    expect(result.status).toBe(400);
  });

  it('executes transpose_selection via wasm', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'transpose_selection', semitones: 3 }],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  it('returns error for transpose_selection in xml mode', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'transpose_selection', semitones: 3 }],
      options: { preferredExecutor: 'xml' },
    }, 'apply');
    expect(result.status).toBe(422);
  });

  it('rejects add_tempo_marking with invalid bpm', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'add_tempo_marking', bpm: 5 }],
    }, 'apply');
    expect(result.status).toBe(400);
  });

  it('applies add_tempo_marking via xml executor', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'add_tempo_marking', bpm: 120 }],
      options: { includeXml: true, preferredExecutor: 'xml' },
    }, 'apply');

    expect(result.status).toBe(200);
    const output = (result.body.output as { content?: string })?.content || '';
    expect(output).toContain('<sound tempo="120"/>');
    expect(output).toContain('<words font-weight="bold">120</words>');
  });

  it('executes add_tempo_marking via wasm', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'add_tempo_marking', bpm: 120 }],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  it('rejects add_dynamic with invalid dynamic value', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'add_dynamic', dynamic: 'invalid' }],
    }, 'apply');
    expect(result.status).toBe(400);
  });

  it('applies add_dynamic via xml executor', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'add_dynamic', dynamic: 'ff' }],
      options: { includeXml: true, preferredExecutor: 'xml' },
    }, 'apply');

    expect(result.status).toBe(200);
    const output = (result.body.output as { content?: string })?.content || '';
    expect(output).toContain('<dynamics><ff/></dynamics>');
  });

  it('executes add_dynamic via wasm', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'add_dynamic', dynamic: 'ff' }],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  // --- Batch 1: Prompt parsing ---

  it('parses transpose prompt to transpose_selection op', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('transpose up 3 semitones');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'transpose_selection', semitones: 3 }),
    ]));
  });

  it('parses transpose down prompt correctly', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('transpose down 5 semitones');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'transpose_selection', semitones: -5 }),
    ]));
  });

  it('parses tempo prompt to add_tempo_marking op', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('set tempo to 120 bpm');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'add_tempo_marking', bpm: 120 }),
    ]));
  });

  it('parses dynamic prompt to add_dynamic op', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('add ff dynamic');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'add_dynamic', dynamic: 'ff' }),
    ]));
  });

  it('parses "delete measures 3-5" to delete_selection op', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('delete measures 3-5');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({
        op: 'delete_selection',
        scope: { measureStart: 3, measureEnd: 5 },
      }),
    ]));
  });

  it('parses "clear measure 2" to delete_selection op', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('clear measure 2');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({
        op: 'delete_selection',
        scope: { measureStart: 2, measureEnd: 2 },
      }),
    ]));
  });

  it('parses "select measures 5-8" to select_measure_range op', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('select measures 5-8');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({
        op: 'select_measure_range',
        scope: { measureStart: 5, measureEnd: 8 },
      }),
    ]));
  });

  it('parses "select all" to select_all op', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('select all');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'select_all' }),
    ]));
  });

  it('parses multi-step "select measures 1-4 then transpose up 3 semitones"', async () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('select measures 1-4 then transpose up 3 semitones');
    expect(parsed.ops.map((op: { op: string }) => op.op)).toEqual(
      expect.arrayContaining(['select_measure_range', 'transpose_selection']),
    );
  });

  // --- Batch 2: Inspect enhancements ---

  it('includes new ops in capability reporting', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const inspect = await runMusicScoreOpsService({
      action: 'inspect',
      scoreSessionId,
      include: { capabilities: true },
    }, 'inspect');

    expect(inspect.status).toBe(200);
    const capabilities = inspect.body.capabilities as {
      ops: string[];
      mutationOps: Record<string, { xml: boolean; wasm: boolean }>;
    };
    expect(capabilities.ops).toEqual(expect.arrayContaining([
      'transpose_selection',
      'add_tempo_marking',
      'add_dynamic',
      'select_measure_range',
      'select_all',
    ]));
    expect(capabilities.mutationOps.transpose_selection).toBeDefined();
    expect(capabilities.mutationOps.add_tempo_marking).toBeDefined();
    expect(capabilities.mutationOps.add_dynamic).toBeDefined();
  });

  it('returns partSignatures in inspect when scope and measureSignatures are provided', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const inspect = await runMusicScoreOpsService({
      action: 'inspect',
      scoreSessionId,
      scope: { partId: 'P1', measureStart: 1, measureEnd: 1 },
      include: { measureSignatures: true },
    }, 'inspect');

    expect(inspect.status).toBe(200);
    expect(inspect.body.partSignatures).toBeDefined();
    const partSigs = inspect.body.partSignatures as Array<{ measure: number; key: string | null }>;
    expect(partSigs.length).toBeGreaterThan(0);
    expect(partSigs[0].measure).toBe(1);
  });

  // --- Batch 3: Selection ops ---

  it('handles select_measure_range via wasm without error', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [
        { op: 'select_measure_range', scope: { measureStart: 1, measureEnd: 2 } },
        { op: 'set_key_signature', fifths: 2 },
      ],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  it('handles select_all via wasm without error', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [
        { op: 'select_all' },
        { op: 'set_key_signature', fifths: 3 },
      ],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  it('produces op-derived patch for add_tempo_marking', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'add_tempo_marking', bpm: 120 }],
      options: { includePatch: true },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body.patchMode).toBe('op-derived');
    const patch = apply.body.patch as { ops?: Array<{ op: string; path: string; value?: string }> };
    expect(patch.ops?.some((p) => p.value?.includes('tempo="120"'))).toBe(true);
  });

  it('produces op-derived patch for add_dynamic', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'add_dynamic', dynamic: 'ff' }],
      options: { includePatch: true },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body.patchMode).toBe('op-derived');
    const patch = apply.body.patch as { ops?: Array<{ op: string; path: string; value?: string }> };
    expect(patch.ops?.some((p) => p.value?.includes('<ff/>'))).toBe(true);
  });

  it('falls back to measure-diff patch for transpose_selection', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'transpose_selection', semitones: 3 }],
      options: { includePatch: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body.patchMode).toBe('measure-diff-fallback');
  });

  it('selection ops are no-ops in xml executor mode', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [
        { op: 'select_measure_range', scope: { measureStart: 1, measureEnd: 2 } },
        { op: 'set_key_signature', fifths: 2 },
      ],
      options: { preferredExecutor: 'xml', includeXml: true },
    }, 'apply');

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true });
    const output = (result.body.output as { content?: string })?.content || '';
    expect(output).toContain('<fifths>2</fifths>');
  });

  // --- P1 ops: replace_selected_text, set_duration, set_voice ---

  it('rejects set_duration with invalid duration type', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'set_duration', durationType: 'invalid' }],
    }, 'apply');
    expect(result.status).toBe(400);
  });

  it('rejects set_voice with voice out of range', async () => {
    const result = await runMusicScoreOpsService({
      action: 'apply',
      content: SAMPLE_XML,
      ops: [{ op: 'set_voice', voice: 5 }],
    }, 'apply');
    expect(result.status).toBe(400);
  });

  it('executes replace_selected_text via wasm', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'replace_selected_text', value: 'New Text' }],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  it('executes set_duration via wasm', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'set_duration', durationType: 'quarter' }],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  it('executes set_voice via wasm', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const apply = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'set_voice', voice: 2 }],
      options: { includeXml: true, preferredExecutor: 'wasm' },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      executor: { selected: 'wasm' },
    });
  });

  it('returns error for P1 ops in xml mode', async () => {
    for (const op of [
      { op: 'replace_selected_text', value: 'x' },
      { op: 'set_duration', durationType: 'quarter' },
      { op: 'set_voice', voice: 1 },
    ]) {
      const result = await runMusicScoreOpsService({
        action: 'apply',
        content: SAMPLE_XML,
        ops: [op],
        options: { preferredExecutor: 'xml' },
      }, 'apply');
      expect(result.status).toBe(422);
    }
  });

  it('parses "set duration to quarter" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('set duration to quarter');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'set_duration', durationType: 'quarter' }),
    ]));
  });

  it('parses "change voice 2" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('set voice 3');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'set_voice', voice: 3 }),
    ]));
  });

  it('parses "replace text with New Title" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('replace text with "New Title"');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'replace_selected_text', value: 'New Title' }),
    ]));
  });

  it('includes P1 ops in capability reporting', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);

    const inspect = await runMusicScoreOpsService({
      action: 'inspect',
      scoreSessionId,
      include: { capabilities: true },
    }, 'inspect');

    expect(inspect.status).toBe(200);
    const capabilities = inspect.body.capabilities as { ops: string[]; mutationOps: Record<string, unknown> };
    expect(capabilities.ops).toEqual(expect.arrayContaining([
      'replace_selected_text', 'set_duration', 'set_voice',
    ]));
    expect(capabilities.mutationOps).toHaveProperty('replace_selected_text');
    expect(capabilities.mutationOps).toHaveProperty('set_duration');
    expect(capabilities.mutationOps).toHaveProperty('set_voice');
  });

  // --- Planner multi-step decomposition improvements ---

  it('splits compound prompts with "plus" and "as well as"', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps(
      'set time signature to 3/4 plus change key signature to G major'
    );
    expect(parsed.ops).toHaveLength(2);
    expect(parsed.ops[0]).toMatchObject({ op: 'set_time_signature', numerator: 3, denominator: 4 });
    expect(parsed.ops[1]).toMatchObject({ op: 'set_key_signature' });
  });

  it('splits prompts with "while also" and "but also"', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps(
      'set tempo to 120 while also adding ff dynamic'
    );
    expect(parsed.ops).toHaveLength(2);
    expect(parsed.ops[0]).toMatchObject({ op: 'add_tempo_marking', bpm: 120 });
    expect(parsed.ops[1]).toMatchObject({ op: 'add_dynamic', dynamic: 'ff' });
  });

  it('propagates trailing scope to earlier steps in compound prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps(
      'change key signature to G major and set time signature to 3/4 in measures 5-8'
    );
    expect(parsed.ops).toHaveLength(2);
    // Both ops should get the scope from "in measures 5-8"
    expect(parsed.ops[0]).toMatchObject({
      op: 'set_key_signature',
      scope: { measureStart: 5, measureEnd: 8 },
    });
    expect(parsed.ops[1]).toMatchObject({
      op: 'set_time_signature',
      numerator: 3,
      denominator: 4,
      scope: { measureStart: 5, measureEnd: 8 },
    });
  });

  it('does not propagate scope when earlier steps have their own scope', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps(
      'change key signature to G major in measures 1-4 and set time signature to 3/4 in measures 5-8'
    );
    expect(parsed.ops).toHaveLength(2);
    expect(parsed.ops[0]).toMatchObject({
      op: 'set_key_signature',
      scope: { measureStart: 1, measureEnd: 4 },
    });
    expect(parsed.ops[1]).toMatchObject({
      op: 'set_time_signature',
      scope: { measureStart: 5, measureEnd: 8 },
    });
  });

  it('parses "first N measures" as scope', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps(
      'transpose up 3 semitones in the first 4 measures'
    );
    expect(parsed.ops).toHaveLength(1);
    expect(parsed.ops[0]).toMatchObject({
      op: 'transpose_selection',
      semitones: 3,
      scope: { measureStart: 1, measureEnd: 4 },
    });
  });

  it('parses "insert measures at the beginning"', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('insert 2 measures at the beginning');
    expect(parsed.ops).toHaveLength(1);
    expect(parsed.ops[0]).toMatchObject({ op: 'insert_measures', count: 2, target: 'start' });
  });

  it('parses "insert measures at the end"', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('insert 4 bars at the end');
    expect(parsed.ops).toHaveLength(1);
    expect(parsed.ops[0]).toMatchObject({ op: 'insert_measures', count: 4, target: 'end' });
  });

  it('does not split on "and" inside quoted title values', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps(
      'set title to "Rock and Roll"'
    );
    expect(parsed.ops).toHaveLength(1);
    expect(parsed.ops[0]).toMatchObject({ op: 'set_metadata_text', field: 'title', value: 'Rock and Roll' });
  });

  // --- P1 ops: set_accidental ---

  it('rejects set_accidental with invalid accidental', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const result = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'set_accidental', accidental: 'triple-sharp' }],
    }, 'apply');
    expect(result.status).toBe(400);
  });

  it('executes set_accidental via wasm', async () => {
    const open = await runMusicScoreOpsService({
      action: 'open',
      content: SAMPLE_XML,
    }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const result = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      options: { preferredExecutor: 'wasm' },
      ops: [{ op: 'set_accidental', accidental: 'sharp', scope: { measureStart: 1, measureEnd: 1 } }],
    }, 'apply');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, executor: { selected: 'wasm' } });
  });

  it('parses "set sharp accidental" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('set sharp accidental');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'set_accidental', accidental: 'sharp' }),
    ]));
  });

  // --- P1 ops: insert_text ---

  it('applies insert_text via xml executor', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const result = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      ops: [{ op: 'insert_text', kind: 'staff', text: 'Hello World', scope: { measureStart: 1, measureEnd: 1 } }],
      options: { includeXml: true },
    }, 'apply');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true });
    const content = (result.body.output as { content?: string })?.content || '';
    expect(content).toContain('Hello World');
  });

  it('executes insert_text via wasm', async () => {
    const open = await runMusicScoreOpsService({
      action: 'open',
      content: SAMPLE_XML,
    }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const result = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      options: { preferredExecutor: 'wasm' },
      ops: [{ op: 'insert_text', kind: 'staff', text: 'Allegro', scope: { measureStart: 1, measureEnd: 1 } }],
    }, 'apply');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, executor: { selected: 'wasm' } });
  });

  it('parses "add staff text Hello" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('add staff text "Allegro"');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'insert_text', kind: 'staff', text: 'Allegro' }),
    ]));
  });

  // --- P1 ops: set_layout_break ---

  it('executes set_layout_break via wasm', async () => {
    const open = await runMusicScoreOpsService({
      action: 'open',
      content: SAMPLE_XML,
    }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const result = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      options: { preferredExecutor: 'wasm' },
      ops: [{ op: 'set_layout_break', breakType: 'line', scope: { measureStart: 1, measureEnd: 1 } }],
    }, 'apply');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, executor: { selected: 'wasm' } });
  });

  it('parses "add line break" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('add line break in measure 4');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'set_layout_break', breakType: 'line' }),
    ]));
  });

  it('parses "set page break" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('set page break');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'set_layout_break', breakType: 'page' }),
    ]));
  });

  // --- P1 ops: set_repeat_markers ---

  it('executes set_repeat_markers via wasm', async () => {
    const open = await runMusicScoreOpsService({
      action: 'open',
      content: SAMPLE_XML,
    }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const result = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      options: { preferredExecutor: 'wasm' },
      ops: [{ op: 'set_repeat_markers', start: true, scope: { measureStart: 1, measureEnd: 1 } }],
    }, 'apply');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, executor: { selected: 'wasm' } });
  });

  it('parses "add repeat start" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('add repeat start');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'set_repeat_markers', start: true }),
    ]));
  });

  // --- P1 ops: history_step ---

  it('executes history_step undo via wasm', async () => {
    const open = await runMusicScoreOpsService({
      action: 'open',
      content: SAMPLE_XML,
    }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const result = await runMusicScoreOpsService({
      action: 'apply',
      scoreSessionId,
      baseRevision: 0,
      options: { preferredExecutor: 'wasm' },
      ops: [{ op: 'history_step', direction: 'undo', steps: 1 }],
    }, 'apply');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, executor: { selected: 'wasm' } });
  });

  it('parses "undo 3 steps" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('undo 3 steps');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'history_step', direction: 'undo', steps: 3 }),
    ]));
  });

  it('parses "redo" prompt', () => {
    const parsed = __scoreOpsTestOnly.parsePromptToOps('redo');
    expect(parsed.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'history_step', direction: 'redo', steps: 1 }),
    ]));
  });

  // --- P1 ops: capability reporting ---

  it('includes all P1 ops in capability reporting', async () => {
    const open = await runMusicScoreOpsService({ action: 'open', content: SAMPLE_XML }, 'open');
    const scoreSessionId = String(open.body.scoreSessionId);
    const inspect = await runMusicScoreOpsService({
      action: 'inspect',
      scoreSessionId,
      include: { capabilities: true },
    }, 'inspect');
    expect(inspect.status).toBe(200);
    const capabilities = inspect.body.capabilities as { ops: string[]; mutationOps: Record<string, unknown> };
    expect(capabilities.ops).toEqual(expect.arrayContaining([
      'set_accidental', 'insert_text', 'set_layout_break', 'set_repeat_markers', 'history_step',
    ]));
    expect(capabilities.mutationOps).toHaveProperty('set_accidental');
    expect(capabilities.mutationOps).toHaveProperty('insert_text');
    expect(capabilities.mutationOps).toHaveProperty('set_layout_break');
    expect(capabilities.mutationOps).toHaveProperty('set_repeat_markers');
    expect(capabilities.mutationOps).toHaveProperty('history_step');
  });
});
