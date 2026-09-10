import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicPatchService: vi.fn(),
  resolveProvider: vi.fn((value: unknown) => (typeof value === 'string' ? value : 'openai')),
  parseMusicXmlPatch: vi.fn((text: string) => {
    const payload = JSON.parse(text);
    if (payload?.format === 'musicxml-patch@1' && Array.isArray(payload?.ops)) {
      return { patch: payload, error: '' };
    }
    return { patch: null, error: 'invalid patch' };
  }),
  applyMusicXmlPatch: vi.fn(),
}));

vi.mock('../lib/music-services/patch-service', () => ({
  runMusicPatchService: mocked.runMusicPatchService,
  resolveProvider: mocked.resolveProvider,
  parseMusicXmlPatch: mocked.parseMusicXmlPatch,
  applyMusicXmlPatch: mocked.applyMusicXmlPatch,
}));

import {
  buildFeedbackPrompt,
  runDiffFeedbackService,
} from '../lib/music-services/diff-feedback-service';
import { createProposalContinuityToken } from '../lib/music-services/proposal-session-context';
import { computeScoreHash } from '../lib/music-services/scoreops-session-store';
import { computeMusicXmlIdentityHashServer } from '../lib/musicxml-identity-server';

const SESSION_BASE_XML =
  '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>';
const SESSION_PROPOSED_XML =
  '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"><note/></measure></part></score-partwise>';

type DiffFeedbackAuditView = {
  proposalContext: {
    provided?: boolean;
    lineage?: string;
    continuity?: string;
    previousCycleDropped?: boolean;
  };
};

const auditFrom = (body: Record<string, unknown>) => body.audit as DiffFeedbackAuditView;

const proposalSessionInput = (currentXml: string, overrides: Record<string, unknown> = {}) => ({
  id: 'sess-continuity-1',
  cycle: 1,
  originalInstruction: 'Add a G major arpeggio in measure 1.',
  previousCycle: {
    cycle: 1,
    baseContentHash: computeScoreHash(SESSION_BASE_XML),
    baseIdentityHash: computeMusicXmlIdentityHashServer(SESSION_BASE_XML),
    proposedContentHash: computeScoreHash(SESSION_PROPOSED_XML),
    proposedIdentityHash: computeMusicXmlIdentityHashServer(SESSION_PROPOSED_XML),
    expectedCurrentContentHash: computeScoreHash(currentXml),
    expectedCurrentIdentityHash: computeMusicXmlIdentityHashServer(currentXml),
    patch: {
      format: 'musicxml-patch@1',
      ops: [{ op: 'setText', path: '/score-partwise/part/measure/note/duration', value: '4' }],
    },
    annotations: [{ part: 1, measure: 1, comment: 'Added the arpeggio as eighth notes.' }],
  },
  constraints: [
    { cycle: 1, kind: 'rejected', partIndex: 0, measureRange: '2-2', text: '' },
    { cycle: 1, kind: 'note', partIndex: null, measureRange: null, text: 'No slurs anywhere.' },
  ],
  ...overrides,
});

const successPatchBody = () => ({
  status: 200,
  body: {
    patch: {
      format: 'musicxml-patch@1',
      ops: [{ op: 'setText', path: '/score-partwise/part/measure/note/duration', value: '2' }],
    },
    model: 'gpt-5.5',
    proposedXml: SESSION_PROPOSED_XML,
    verification: { level: 'patch_apply', attempts: 1, llmCalls: 1, elapsedMs: 10 },
  },
});

