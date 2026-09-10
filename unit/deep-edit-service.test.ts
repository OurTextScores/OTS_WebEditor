import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  loadWebMscoreInProcess: vi.fn(),
  renderMusicSnapshot: vi.fn(),
  updateScoreOpsSession: vi.fn(),
  createScoreOpsSession: vi.fn(),
  createScoreArtifact: vi.fn(),
  runHarmonyAnalyzeService: vi.fn(),
  runFunctionalHarmonyAnalyzeService: vi.fn(),
}));

vi.mock('../lib/webmscore-loader', () => ({
  loadWebMscoreInProcess: mocked.loadWebMscoreInProcess,
}));

vi.mock('../lib/music-conversion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  renderMusicSnapshot: mocked.renderMusicSnapshot,
}));

vi.mock('../lib/score-artifacts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createScoreArtifact: mocked.createScoreArtifact,
}));

vi.mock('../lib/music-services/scoreops-session-store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  updateScoreOpsSession: mocked.updateScoreOpsSession,
  createScoreOpsSession: mocked.createScoreOpsSession,
}));

vi.mock('../lib/music-services/harmony-service', () => ({
  runHarmonyAnalyzeService: mocked.runHarmonyAnalyzeService,
}));

vi.mock('../lib/music-services/functional-harmony-service', () => ({
  runFunctionalHarmonyAnalyzeService: mocked.runFunctionalHarmonyAnalyzeService,
}));

import {
  runDeepEditService,
  summarizeMeasureDifferences,
  type DeepEditDriver,
} from '../lib/music-services/deep-edit-service';
import { resolveDeepEditBudgets } from '../lib/music-services/deep-edit-service';
import type { DeepEditBudgets } from '../lib/music-services/deep-edit-capability';

type ProposalView = {
  proposedXml?: unknown;
  verification: { level?: string };
};

type DeepEditAuditView = {
  finalizedCandidateId?: string;
  counters: {
    llmCalls?: number;
    toolCalls?: number;
    renders?: number;
  };
  candidates: Array<{
    engineError?: string;
    diff?: unknown;
  }>;
  environment: { engine?: string };
};

const proposalFrom = (body: Record<string, unknown>) => body.proposal as ProposalView;
const auditFrom = (body: Record<string, unknown>) => body.deepEdit as DeepEditAuditView;

const BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;

const VALID_PATCH = {
  format: 'musicxml-patch@1',
  ops: [
    {
      op: 'setText',
      path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch/step',
      value: 'G',
    },
  ],
};

const budgets = (overrides: Partial<DeepEditBudgets> = {}): DeepEditBudgets => ({
  ...resolveDeepEditBudgets(),
  ...overrides,
});

const request = (overrides: Record<string, unknown> = {}) => ({
  prompt: 'Change the first note to G.',
  content: BASE_XML,
  provider: 'openai',
  model: 'gpt-test-model',
  apiKey: 'sk-test',
  ...overrides,
});

const engineLoadOk = () => {
  mocked.loadWebMscoreInProcess.mockResolvedValue({
    load: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
  });
};

describe('resolveDeepEditBudgets', () => {
  it('resolves effort profiles and applies deployment caps', () => {
    expect(resolveDeepEditBudgets('efficient')).toMatchObject({
      maxLlmCalls: 4,
      maxToolCalls: 10,
      maxCandidates: 2,
      maxRenders: 1,
      budgetMs: 120_000,
    });
    expect(resolveDeepEditBudgets('thorough')).toMatchObject({
      maxLlmCalls: 20,
      maxToolCalls: 40,
      maxCandidates: 6,
      maxRenders: 5,
      budgetMs: 600_000,
    });

    const previousLlmCalls = process.env.MUSIC_DEEP_EDIT_MAX_LLM_CALLS;
    const previousBudget = process.env.MUSIC_DEEP_EDIT_BUDGET_MS;
    try {
      process.env.MUSIC_DEEP_EDIT_MAX_LLM_CALLS = '8';
      process.env.MUSIC_DEEP_EDIT_BUDGET_MS = '240000';
      expect(resolveDeepEditBudgets('thorough')).toMatchObject({
        maxLlmCalls: 8,
        budgetMs: 240_000,
      });
    } finally {
      if (previousLlmCalls === undefined) delete process.env.MUSIC_DEEP_EDIT_MAX_LLM_CALLS;
      else process.env.MUSIC_DEEP_EDIT_MAX_LLM_CALLS = previousLlmCalls;
      if (previousBudget === undefined) delete process.env.MUSIC_DEEP_EDIT_BUDGET_MS;
      else process.env.MUSIC_DEEP_EDIT_BUDGET_MS = previousBudget;
    }
  });
});

