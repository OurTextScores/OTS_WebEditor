import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Usage, type Model, type ModelRequest, type ModelResponse } from '@openai/agents';

const mocked = vi.hoisted(() => ({
  loadWebMscoreInProcess: vi.fn(),
}));

vi.mock('../lib/webmscore-loader', () => ({
  loadWebMscoreInProcess: mocked.loadWebMscoreInProcess,
}));

// This suite runs the REAL @openai/agents Agent/run loop (tool schemas, tool dispatch,
// toolUseBehavior, the LLM-budget model proxy) against a scripted Model, so SDK wiring
// breaks here instead of only in production.
import { tool } from '@openai/agents';
import {
  DEEP_EDIT_TOOL_PARAMETERS,
  runDeepEditService,
} from '../lib/music-services/deep-edit-service';

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

type ScriptedCall = { name: string; args: Record<string, unknown> };

type ProposalView = {
  proposedXml?: unknown;
  verification: { level?: string };
};

type DeepEditAuditView = {
  finalizedCandidateId?: string;
  rationale?: string;
  counters: {
    llmCalls?: number;
    toolCalls?: number;
  };
};

const proposalFrom = (body: Record<string, unknown>) => body.proposal as ProposalView;
const auditFrom = (body: Record<string, unknown>) => body.deepEdit as DeepEditAuditView;

const scriptedModel = (script: ScriptedCall[]): { model: Model; requests: ModelRequest[] } => {
  const requests: ModelRequest[] = [];
  let step = 0;
  const model: Model = {
    getResponse: async (request: ModelRequest): Promise<ModelResponse> => {
      requests.push(request);
      const call = script[Math.min(step, script.length - 1)];
      step += 1;
      return {
        usage: new Usage(),
        output: [
          {
            type: 'function_call',
            callId: `call-${step}`,
            name: call.name,
            status: 'completed',
            arguments: JSON.stringify(call.args),
          },
        ],
      };
    },
    getStreamedResponse: async function* streamed() {
      throw new Error('streaming not used in deep edit');
    },
  };
  return { model, requests };
};

const request = () => ({
  prompt: 'Change the first note to G.',
  content: BASE_XML,
  provider: 'openai',
  model: 'gpt-test-model',
  apiKey: 'sk-test',
});

describe('deep edit tool schemas', () => {
  // OpenAI strict function schemas (the only mode the SDK supports for zod tools) forbid
  // free-form objects: every object node needs enumerated required properties and
  // additionalProperties: false, and every node needs a concrete type. The original
  // z.record-based patch/ops schemas violated this and made OpenAI reject every deep-edit
  // request; this walks the SDK's own serialized schema for each tool to keep it strict.
  const assertStrictCompatible = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => assertStrictCompatible(entry, `${path}[${index}]`));
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === 'object' || record.properties) {
      expect(record.additionalProperties, `${path}.additionalProperties`).toBe(false);
      const properties = (record.properties ?? {}) as Record<string, unknown>;
      const required = Array.isArray(record.required) ? record.required : [];
      for (const key of Object.keys(properties)) {
        expect(required, `${path}.required must include ${key}`).toContain(key);
      }
    }
    for (const [key, value] of Object.entries(record)) {
      assertStrictCompatible(value, `${path}.${key}`);
    }
  };

  it('serializes every tool as a strict function schema', () => {
    for (const [name, parameters] of Object.entries(DEEP_EDIT_TOOL_PARAMETERS)) {
      const definition = tool({
        name,
        description: 'strict-compat check',
        parameters,
        execute: async () => 'ok',
      });
      expect(definition.strict, `${name} must be strict`).toBe(true);
      assertStrictCompatible(definition.parameters, name);
    }
  });
});

describe('deep edit through the real agents SDK loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.loadWebMscoreInProcess.mockResolvedValue({
      load: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
    });
  });

  it('applies, verifies, and finalizes through real tool dispatch', async () => {
    // Arguments use the strict wire shapes: nullable op fields and JSON-encoded ops.
    const strictPatch = {
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'setText',
          path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch/step',
          value: 'G',
          name: null,
        },
      ],
    };
    const { model, requests } = scriptedModel([
      { name: 'sandbox_apply_patch', args: { baseCandidateId: 'base', patch: strictPatch } },
      { name: 'sandbox_measure_diff', args: { candidateId: 'cand-1', againstId: null } },
      { name: 'sandbox_engine_check', args: { candidateId: 'cand-1' } },
      { name: 'finalize', args: { candidateId: 'cand-1', rationale: 'Verified in the engine.' } },
    ]);

    const result = await runDeepEditService(request(), { modelOverride: model });

    expect(result.status).toBe(200);
    expect(proposalFrom(result.body).verification.level).toBe('engine_load');
    expect(String(proposalFrom(result.body).proposedXml)).toContain('<step>G</step>');
    const audit = auditFrom(result.body);
    expect(audit.finalizedCandidateId).toBe('cand-1');
    expect(audit.counters).toMatchObject({ llmCalls: 4, toolCalls: 3 });
    expect(requests.length).toBe(4);
  });

  it('runs scoreops through the JSON-encoded strict argument', async () => {
    const { model } = scriptedModel([
      {
        name: 'sandbox_scoreops',
        args: {
          baseCandidateId: 'base',
          opsJson: JSON.stringify([
            { op: 'set_metadata_text', field: 'title', value: 'Deep Edit Title' },
          ]),
        },
      },
      { name: 'sandbox_engine_check', args: { candidateId: 'cand-1' } },
      { name: 'finalize', args: { candidateId: 'cand-1', rationale: 'ScoreOps verified.' } },
    ]);

    const result = await runDeepEditService(request(), { modelOverride: model });

    expect(result.status).toBe(200);
    expect(proposalFrom(result.body).verification.level).toBe('engine_load');
    expect(String(proposalFrom(result.body).proposedXml)).toContain('Deep Edit Title');
  });

  it('recovers from an invalid finalize inside the real loop', async () => {
    const strictPatch = {
      ...VALID_PATCH,
      ops: VALID_PATCH.ops.map((op) => ({ ...op, name: null })),
    };
    const { model } = scriptedModel([
      { name: 'sandbox_apply_patch', args: { baseCandidateId: 'base', patch: strictPatch } },
      { name: 'sandbox_engine_check', args: { candidateId: 'cand-1' } },
      { name: 'finalize', args: { candidateId: 'cand-99', rationale: 'wrong id' } },
      { name: 'finalize', args: { candidateId: 'cand-1', rationale: 'corrected' } },
    ]);

    const result = await runDeepEditService(request(), { modelOverride: model });

    expect(result.status).toBe(200);
    const audit = auditFrom(result.body);
    expect(audit.finalizedCandidateId).toBe('cand-1');
    expect(audit.rationale).toBe('corrected');
    expect(audit.counters.llmCalls).toBe(4);
  });

  it('stops at the LLM budget through the model proxy and reports exhaustion', async () => {
    const { model } = scriptedModel([
      { name: 'sandbox_measure_diff', args: { candidateId: 'base' } },
    ]);

    const result = await runDeepEditService(request(), {
      modelOverride: model,
      budgets: {
        maxLlmCalls: 2,
        maxToolCalls: 24,
        maxCandidates: 4,
        maxRenders: 3,
        budgetMs: 60_000,
        maxCandidateBytes: 15 * 1024 * 1024,
        maxTotalBytes: 60 * 1024 * 1024,
      },
    });

    expect(result.status).toBe(422);
    expect(result.body.errorCategory).toBe('budget_exhausted');
    const audit = auditFrom(result.body);
    expect(audit.counters.llmCalls).toBe(2);
  });
});