describe('diff-feedback-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a structured feedback prompt from block states', () => {
    const prompt = buildFeedbackPrompt({
      iteration: 2,
      blocks: [
        { partIndex: 0, measureRange: '3-4', status: 'accepted' },
        { partIndex: 1, measureRange: '6-6', status: 'rejected' },
        {
          partIndex: 0,
          measureRange: '8-9',
          status: 'comment',
          comment: 'Keep rhythm, make legato',
        },
        { partIndex: 0, measureRange: '10-11', status: 'pending' },
      ],
      globalComment: 'Dynamics are too strong',
      chatHistory: [{ role: 'user', text: 'Please soften bars 8-11' }],
    });

    expect(prompt).toContain('PATCH REVISION FEEDBACK (iteration 2)');
    expect(prompt).toContain('ACCEPTED (already applied to current score)');
    expect(prompt).toContain('Part 1, measures 3-4');
    expect(prompt).toContain('REJECTED (do not include in revised patch)');
    expect(prompt).toContain('Part 2, measures 6-6');
    expect(prompt).toContain('REVISE (generate new patch ops for these)');
    expect(prompt).toContain('Keep rhythm, make legato');
    expect(prompt).toContain('GLOBAL NOTE: "Dynamics are too strong"');
  });

  it('includes authoritative compare-pane edit diffs in the next-cycle prompt', () => {
    const prompt = buildFeedbackPrompt({
      iteration: 1,
      blocks: [],
      userEdits: [
        {
          side: 'proposal',
          label: 'Assistant proposal',
          diff: '@@ -1 +1 @@\n-<rest/>\n+<note/>',
        },
      ],
    });

    expect(prompt).toContain('MANUAL COMPARE-PANE EDITS');
    expect(prompt).toContain('Assistant proposal (proposal)');
    expect(prompt).toContain('-<rest/>');
    expect(prompt).toContain('+<note/>');
    expect(prompt).toContain('preserves the authoritative manual score edits');
  });

  it('accepts an edit-only feedback cycle', async () => {
    mocked.runMusicPatchService.mockResolvedValue(successPatchBody());

    const result = await runDiffFeedbackService({
      content: SESSION_BASE_XML,
      iteration: 0,
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      blocks: [],
      userEdits: [
        {
          side: 'current',
          label: 'Current score',
          diff: '@@ -1 +1 @@\n-<measure/>\n+<measure><note/></measure>',
        },
      ],
    });

    expect(result.status).toBe(200);
    expect(mocked.runMusicPatchService).toHaveBeenCalledWith(
      expect.objectContaining({
        content: SESSION_BASE_XML,
        prompt: expect.stringContaining('Current score (current)'),
      }),
      undefined,
    );
    expect(result.body).toMatchObject({
      audit: {
        manualEditCount: 1,
      },
    });
  });

  it('runs feedback flow and returns patch plus proposedXml', async () => {
    const onProgress = vi.fn();
    mocked.runMusicPatchService.mockResolvedValue({
      status: 200,
      body: {
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
        model: 'gpt-5.5',
        proposedXml: '<score-partwise version="4.0"><part-list/></score-partwise>',
        proposal: {
          sourceTool: 'music.patch',
          baseXml: '<score-partwise version="4.0"></score-partwise>',
          proposedXml: '<score-partwise version="4.0"><part-list/></score-partwise>',
          baseContentHash: 'sha256:base',
          expectedCurrentContentHash: 'sha256:base',
          baseIdentityHash: 'xmlid-v1:base',
          expectedCurrentIdentityHash: 'xmlid-v1:base',
        },
        verification: {
          level: 'patch_apply',
          attempts: 1,
          llmCalls: 1,
          elapsedMs: 10,
        },
      },
    });

    const result = await runDiffFeedbackService(
      {
        content: '<score-partwise version="4.0"></score-partwise>',
        iteration: 2,
        provider: 'openai',
        model: 'gpt-5.5',
        apiKey: 'sk-test',
        editEffort: 'thorough',
        maxTokens: 8192,
        temperature: 0.4,
        blocks: [
          { partIndex: 0, measureRange: '3-4', status: 'accepted' },
          { partIndex: 0, measureRange: '5-6', status: 'pending' },
        ],
        globalComment: 'Keep dynamics gentle',
      },
      { onProgress },
    );

    expect(mocked.runMusicPatchService).toHaveBeenCalledTimes(1);
    expect(mocked.runMusicPatchService.mock.calls[0][0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      editEffort: 'thorough',
      maxTokens: 8192,
      temperature: 0.4,
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(String(mocked.runMusicPatchService.mock.calls[0][0].prompt)).toContain('ACCEPTED');
    expect(mocked.runMusicPatchService.mock.calls[0][1]).toMatchObject({ onProgress });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'feedback.prepared',
        message: 'Feedback context prepared',
      }),
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      iteration: 3,
      patch: {
        format: 'musicxml-patch@1',
      },
      proposedXml: '<score-partwise version="4.0"><part-list/></score-partwise>',
      proposal: {
        sourceTool: 'music.patch',
        baseXml: '<score-partwise version="4.0"></score-partwise>',
        expectedCurrentIdentityHash: 'xmlid-v1:base',
      },
      model: 'gpt-5.5',
      verification: {
        level: 'patch_apply',
      },
    });
    expect(mocked.applyMusicXmlPatch).not.toHaveBeenCalled();
  });

  it('feeds original instruction, previous patch, labeled annotations, and constraints into the next cycle', async () => {
    mocked.runMusicPatchService.mockResolvedValue(successPatchBody());

    const result = await runDiffFeedbackService({
      content: SESSION_BASE_XML,
      iteration: 0,
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      blocks: [
        { partIndex: 0, measureRange: '1-1', status: 'comment', comment: 'Use quarter notes.' },
      ],
      proposalSession: proposalSessionInput(SESSION_BASE_XML),
    });

    expect(result.status).toBe(200);
    const prompt = String(mocked.runMusicPatchService.mock.calls[0][0].prompt);
    expect(prompt).toContain('ORIGINAL EDIT REQUEST');
    expect(prompt).toContain('Add a G major arpeggio in measure 1.');
    expect(prompt).toContain('PREVIOUS PROPOSAL PATCH (cycle 1');
    expect(prompt).toContain('"format":"musicxml-patch@1"');
    expect(prompt).toContain('NOT user instructions');
    expect(prompt).toContain('Added the arpeggio as eighth notes.');
    expect(prompt).toContain('STANDING CONSTRAINTS FROM EARLIER CYCLES');
    expect(prompt).toContain('(cycle 1) Rejected — Part 1, measures 2-2');
    expect(prompt).toContain('"No slurs anywhere."');
    expect(result.body).toMatchObject({
      proposalSessionId: 'sess-continuity-1',
      cycle: 2,
      iteration: 1,
      audit: {
        proposalSessionId: 'sess-continuity-1',
        cycle: 2,
        feedbackCounts: { accepted: 0, rejected: 0, revise: 1, pending: 0 },
        proposalContext: {
          provided: true,
          lineage: 'client_attested',
          continuity: 'client',
          previousCycleDropped: false,
          truncated: [],
        },
      },
    });
  });

  it('accepts a partial-apply current state via the expected-current hash', async () => {
    mocked.runMusicPatchService.mockResolvedValue(successPatchBody());
    const partialXml =
      '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"><note/><note/></measure></part></score-partwise>';

    const result = await runDiffFeedbackService({
      content: partialXml,
      iteration: 0,
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      blocks: [{ partIndex: 0, measureRange: '1-1', status: 'pending' }],
      proposalSession: proposalSessionInput(partialXml),
    });

    expect(result.status).toBe(200);
    const audit = auditFrom(result.body);
    expect(audit.proposalContext.lineage).toBe('client_attested');
    expect(audit.proposalContext.previousCycleDropped).toBe(false);
  });

  it('reports verified lineage and issues a fresh continuity token when the chain is server-signed', async () => {
    mocked.runMusicPatchService.mockResolvedValue({
      status: 200,
      body: {
        ...successPatchBody().body,
        proposal: {
          sourceTool: 'music.patch',
          baseXml: SESSION_BASE_XML,
          proposedXml: SESSION_PROPOSED_XML,
          baseContentHash: computeScoreHash(SESSION_BASE_XML),
          proposedContentHash: computeScoreHash(SESSION_PROPOSED_XML),
        },
      },
    });
    const context = proposalSessionInput(SESSION_BASE_XML);
    (context.previousCycle as Record<string, unknown>).continuityToken =
      createProposalContinuityToken({
        proposalSessionId: context.id,
        cycle: 1,
        baseContentHash: computeScoreHash(SESSION_BASE_XML),
        proposedContentHash: computeScoreHash(SESSION_PROPOSED_XML),
      });

    const result = await runDiffFeedbackService({
      content: SESSION_BASE_XML,
      iteration: 0,
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      blocks: [{ partIndex: 0, measureRange: '1-1', status: 'pending' }],
      proposalSession: context,
    });

    expect(result.status).toBe(200);
    const audit = auditFrom(result.body);
    expect(audit.proposalContext.lineage).toBe('verified');
    expect(audit.proposalContext.continuity).toBe('server');
    expect(String(result.body.continuityToken)).toMatch(/^pct-v1:[0-9a-f]{64}$/);
  });

  it('drops the previous cycle but keeps instruction and constraints on a lineage mismatch', async () => {
    mocked.runMusicPatchService.mockResolvedValue(successPatchBody());
    const unrelatedXml =
      '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="9"/></part></score-partwise>';
    const context = proposalSessionInput(SESSION_BASE_XML);
    (context.previousCycle as Record<string, unknown>).expectedCurrentContentHash =
      computeScoreHash(SESSION_BASE_XML);
    (context.previousCycle as Record<string, unknown>).expectedCurrentIdentityHash =
      computeMusicXmlIdentityHashServer(SESSION_BASE_XML);

    const result = await runDiffFeedbackService({
      content: unrelatedXml,
      iteration: 0,
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      blocks: [{ partIndex: 0, measureRange: '1-1', status: 'pending' }],
      proposalSession: context,
    });

    expect(result.status).toBe(200);
    const prompt = String(mocked.runMusicPatchService.mock.calls[0][0].prompt);
    expect(prompt).toContain('ORIGINAL EDIT REQUEST');
    expect(prompt).toContain('STANDING CONSTRAINTS FROM EARLIER CYCLES');
    expect(prompt).not.toContain('PREVIOUS PROPOSAL PATCH');
    expect(prompt).not.toContain('Added the arpeggio as eighth notes.');
    const audit = auditFrom(result.body);
    expect(audit.proposalContext.lineage).toBe('mismatch');
    expect(audit.proposalContext.previousCycleDropped).toBe(true);
  });

  it('returns 400 for structural proposal-session violations without calling the model', async () => {
    const result = await runDiffFeedbackService({
      content: SESSION_BASE_XML,
      iteration: 0,
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      blocks: [{ partIndex: 0, measureRange: '1-1', status: 'pending' }],
      proposalSession: proposalSessionInput(SESSION_BASE_XML, { cycle: 5 }),
    });

    expect(result.status).toBe(400);
    expect(String(result.body.error)).toContain('cycle');
    expect(mocked.runMusicPatchService).not.toHaveBeenCalled();
  });

  it('mints a proposal session id when the client sends no context', async () => {
    mocked.runMusicPatchService.mockResolvedValue(successPatchBody());

    const result = await runDiffFeedbackService({
      content: SESSION_BASE_XML,
      iteration: 0,
      provider: 'openai',
      model: 'gpt-5.5',
      apiKey: 'sk-test',
      blocks: [{ partIndex: 0, measureRange: '1-1', status: 'pending' }],
    });

    expect(result.status).toBe(200);
    expect(String(result.body.proposalSessionId)).toMatch(/^[0-9a-f-]{36}$/);
    const audit = auditFrom(result.body);
    expect(audit.proposalContext).toMatchObject({ provided: false, lineage: 'none' });
  });

  it('returns 400 when the block list exceeds the aggregate limit', async () => {
    const blocks = Array.from({ length: 201 }, (_, i) => ({
      partIndex: 0,
      measureRange: `${i + 1}-${i + 1}`,
      status: 'pending',
    }));
    const result = await runDiffFeedbackService({
      content: SESSION_BASE_XML,
      blocks,
    });

    expect(result.status).toBe(400);
    expect(String(result.body.error)).toContain('entry limit');
    expect(mocked.runMusicPatchService).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed block payloads', async () => {
    const result = await runDiffFeedbackService({
      content: '<score-partwise version="4.0"></score-partwise>',
      blocks: [{ partIndex: -1, measureRange: '', status: 'unknown' }],
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: expect.any(String),
    });
    expect(mocked.runMusicPatchService).not.toHaveBeenCalled();
  });

  // AC-25 of the editable-compare design: the server bounds userEdits. The limits were
  // implemented but nothing exercised them; the existing "entry limit" case covers the
  // block list, not these.
  describe('userEdits bounds (AC-24, AC-25)', () => {
    const editDiff = '@@ -1 +1 @@\n-<measure/>\n+<measure><note/></measure>';

    it('rejects more than two edit entries without calling the model', async () => {
      const result = await runDiffFeedbackService({
        content: SESSION_BASE_XML,
        blocks: [],
        userEdits: [
          { side: 'current', diff: editDiff },
          { side: 'proposal', diff: editDiff },
          { side: 'current', diff: editDiff },
        ],
      });

      expect(result.status).toBe(400);
      expect(String(result.body.error)).toContain('2 entry limit');
      expect(mocked.runMusicPatchService).not.toHaveBeenCalled();
    });

    it('accepts exactly two, one per role', async () => {
      mocked.runMusicPatchService.mockResolvedValue(successPatchBody());

      const result = await runDiffFeedbackService({
        content: SESSION_BASE_XML,
        blocks: [],
        userEdits: [
          { side: 'current', diff: editDiff },
          { side: 'proposal', diff: editDiff },
        ],
      });

      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ audit: { manualEditCount: 2 } });
    });

    it('bounds an oversized diff rather than rejecting the cycle', async () => {
      mocked.runMusicPatchService.mockResolvedValue(successPatchBody());
      // The filler is a repeated token, so the tail must carry a distinctive marker:
      // any arbitrary window of the filler also appears in the part that survives.
      const oversized = `${editDiff}\n${'+<note/>'.repeat(6000)}\n+<!--TAIL-BEYOND-THE-CAP-->`;
      expect(oversized.length).toBeGreaterThan(24_000);

      const result = await runDiffFeedbackService({
        content: SESSION_BASE_XML,
        blocks: [],
        userEdits: [{ side: 'current', diff: oversized }],
      });

      expect(result.status).toBe(200);
      const { prompt } = mocked.runMusicPatchService.mock.calls.at(-1)![0] as { prompt: string };
      // Truncated to the cap: the head of the diff survives, the tail does not.
      expect(prompt).toContain('@@ -1 +1 @@');
      expect(prompt).not.toContain('TAIL-BEYOND-THE-CAP');
    });

    it('labels each role by default when the client sends no label', async () => {
      mocked.runMusicPatchService.mockResolvedValue(successPatchBody());

      await runDiffFeedbackService({
        content: SESSION_BASE_XML,
        blocks: [],
        userEdits: [
          { side: 'current', diff: editDiff },
          { side: 'proposal', diff: editDiff },
        ],
      });

      const { prompt } = mocked.runMusicPatchService.mock.calls.at(-1)![0] as { prompt: string };
      expect(prompt).toContain('Current score (current)');
      expect(prompt).toContain('Assistant proposal (proposal)');
    });

    it('rejects an entry whose side is neither role', async () => {
      const result = await runDiffFeedbackService({
        content: SESSION_BASE_XML,
        blocks: [],
        userEdits: [{ side: 'left', diff: editDiff }],
      });

      expect(result.status).toBe(400);
      expect(String(result.body.error)).toContain('side must be current or proposal');
      expect(mocked.runMusicPatchService).not.toHaveBeenCalled();
    });

    it('rejects an entry with no diff', async () => {
      const result = await runDiffFeedbackService({
        content: SESSION_BASE_XML,
        blocks: [],
        userEdits: [{ side: 'current', diff: '   ' }],
      });

      expect(result.status).toBe(400);
      expect(String(result.body.error)).toContain('diff is required');
    });

    it('strips control characters out of a diff before it reaches the prompt', async () => {
      mocked.runMusicPatchService.mockResolvedValue(successPatchBody());

      await runDiffFeedbackService({
        content: SESSION_BASE_XML,
        blocks: [],
        userEdits: [{ side: 'current', diff: `${editDiff}\u0007\u001b[31m` }],
      });

      const { prompt } = mocked.runMusicPatchService.mock.calls.at(-1)![0] as { prompt: string };
      expect(prompt).not.toContain('\u0007');
      expect(prompt).not.toContain('\u001b');
    });
  });
});