describe('runDeepEditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ships an engine-verified patch candidate and never touches user stores', async () => {
    engineLoadOk();
    const progress: Array<Record<string, unknown>> = [];
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const applied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      expect(applied.ok).toBe(true);
      const checked = await executeTool('sandbox_engine_check', {
        candidateId: applied.candidateId,
      });
      expect(checked.ok).toBe(true);
      return {
        candidateId: String(applied.candidateId),
        rationale: 'Only candidate; engine verified.',
      };
    };

    const result = await runDeepEditService(request(), {
      driveAgent: driver,
      onProgress: (event) => progress.push(event),
    });

    expect(result.status).toBe(200);
    expect(result.body.proposal).toMatchObject({
      sourceTool: 'music.deep_edit',
      baseXml: BASE_XML,
      verification: { level: 'engine_load' },
    });
    expect(String((result.body.proposal as Record<string, unknown>).proposedXml)).toContain(
      '<step>G</step>',
    );
    expect(result.body.patch).toMatchObject({ format: 'musicxml-patch@1' });
    expect(String(result.body.proposalSessionId)).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(result.body.continuityToken)).toMatch(/^pct-v1:/);
    expect(result.body.cycle).toBe(1);
    const audit = auditFrom(result.body);
    expect(audit.finalizedCandidateId).toBe('cand-1');
    expect(audit.counters.toolCalls).toBe(2);
    expect(JSON.stringify(audit.candidates)).not.toContain('<score-partwise');
    expect(progress.map((event) => event.phase)).toEqual([
      'request.validated',
      'deep.started',
      'tool.started',
      'tool.completed',
      'verification.started',
      'verification.completed',
    ]);
    expect(JSON.stringify(progress)).not.toContain('<score-partwise');

    expect(mocked.updateScoreOpsSession).not.toHaveBeenCalled();
    expect(mocked.createScoreOpsSession).not.toHaveBeenCalled();
    expect(mocked.createScoreArtifact).not.toHaveBeenCalled();
  });

  it('gates an unchecked finalized candidate by running the missing check itself', async () => {
    engineLoadOk();
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const first = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      const checked = await executeTool('sandbox_engine_check', { candidateId: first.candidateId });
      expect(checked.ok).toBe(true);
      // Second candidate is finalized WITHOUT its own engine check.
      const second = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      return { candidateId: String(second.candidateId), rationale: 'Prefer the second attempt.' };
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(200);
    expect(proposalFrom(result.body).verification.level).toBe('engine_load');
    const audit = auditFrom(result.body);
    // 3 model tool calls + 1 gate-run engine check.
    expect(audit.counters.toolCalls).toBe(4);
  });

  it('fails the gate when the finalized candidate cannot load in a working engine', async () => {
    // The engine works (base loads fine); only the candidate is rejected.
    mocked.loadWebMscoreInProcess.mockResolvedValue({
      load: vi.fn().mockImplementation(async (_format: string, bytes: Uint8Array) => {
        const content = new TextDecoder().decode(bytes);
        if (content.includes('<step>G</step>')) {
          throw new Error('corrupt beam group');
        }
        return { destroy: vi.fn() };
      }),
    });
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const first = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      const checked = await executeTool('sandbox_engine_check', { candidateId: first.candidateId });
      expect(checked.ok).toBe(false);
      expect(String(checked.error)).toContain('corrupt beam group');
      return { candidateId: String(first.candidateId), rationale: 'Trying anyway.' };
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('gate_failed');
    expect(String(result.body.error)).toContain('engine');
    const audit = auditFrom(result.body);
    expect(audit.candidates[0].engineError).toContain('corrupt beam group');
    expect(audit.environment.engine).toBe('available');
  });

  it('ships a patch-verified winner when the deployment has no notation engine', async () => {
    // Every load fails — including the user's own base score — so the runtime is absent,
    // the candidate is not blamed, and the failed attempt does not raise the gate bar.
    mocked.loadWebMscoreInProcess.mockRejectedValue(new Error('wasm runtime missing'));
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const first = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      const checked = await executeTool('sandbox_engine_check', { candidateId: first.candidateId });
      expect(checked).toMatchObject({ ok: false });
      expect(String(checked.error)).toContain('unavailable in this deployment');
      const again = await executeTool('sandbox_engine_check', { candidateId: first.candidateId });
      expect(String(again.error)).toContain('unavailable');
      return {
        candidateId: String(first.candidateId),
        rationale: 'Best available without an engine.',
      };
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(200);
    expect(proposalFrom(result.body).verification.level).toBe('patch_apply');
    const audit = auditFrom(result.body);
    expect(audit.environment.engine).toBe('unavailable');
    expect(audit.candidates[0].engineError).toBeUndefined();
    expect(audit.candidates[0].diff).toMatchObject({ changedCount: 1 });
  });

  it('rejects a patch that gives one note both rest and pitch origins', async () => {
    const invalidPatch = {
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'insertBefore',
          path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch',
          value: '<rest/>',
        },
      ],
    };
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const applied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: invalidPatch,
      });
      expect(applied.ok).toBe(false);
      expect(String(applied.error)).toContain('exactly one of <pitch>, <unpitched>, or <rest>');
      return null;
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(422);
    expect((result.body.deepEdit as { candidates?: unknown[] }).candidates).toHaveLength(0);
  });

  it('does not finalize an identity-equivalent candidate', async () => {
    const sameValuePatch = {
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'setText',
          path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch/step',
          value: 'C',
        },
      ],
    };
    const driver: DeepEditDriver = async ({ capability, executeTool }) => {
      const applied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: sameValuePatch,
      });
      expect(applied.ok).toBe(true);
      const finalized = await executeTool('finalize', {
        candidateId: String(applied.candidateId),
        rationale: 'No effective change.',
      });
      expect(finalized.ok).toBe(false);
      expect(String(finalized.error)).toContain('identity-equivalent');
      return capability.finalized();
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('no_finalize');
  });

  it('fails a scoreops-born winner clearly when the engine it requires is unavailable', async () => {
    mocked.loadWebMscoreInProcess.mockRejectedValue(new Error('wasm runtime missing'));
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const created = await executeTool('sandbox_scoreops', {
        baseCandidateId: 'base',
        ops: [{ op: 'set_metadata_text', field: 'title', value: 'No Engine' }],
      });
      expect(created.ok).toBe(true);
      return { candidateId: String(created.candidateId), rationale: 'ScoreOps only.' };
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('gate_failed');
    expect(String(result.body.error)).toContain('unavailable in this deployment');
  });

  it('requires engine verification for scoreops-born candidates even when never attempted', async () => {
    engineLoadOk();
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const created = await executeTool('sandbox_scoreops', {
        baseCandidateId: 'base',
        ops: [{ op: 'set_metadata_text', field: 'title', value: 'Deep Edit Title' }],
      });
      expect(created.ok).toBe(true);
      return { candidateId: String(created.candidateId), rationale: 'Edited via ScoreOps.' };
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(200);
    expect(proposalFrom(result.body).verification.level).toBe('engine_load');
    expect(mocked.loadWebMscoreInProcess).toHaveBeenCalled();
  });

  it('rejects model-supplied ids that are not capability-minted candidates', async () => {
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const bySession = await executeTool('sandbox_engine_check', {
        candidateId: 'sess_live_user_score',
      });
      expect(bySession.ok).toBe(false);
      expect(String(bySession.error)).toContain('not a live candidate id');
      const byPath = await executeTool('sandbox_measure_diff', { candidateId: '../artifacts/x' });
      expect(byPath.ok).toBe(false);
      return null;
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });
    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('no_finalize');
  });

  it('stops the loop deterministically at the tool-call budget', async () => {
    const driver: DeepEditDriver = async ({ executeTool }) => {
      let lastBudgetError = '';
      for (let i = 0; i < 10; i += 1) {
        const outcome = await executeTool('sandbox_apply_patch', {
          baseCandidateId: 'base',
          patch: VALID_PATCH,
        });
        if (!outcome.ok && typeof outcome.budget === 'string') {
          lastBudgetError = String(outcome.budget);
          break;
        }
      }
      expect(lastBudgetError).toBe('tool_calls');
      return null;
    };

    const result = await runDeepEditService(request(), {
      driveAgent: driver,
      budgets: budgets({ maxToolCalls: 3, maxCandidates: 8 }),
    });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('budget_exhausted');
    const audit = auditFrom(result.body);
    expect(audit.counters.toolCalls).toBe(3);
  });

  it('reports budget_exhausted when gating the winner would exceed the budget', async () => {
    engineLoadOk();
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const first = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      await executeTool('sandbox_engine_check', { candidateId: first.candidateId });
      const second = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      return { candidateId: String(second.candidateId), rationale: 'Second, ungated.' };
    };

    const result = await runDeepEditService(request(), {
      driveAgent: driver,
      // Exactly enough for the three driver calls; the gate's engine check cannot charge.
      budgets: budgets({ maxToolCalls: 3 }),
    });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('budget_exhausted');
  });

  it('counts renders separately and upgrades the winner to render level', async () => {
    engineLoadOk();
    mocked.renderMusicSnapshot.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: 'image/png',
    });
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const applied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      const rendered = await executeTool('sandbox_render', { candidateId: applied.candidateId });
      expect(rendered.ok).toBe(true);
      const again = await executeTool('sandbox_render', { candidateId: applied.candidateId });
      expect(again).toMatchObject({ ok: false, budget: 'renders' });
      return { candidateId: String(applied.candidateId), rationale: 'Render-verified.' };
    };

    const result = await runDeepEditService(request(), {
      driveAgent: driver,
      budgets: budgets({ maxRenders: 1 }),
    });

    expect(result.status).toBe(200);
    expect(proposalFrom(result.body).verification.level).toBe('render');
    const audit = auditFrom(result.body);
    expect(audit.counters.renders).toBe(1);
  });

  it('keeps sandbox analysis memory-only and strips artifact metadata', async () => {
    engineLoadOk();
    mocked.runFunctionalHarmonyAnalyzeService.mockResolvedValue({
      status: 200,
      body: {
        ok: true,
        segments: [{ measureIndex: 1, roman: 'I' }],
        annotatedXml: '<score-partwise><direction/></score-partwise>',
        jsonArtifact: { id: 'should-not-leak-json' },
        rntxtArtifact: { id: 'should-not-leak-rntxt' },
      },
    });
    mocked.runHarmonyAnalyzeService.mockResolvedValue({
      status: 200,
      body: { ok: true, segments: [{ measure: 1, chord: 'C' }] },
    });
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const applied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      const functional = await executeTool('sandbox_analyze', {
        candidateId: String(applied.candidateId),
        kind: 'functional_harmony',
      });
      expect(functional.ok).toBe(true);
      expect(String(functional.analysis)).not.toContain('should-not-leak');
      expect(String(functional.analysis)).not.toContain('<score-partwise');
      const harmony = await executeTool('sandbox_analyze', {
        candidateId: String(applied.candidateId),
        kind: 'harmony',
      });
      expect(harmony.ok).toBe(true);
      await executeTool('sandbox_engine_check', { candidateId: applied.candidateId });
      return { candidateId: String(applied.candidateId), rationale: 'Analyzed and verified.' };
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(200);
    expect(mocked.runFunctionalHarmonyAnalyzeService).toHaveBeenCalledWith(
      expect.objectContaining({ persistArtifacts: false }),
    );
    expect(mocked.runHarmonyAnalyzeService).toHaveBeenCalledWith(
      expect.objectContaining({ persistArtifacts: false }),
    );
    expect(mocked.createScoreArtifact).not.toHaveBeenCalled();
  });

  it('omits the patch from the response when the winner is not base-relative', async () => {
    engineLoadOk();
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const first = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      const chainedPatch = {
        format: 'musicxml-patch@1',
        ops: [
          {
            op: 'setText',
            path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/duration',
            value: '2',
          },
        ],
      };
      const second = await executeTool('sandbox_apply_patch', {
        baseCandidateId: String(first.candidateId),
        patch: chainedPatch,
      });
      expect(second.ok).toBe(true);
      await executeTool('sandbox_engine_check', { candidateId: second.candidateId });
      return { candidateId: String(second.candidateId), rationale: 'Chained refinement.' };
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(200);
    expect(result.body.patch).toBeUndefined();
    // The proposal remains complete: full proposed XML carries both edits.
    const proposedXml = String((result.body.proposal as Record<string, unknown>).proposedXml);
    expect(proposedXml).toContain('<step>G</step>');
    expect(proposedXml).toContain('<duration>2</duration>');
  });

  it('lets the agent recover from a finalize with an unknown or base candidate id', async () => {
    engineLoadOk();
    const driver: DeepEditDriver = async ({ capability, executeTool }) => {
      const badId = await executeTool('finalize', { candidateId: 'cand-99', rationale: 'x' });
      expect(badId.ok).toBe(false);
      expect(String(badId.error)).toContain('not a live candidate id');
      const baseId = await executeTool('finalize', { candidateId: 'base', rationale: 'x' });
      expect(baseId.ok).toBe(false);
      expect(capability.finalized()).toBeNull();

      const applied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      await executeTool('sandbox_engine_check', { candidateId: applied.candidateId });
      const good = await executeTool('finalize', {
        candidateId: String(applied.candidateId),
        rationale: 'Recovered.',
      });
      expect(good.ok).toBe(true);
      return capability.finalized();
    };

    const result = await runDeepEditService(request(), { driveAgent: driver });

    expect(result.status).toBe(200);
    const audit = auditFrom(result.body);
    expect(audit.finalizedCandidateId).toBe('cand-1');
    // finalize charges no tool budget: two tool calls (patch + engine check) only.
    expect(audit.counters.toolCalls).toBe(2);
  });

  it('does not charge the render budget for a render rejected on tool-call exhaustion', async () => {
    const driver: DeepEditDriver = async ({ capability, executeTool }) => {
      await executeTool('sandbox_apply_patch', { baseCandidateId: 'base', patch: VALID_PATCH });
      const rejected = await executeTool('sandbox_render', { candidateId: 'cand-1' });
      expect(rejected).toMatchObject({ ok: false, budget: 'tool_calls' });
      expect(capability.counters.renders).toBe(0);
      return null;
    };

    const result = await runDeepEditService(request(), {
      driveAgent: driver,
      budgets: budgets({ maxToolCalls: 1 }),
    });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('budget_exhausted');
    const audit = auditFrom(result.body);
    expect(audit.counters.renders).toBe(0);
  });

  it('classifies candidate-limit exhaustion as budget_exhausted, not no_finalize', async () => {
    const driver: DeepEditDriver = async ({ executeTool }) => {
      await executeTool('sandbox_apply_patch', { baseCandidateId: 'base', patch: VALID_PATCH });
      const denied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      expect(denied).toMatchObject({ ok: false, budget: 'candidate_limit' });
      return null;
    };

    const result = await runDeepEditService(request(), {
      driveAgent: driver,
      budgets: budgets({ maxCandidates: 1 }),
    });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('budget_exhausted');
    expect(String(result.body.error)).toContain('candidate_limit');
  });

  it('aborts an in-flight engine check when the request is cancelled', async () => {
    mocked.loadWebMscoreInProcess.mockResolvedValue({
      load: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    });
    const parent = new AbortController();
    const driver: DeepEditDriver = async ({ executeTool }) => {
      const applied = await executeTool('sandbox_apply_patch', {
        baseCandidateId: 'base',
        patch: VALID_PATCH,
      });
      const pendingCheck = executeTool('sandbox_engine_check', {
        candidateId: applied.candidateId,
      });
      setTimeout(() => parent.abort(new Error('client went away')), 20);
      const checked = await pendingCheck;
      expect(checked.ok).toBe(false);
      expect(String(checked.error)).toContain('cancelled');
      return null;
    };

    const result = await runDeepEditService(request(), {
      driveAgent: driver,
      signal: parent.signal,
    });

    expect(result.status).toBe(422);
  });

  it('rejects a misspelled provider instead of coercing it to OpenAI', async () => {
    const driver = vi.fn();
    const result = await runDeepEditService(request({ provider: 'anthorpic' }), {
      driveAgent: driver,
    });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toContain('OpenAI and Anthropic');
    expect(driver).not.toHaveBeenCalled();
  });

  it('enforces the Phase 1 prompt-size cap on client prompt text', async () => {
    const priorCap = process.env.MUSIC_PATCH_MAX_PROMPT_CHARS;
    process.env.MUSIC_PATCH_MAX_PROMPT_CHARS = '10000';
    try {
      const driver = vi.fn();
      const result = await runDeepEditService(request({ promptText: 'x'.repeat(10_001) }), {
        driveAgent: driver,
      });
      expect(result.status).toBe(413);
      expect(String(result.body.error)).toContain('character limit');
      expect(driver).not.toHaveBeenCalled();
    } finally {
      if (priorCap === undefined) {
        delete process.env.MUSIC_PATCH_MAX_PROMPT_CHARS;
      } else {
        process.env.MUSIC_PATCH_MAX_PROMPT_CHARS = priorCap;
      }
    }
  });

  it('returns typed request errors before any loop work', async () => {
    const driver = vi.fn();
    const missingInstruction = await runDeepEditService(request({ prompt: '' }), {
      driveAgent: driver,
    });
    expect(missingInstruction.status).toBe(400);
    const badProvider = await runDeepEditService(request({ provider: 'gemini' }), {
      driveAgent: driver,
    });
    expect(badProvider.status).toBe(400);
    expect(String(badProvider.body.error)).toContain('OpenAI and Anthropic');
    const withImage = await runDeepEditService(
      request({ image: { mediaType: 'image/png', base64: 'aa' } }),
      { driveAgent: driver },
    );
    expect(withImage.status).toBe(400);
    const notXml = await runDeepEditService(request({ content: 'not xml' }), {
      driveAgent: driver,
    });
    expect(notXml.status).toBe(400);
    expect(driver).not.toHaveBeenCalled();
  });

  it('maps a provider failure in the loop to a 502 with audit', async () => {
    const driver: DeepEditDriver = async () => {
      throw new Error('upstream 500');
    };
    const result = await runDeepEditService(request(), { driveAgent: driver });
    expect(result.status).toBe(502);
    expect(result.body.errorCategory).toBe('provider');
    expect(result.body.deepEdit).toBeTruthy();
  });
});

describe('summarizeMeasureDifferences', () => {
  it('reports changed, added, and removed measures compactly', () => {
    const left =
      '<part id="P1"><measure number="1"><note>a</note></measure><measure number="2"><note>b</note></measure></part>';
    const right =
      '<part id="P1"><measure number="1"><note>a</note></measure><measure number="2"><note>B</note></measure><measure number="3"><note>c</note></measure></part>';
    expect(summarizeMeasureDifferences(left, right)).toMatchObject({
      changedMeasures: ['P1:2'],
      addedMeasures: ['P1:3'],
      removedMeasures: [],
      changedCount: 1,
      addedCount: 1,
      removedCount: 0,
    });
  });
});
