import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  let nextId = 1;
  const artifacts = new Map<string, Record<string, unknown>>();
  return {
    artifacts,
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
      options: { includeXml: true },
    }, 'apply');

    expect(apply.status).toBe(200);
    expect(apply.body).toMatchObject({
      ok: true,
      baseRevision: 0,
      newRevision: 1,
    });

    const output = (apply.body.output as { content?: string })?.content || '';
    expect(output).toContain('<fifths>1</fifths>');
    expect(output).toContain('<beats>3</beats>');
    expect(output).toContain('<beat-type>4</beat-type>');
    expect(output).toContain('<clef><sign>G</sign><line>2</line></clef>');
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
});
