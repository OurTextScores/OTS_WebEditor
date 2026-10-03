import { Agent, Runner, tool, type Model } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
import { OpenAIResponsesModel } from '@openai/agents-openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { OpenAI } from 'openai';
import { z } from 'zod';

import { renderMusicSnapshot } from '../music-conversion';
import { loadWebMscoreInProcess, type Score } from '../webmscore-loader';
import { buildAiEditProposal, type AiEditProposal } from './ai-edit-proposal';
import {
  asRecord,
  looksLikeMusicXml,
  resolvedScoreSnapshot,
  resolveScoreContent,
} from './score-request';
import {
  DEEP_EDIT_BASE_ID,
  DEEP_EDIT_LEVEL_RANK,
  DeepEditCapability,
  type DeepEditBudgets,
  type DeepEditVerificationLevel,
} from './deep-edit-capability';
import {
  applyMusicXmlPatch,
  parseMusicXmlPatch,
  resolveApiKeyForProvider,
  resolveProvider,
} from './patch-service';
import { createProposalContinuityToken } from './proposal-session-context';
import { runFunctionalHarmonyAnalyzeService } from './functional-harmony-service';
import { runHarmonyAnalyzeService } from './harmony-service';
import { runMusicScoreOpsPreviewService } from './scoreops-service';
import { randomUUID } from 'node:crypto';
import { type TraceContext } from '../trace-http';
import { findIntroducedMusicXmlStructuralIssues } from '../musicxml-structural-validation';
import {
  AI_EDIT_EFFORT_PROFILES,
  DEFAULT_AI_EDIT_EFFORT,
  parseAiEditEffort,
  type AiEditEffort,
} from '../ai-edit-effort';
import {
  reportAiEditProgress,
  type AiEditProgressReporter,
  type AiEditProgressTool,
} from '../ai-edit-progress';

// Phase 3 deep-edit loop (design §7): a bounded agent tries alternative edits against
// capability-owned in-memory candidates, and the server-side finalize gate decides
// whether the finalized candidate ships as a normal AiEditProposal.

export type DeepEditErrorCategory =
  'no_finalize' | 'gate_failed' | 'budget_exhausted' | 'provider' | 'timeout' | 'request';

export type DeepEditAudit = {
  effort: AiEditEffort;
  budgets: DeepEditBudgets;
  finalizedCandidateId: string | null;
  rationale: string;
  candidates: Array<
    ReturnType<DeepEditCapability['auditCandidates']>[number] & {
      diff: ReturnType<typeof summarizeMeasureDifferences>;
    }
  >;
  counters: { llmCalls: number; toolCalls: number; renders: number };
  environment: DeepEditCapability['environment'];
  elapsedMs: number;
};

export type DeepEditServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

type DeepEditToolResult = Record<string, unknown> & { ok: boolean };

export type DeepEditDriver = (args: {
  capability: DeepEditCapability;
  executeTool: (name: string, toolArgs: Record<string, unknown>) => Promise<DeepEditToolResult>;
  instructions: string;
  prompt: string;
  onProgress?: AiEditProgressReporter;
}) => Promise<{ candidateId: string; rationale: string } | null>;

const MAX_BUDGET_MS = 600_000;
const DEFAULT_MAX_CANDIDATE_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_RATIONALE_CHARS = 2_000;
const MAX_ANALYSIS_RESULT_CHARS = 4_000;
const MAX_TOOL_ERROR_CHARS = 2_000;

const readClampedEnvInteger = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
};

const resolveDeepProfileLimit = (args: {
  effort: AiEditEffort;
  profileValue: number;
  envName: string;
  minimum: number;
  maximum: number;
}) => {
  const configuredValue = Number(process.env[args.envName]);
  if (!Number.isFinite(configuredValue)) {
    return Math.min(args.maximum, Math.max(args.minimum, Math.floor(args.profileValue)));
  }
  const configured = Math.min(args.maximum, Math.max(args.minimum, Math.floor(configuredValue)));
  return args.effort === DEFAULT_AI_EDIT_EFFORT
    ? configured
    : Math.min(args.profileValue, configured);
};

export const resolveDeepEditBudgets = (effortInput?: unknown): DeepEditBudgets => {
  const effort = parseAiEditEffort(effortInput);
  const profile = AI_EDIT_EFFORT_PROFILES[effort].deep;
  return {
    maxLlmCalls: resolveDeepProfileLimit({
      effort,
      profileValue: profile.maxLlmCalls,
      envName: 'MUSIC_DEEP_EDIT_MAX_LLM_CALLS',
      minimum: 1,
      maximum: 32,
    }),
    maxToolCalls: resolveDeepProfileLimit({
      effort,
      profileValue: profile.maxToolCalls,
      envName: 'MUSIC_DEEP_EDIT_MAX_TOOL_CALLS',
      minimum: 1,
      maximum: 64,
    }),
    maxCandidates: resolveDeepProfileLimit({
      effort,
      profileValue: profile.maxCandidates,
      envName: 'MUSIC_DEEP_EDIT_MAX_CANDIDATES',
      minimum: 1,
      maximum: 8,
    }),
    maxRenders: resolveDeepProfileLimit({
      effort,
      profileValue: profile.maxRenders,
      envName: 'MUSIC_DEEP_EDIT_MAX_RENDERS',
      minimum: 0,
      maximum: 8,
    }),
    budgetMs: resolveDeepProfileLimit({
      effort,
      profileValue: profile.budgetMs,
      envName: 'MUSIC_DEEP_EDIT_BUDGET_MS',
      minimum: 10_000,
      maximum: MAX_BUDGET_MS,
    }),
    maxCandidateBytes: readClampedEnvInteger(
      'MUSIC_DEEP_EDIT_MAX_CANDIDATE_BYTES',
      DEFAULT_MAX_CANDIDATE_BYTES,
      10_000,
      50 * 1024 * 1024,
    ),
    maxTotalBytes: readClampedEnvInteger(
      'MUSIC_DEEP_EDIT_MAX_TOTAL_BYTES',
      DEFAULT_MAX_TOTAL_BYTES,
      10_000,
      200 * 1024 * 1024,
    ),
  };
};

const boundError = (message: string) => message.slice(0, MAX_TOOL_ERROR_CHARS);

const budgetToolError = (reason: string): DeepEditToolResult => ({
  ok: false,
  error: `Budget exhausted (${reason}). Call finalize with your best verified candidate now.`,
  budget: reason,
});

const invalidIdError = (id: unknown): DeepEditToolResult => ({
  ok: false,
  error: `"${String(id).slice(0, 64)}" is not a live candidate id. Valid ids are "${DEEP_EDIT_BASE_ID}" and ids returned by sandbox tools.`,
});

/** Per-part measure hash map used for compact candidate diffs. */
const measureHashes = (xml: string): Map<string, string> => {
  const map = new Map<string, string>();
  const partRegex = /<part\b([^>]*)>([\s\S]*?)<\/part>/gi;
  let partMatch: RegExpExecArray | null;
  let partOrdinal = 0;
  while ((partMatch = partRegex.exec(xml)) !== null) {
    const partId = partMatch[1]?.match(/\bid="([^"]+)"/i)?.[1] || `#${partOrdinal}`;
    partOrdinal += 1;
    const measureRegex = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/gi;
    let measureMatch: RegExpExecArray | null;
    while ((measureMatch = measureRegex.exec(partMatch[2] || '')) !== null) {
      const numberText = measureMatch[1]?.match(/\bnumber="([^"]+)"/i)?.[1] || '';
      let hash = 5381;
      const body = measureMatch[2] || '';
      for (let i = 0; i < body.length; i += 1) {
        hash = ((hash << 5) + hash + body.charCodeAt(i)) | 0;
      }
      map.set(`${partId}:${numberText}`, `${(hash >>> 0).toString(16)}:${body.length}`);
    }
  }
  return map;
};

export const summarizeMeasureDifferences = (leftXml: string, rightXml: string) => {
  const left = measureHashes(leftXml);
  const right = measureHashes(rightXml);
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [key, hash] of right) {
    const before = left.get(key);
    if (before === undefined) {
      added.push(key);
    } else if (before !== hash) {
      changed.push(key);
    }
  }
  for (const key of left.keys()) {
    if (!right.has(key)) {
      removed.push(key);
    }
  }
  const cap = 50;
  return {
    changedMeasures: changed.slice(0, cap),
    addedMeasures: added.slice(0, cap),
    removedMeasures: removed.slice(0, cap),
    changedCount: changed.length,
    addedCount: added.length,
    removedCount: removed.length,
  };
};

/**
 * Bound in-flight tool work by the capability signal and remaining budget. webmscore
 * loads and the analysis services expose no abort API, so a raced timeout returns
 * control (and a truthful error) even though the underlying work may run to completion
 * in the background.
 */
const withSandboxDeadline = async <T>(
  capability: DeepEditCapability,
  work: Promise<T>,
  label: string,
  maxMs = 60_000,
): Promise<T> => {
  const remaining = Math.max(1, Math.min(maxMs, capability.remainingMs()));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), remaining);
        abortListener = () => reject(new Error(`${label} was cancelled.`));
        if (capability.signal.aborted) {
          abortListener();
        } else {
          capability.signal.addEventListener('abort', abortListener, { once: true });
        }
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (abortListener) {
      capability.signal.removeEventListener('abort', abortListener);
    }
  }
};

const describeError = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const text = String(error ?? '').trim();
  return text || fallback;
};

const engineLoadXml = async (capability: DeepEditCapability, xml: string): Promise<void> => {
  let score: Score | null = null;
  try {
    score = await withSandboxDeadline(
      capability,
      (async () => {
        const webMscore = await loadWebMscoreInProcess();
        return webMscore.load('musicxml', new TextEncoder().encode(xml));
      })(),
      'Engine check',
    );
  } finally {
    try {
      score?.destroy?.();
    } catch {
      // destroy failures must not mask the verification result
    }
  }
};

const ENGINE_UNAVAILABLE_MESSAGE =
  'The notation engine is unavailable in this deployment. Skip engine checks and finalize your best candidate.';
const RENDER_UNAVAILABLE_MESSAGE =
  'Rendering is unavailable in this deployment. Skip render checks and finalize your best candidate.';

const verifyCandidateEngine = async (
  capability: DeepEditCapability,
  candidateId: string,
): Promise<DeepEditToolResult> => {
  const xml = capability.resolveXml(candidateId);
  if (xml === null || candidateId === DEEP_EDIT_BASE_ID) {
    return invalidIdError(candidateId);
  }
  if (capability.environment.engine === 'unavailable') {
    return { ok: false, candidateId, error: ENGINE_UNAVAILABLE_MESSAGE };
  }
  try {
    await engineLoadXml(capability, xml);
    capability.environment.engine = 'available';
    capability.recordVerification(candidateId, 'engine_load');
    return { ok: true, candidateId, verification: 'engine_load' };
  } catch (error) {
    const message = boundError(describeError(error, 'Engine load failed.'));
    // Cancellation/deadline is neither the candidate's fault nor evidence about the
    // deployment; report it as-is without probing or raising the gate bar.
    if (capability.expired()) {
      return { ok: false, candidateId, error: message };
    }
    // Distinguish a bad candidate from a deployment without the engine: the user's own
    // base score is known-good, so if it fails the same load, the runtime is missing and
    // the candidate is not to blame — and the attempt must not raise the gate bar.
    if (capability.environment.engine === 'unknown') {
      try {
        await engineLoadXml(capability, capability.baseXml);
        capability.environment.engine = 'available';
      } catch {
        capability.environment.engine = 'unavailable';
        console.warn(
          '[deep-edit] Notation engine unavailable; engine verification disabled for this request.',
          {
            detail: message.slice(0, 300),
          },
        );
        return { ok: false, candidateId, error: ENGINE_UNAVAILABLE_MESSAGE };
      }
    }
    capability.noteAttemptedLevel('engine_load');
    capability.recordVerification(candidateId, 'engine_load', message);
    return { ok: false, candidateId, error: message };
  }
};

const verifyCandidateRender = async (
  capability: DeepEditCapability,
  candidateId: string,
): Promise<DeepEditToolResult> => {
  const xml = capability.resolveXml(candidateId);
  if (xml === null || candidateId === DEEP_EDIT_BASE_ID) {
    return invalidIdError(candidateId);
  }
  if (capability.environment.render === 'unavailable') {
    return { ok: false, candidateId, error: RENDER_UNAVAILABLE_MESSAGE };
  }
  const renderXml = (content: string) =>
    withSandboxDeadline(
      capability,
      renderMusicSnapshot({
        content,
        format: 'png',
        timeoutMs: Math.min(60_000, Math.max(1_000, capability.remainingMs())),
      }),
      'Render',
    );
  try {
    const { buffer, mimeType } = await renderXml(xml);
    capability.environment.render = 'available';
    capability.recordVerification(candidateId, 'render');
    return {
      ok: true,
      candidateId,
      verification: 'render',
      mimeType,
      renderedBytes: buffer.byteLength,
    };
  } catch (error) {
    const message = boundError(describeError(error, 'Render failed.'));
    if (capability.expired()) {
      return { ok: false, candidateId, error: message };
    }
    if (capability.environment.render === 'unknown') {
      try {
        await renderXml(capability.baseXml);
        capability.environment.render = 'available';
      } catch {
        capability.environment.render = 'unavailable';
        console.warn(
          '[deep-edit] Rendering unavailable; render verification disabled for this request.',
          {
            detail: message.slice(0, 300),
          },
        );
        return { ok: false, candidateId, error: RENDER_UNAVAILABLE_MESSAGE };
      }
    }
    capability.noteAttemptedLevel('render');
    return { ok: false, candidateId, error: message };
  }
};

/**
 * Pure tool dispatch: every sandbox tool the agent can call, minus `finalize` (which the
 * loop owns). Exported for direct unit testing without an LLM.
 */
export async function executeSandboxTool(
  capability: DeepEditCapability,
  name: string,
  args: Record<string, unknown>,
): Promise<DeepEditToolResult> {
  // Finalize charges nothing: an exhausted run must still be able to end.
  if (name === 'finalize') {
    const candidateId = String(args.candidateId ?? '');
    const rationale = String(args.rationale ?? '').slice(0, MAX_RATIONALE_CHARS);
    const finalized = capability.tryFinalize(candidateId, rationale);
    return finalized.ok ? { ok: true, candidateId } : { ok: false, error: finalized.error };
  }
  const charged = capability.chargeToolCall();
  if (!charged.ok) {
    return budgetToolError(charged.reason);
  }
  if (name === 'sandbox_render') {
    const rendered = capability.chargeRender();
    if (!rendered.ok) {
      return budgetToolError(rendered.reason);
    }
  }

  switch (name) {
    case 'sandbox_apply_patch': {
      const sourceId = String(args.baseCandidateId ?? DEEP_EDIT_BASE_ID);
      if (!capability.isValidSourceId(sourceId)) {
        return invalidIdError(sourceId);
      }
      // Strict tool schemas express optional op fields as nullable; strip nulls so the
      // shared patch parser sees the canonical shape.
      const patchInput = asRecord(args.patch);
      const normalizedPatch =
        patchInput && Array.isArray(patchInput.ops)
          ? {
              ...patchInput,
              ops: patchInput.ops.map((op) => {
                const record = asRecord(op);
                if (!record) {
                  return op;
                }
                return Object.fromEntries(
                  Object.entries(record).filter(([, value]) => value !== null),
                );
              }),
            }
          : (args.patch ?? null);
      const parsed = parseMusicXmlPatch(JSON.stringify(normalizedPatch));
      if (parsed.error || !parsed.patch) {
        return {
          ok: false,
          error: boundError(parsed.error || 'Invalid musicxml-patch@1 payload.'),
        };
      }
      const baseXml = capability.resolveXml(sourceId);
      if (baseXml === null) {
        return invalidIdError(sourceId);
      }
      const applied = await applyMusicXmlPatch(baseXml, parsed.patch);
      if (applied.error || !applied.xml.trim()) {
        return {
          ok: false,
          error: boundError(applied.error || 'Patch application returned empty MusicXML.'),
        };
      }
      const structuralIssues = findIntroducedMusicXmlStructuralIssues(baseXml, applied.xml);
      if (structuralIssues.length) {
        return {
          ok: false,
          error: boundError(`Patch introduced invalid MusicXML: ${structuralIssues[0].message}`),
        };
      }
      const minted = capability.mintCandidate({
        parentId: sourceId,
        xml: applied.xml,
        createdByTool: 'apply_patch',
        patch: parsed.patch,
        verification: 'patch_apply',
      });
      if (!minted.ok) {
        return budgetToolError(minted.reason);
      }
      return {
        ok: true,
        candidateId: minted.candidate.id,
        verification: 'patch_apply',
        diff: summarizeMeasureDifferences(baseXml, applied.xml),
      };
    }

    case 'sandbox_scoreops': {
      const sourceId = String(args.baseCandidateId ?? DEEP_EDIT_BASE_ID);
      if (!capability.isValidSourceId(sourceId)) {
        return invalidIdError(sourceId);
      }
      const baseXml = capability.resolveXml(sourceId);
      if (baseXml === null) {
        return invalidIdError(sourceId);
      }
      let ops: unknown = args.ops;
      if (!Array.isArray(ops) && typeof args.opsJson === 'string') {
        try {
          ops = JSON.parse(args.opsJson);
        } catch {
          return { ok: false, error: 'opsJson is not valid JSON.' };
        }
      }
      if (!Array.isArray(ops) || ops.length === 0) {
        return { ok: false, error: 'Provide a non-empty JSON array of ScoreOps operations.' };
      }
      const result = await runMusicScoreOpsPreviewService({
        content: baseXml,
        ops,
      });
      const proposal = asRecord(result.body.proposal);
      const proposedXml = typeof proposal?.proposedXml === 'string' ? proposal.proposedXml : '';
      if (result.status >= 400 || !proposedXml.trim()) {
        const detail = asRecord(result.body.error);
        const message =
          typeof result.body.error === 'string'
            ? result.body.error
            : typeof detail?.message === 'string'
              ? detail.message
              : 'ScoreOps execution failed.';
        return { ok: false, error: boundError(message) };
      }
      const structuralIssues = findIntroducedMusicXmlStructuralIssues(baseXml, proposedXml);
      if (structuralIssues.length) {
        return {
          ok: false,
          error: boundError(`ScoreOps introduced invalid MusicXML: ${structuralIssues[0].message}`),
        };
      }
      const minted = capability.mintCandidate({
        parentId: sourceId,
        xml: proposedXml,
        createdByTool: 'scoreops',
        verification: 'tool_execution',
      });
      if (!minted.ok) {
        return budgetToolError(minted.reason);
      }
      return {
        ok: true,
        candidateId: minted.candidate.id,
        verification: 'tool_execution',
        changes: asRecord(result.body.changes)?.summary ?? null,
        diff: summarizeMeasureDifferences(baseXml, proposedXml),
      };
    }

    case 'sandbox_engine_check':
      return verifyCandidateEngine(capability, String(args.candidateId ?? ''));

    case 'sandbox_render':
      return verifyCandidateRender(capability, String(args.candidateId ?? ''));

    case 'sandbox_measure_diff': {
      const candidateId = String(args.candidateId ?? '');
      const againstId = String(args.againstId ?? DEEP_EDIT_BASE_ID);
      if (!capability.isValidSourceId(candidateId) || !capability.isValidSourceId(againstId)) {
        return invalidIdError(capability.isValidSourceId(candidateId) ? againstId : candidateId);
      }
      const left = capability.resolveXml(againstId);
      const right = capability.resolveXml(candidateId);
      if (left === null || right === null) {
        return invalidIdError(candidateId);
      }
      return { ok: true, candidateId, againstId, diff: summarizeMeasureDifferences(left, right) };
    }

    case 'sandbox_analyze': {
      const candidateId = String(args.candidateId ?? '');
      const kind = args.kind === 'functional_harmony' ? 'functional_harmony' : 'harmony';
      const xml = capability.resolveXml(candidateId);
      if (xml === null || !capability.isValidSourceId(candidateId)) {
        return invalidIdError(candidateId);
      }
      // persistArtifacts must be explicitly off: the functional-harmony service defaults
      // it on, and sandbox analysis may never leave artifacts behind.
      const result = await withSandboxDeadline(
        capability,
        kind === 'functional_harmony'
          ? runFunctionalHarmonyAnalyzeService({ content: xml, persistArtifacts: false })
          : runHarmonyAnalyzeService({ content: xml, persistArtifacts: false }),
        'Analysis',
      );
      if (result.status >= 400) {
        const message =
          typeof result.body.error === 'string' ? result.body.error : 'Analysis failed.';
        return { ok: false, error: boundError(message) };
      }
      const omittedKeys = new Set([
        'content',
        'annotatedXml',
        'artifacts',
        'jsonArtifact',
        'rntxtArtifact',
        'annotatedArtifact',
        'sourceArtifactId',
      ]);
      const rest = Object.fromEntries(
        Object.entries(result.body).filter(([key]) => !omittedKeys.has(key)),
      );
      return {
        ok: true,
        candidateId,
        kind,
        analysis: JSON.stringify(rest).slice(0, MAX_ANALYSIS_RESULT_CHARS),
      };
    }

    case 'sandbox_record_score': {
      const candidateId = String(args.candidateId ?? '');
      if (!capability.isValidSourceId(candidateId) || candidateId === DEEP_EDIT_BASE_ID) {
        return invalidIdError(candidateId);
      }
      const kind = typeof args.kind === 'string' ? args.kind.trim() : '';
      const value =
        typeof args.value === 'number' || typeof args.value === 'string' ? args.value : '';
      if (!kind || value === '') {
        return { ok: false, error: 'record_score requires kind and a string/number value.' };
      }
      const recorded = capability.recordScore(candidateId, {
        kind,
        value,
        ...(typeof args.detail === 'string' ? { detail: args.detail } : {}),
      });
      return recorded
        ? { ok: true, candidateId }
        : { ok: false, error: 'Score limit reached for this candidate.' };
    }

    default:
      return { ok: false, error: `Unknown sandbox tool "${name.slice(0, 64)}".` };
  }
}

// Tool parameter schemas. The agents SDK only supports zod tools in OpenAI strict mode,
// which forbids free-form objects (no z.record/z.unknown: every object needs enumerated,
// required properties and additionalProperties: false) and requires optionals to be
// expressed as required-but-nullable. ScoreOps ops are a large discriminated union, so
// they travel as a JSON-encoded string and are validated server-side.
const CANDIDATE_ID_SCHEMA = z.string().min(1).max(32);

const STRICT_PATCH_SCHEMA = z.object({
  format: z.literal('musicxml-patch@1'),
  ops: z.array(
    z.object({
      op: z.enum(['replace', 'setText', 'setAttr', 'insertBefore', 'insertAfter', 'delete']),
      path: z.string(),
      value: z.string().nullable(),
      name: z.string().nullable(),
    }),
  ),
});

export const DEEP_EDIT_TOOL_PARAMETERS: Record<string, z.ZodObject> = {
  sandbox_apply_patch: z.object({
    baseCandidateId: CANDIDATE_ID_SCHEMA,
    patch: STRICT_PATCH_SCHEMA,
  }),
  sandbox_scoreops: z.object({
    baseCandidateId: CANDIDATE_ID_SCHEMA,
    opsJson: z.string().min(2).describe('JSON-encoded array of ScoreOps operation objects'),
  }),
  sandbox_engine_check: z.object({ candidateId: CANDIDATE_ID_SCHEMA }),
  sandbox_render: z.object({ candidateId: CANDIDATE_ID_SCHEMA }),
  sandbox_measure_diff: z.object({
    candidateId: CANDIDATE_ID_SCHEMA,
    againstId: CANDIDATE_ID_SCHEMA.nullable().describe(
      'Compare against this candidate, or null for base',
    ),
  }),
  sandbox_analyze: z.object({
    candidateId: CANDIDATE_ID_SCHEMA,
    kind: z.enum(['harmony', 'functional_harmony']),
  }),
  sandbox_record_score: z.object({
    candidateId: CANDIDATE_ID_SCHEMA,
    kind: z.string().min(1).max(64),
    value: z.union([z.string().max(200), z.number()]),
    detail: z.string().max(500).nullable(),
  }),
  finalize: z.object({
    candidateId: CANDIDATE_ID_SCHEMA,
    rationale: z.string().min(1).max(MAX_RATIONALE_CHARS),
  }),
};

class DeepEditLlmBudgetError extends Error {
  constructor(readonly reason: string) {
    super(`Deep edit LLM budget exhausted (${reason}).`);
    this.name = 'DeepEditLlmBudgetError';
  }
}

const modelForRequest = (
  provider: 'openai' | 'anthropic',
  apiKey: string,
  modelName: string,
): Model => {
  if (provider === 'anthropic') {
    const client = createAnthropic({ apiKey });
    return aisdk(client(modelName));
  }
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  return new OpenAIResponsesModel(client, modelName);
};

const withLlmBudget = (
  inner: Model,
  capability: DeepEditCapability,
  onProgress?: AiEditProgressReporter,
): Model =>
  new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'getResponse' || prop === 'getStreamedResponse') {
        return (...callArgs: unknown[]) => {
          const charge = capability.chargeLlmCall();
          if (!charge.ok) {
            throw new DeepEditLlmBudgetError(charge.reason);
          }
          reportAiEditProgress(onProgress, {
            phase: 'provider.attempt_started',
            message: `Starting Deep Edit model turn ${capability.counters.llmCalls}`,
            llmCalls: capability.counters.llmCalls,
          });
          return (target as unknown as Record<string, (...inner: unknown[]) => unknown>)[
            prop as string
          ](...callArgs);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

const SANDBOX_INSTRUCTIONS = [
  'You are a MusicXML deep-edit agent working in an isolated sandbox.',
  'The user\'s current score is candidate "base". You cannot modify base or the user\'s score; you create candidates.',
  'Workflow: create one or more candidate edits, verify them, compare them, then call finalize with the best candidate id.',
  "Do not finalize until the candidate materially satisfies the user's musical request. A formatting-only change or an unrelated duration/metadata edit is not success.",
  'When changing a rest into a pitched note, replace the note origin: a MusicXML <note> must contain exactly one of <pitch>, <unpitched>, or <rest>, never both <rest> and <pitch>.',
  '',
  'Tools:',
  '- sandbox_apply_patch(baseCandidateId, patch): apply a musicxml-patch@1 JSON object to a candidate. Ops: replace, setText, setAttr, insertBefore, insertAfter, delete. Each XPath must match exactly one node. On failure you get the exact apply error; fix the patch and retry.',
  '- sandbox_scoreops(baseCandidateId, opsJson): structured score operations (transpose, set_key_signature, set_time_signature, etc.). opsJson is a JSON-encoded array of operation objects.',
  '- sandbox_engine_check(candidateId): load the candidate in the notation engine. Do this for every candidate you might finalize.',
  '- sandbox_render(candidateId): full render verification (strongest check; limited budget).',
  '- sandbox_measure_diff(candidateId, againstId?): compact per-measure diff versus base or another candidate.',
  '- sandbox_analyze(candidateId, kind): "harmony" or "functional_harmony" analysis report.',
  '- sandbox_record_score(candidateId, kind, value, detail?): record an assessment for the audit trail.',
  '- finalize(candidateId, rationale): REQUIRED final call. Names the candidate to propose to the user.',
  '',
  'Budgets are strict and request-wide. When a tool reports budget exhaustion, immediately finalize your best verified candidate.',
  'The user commits changes with Apply in their editor; you only propose. Never claim an edit was applied.',
].join('\n');

const defaultDriver: (
  provider: 'openai' | 'anthropic',
  apiKey: string,
  modelName: string,
  modelOverride?: Model,
) => DeepEditDriver =
  (provider, apiKey, modelName, modelOverride) =>
  async ({ capability, executeTool, instructions, prompt, onProgress }) => {
    const jsonTool = (name: string, description: string) =>
      tool({
        name,
        description,
        parameters: DEEP_EDIT_TOOL_PARAMETERS[name],
        execute: async (input: unknown) =>
          JSON.stringify(await executeTool(name, asRecord(input) ?? {})),
      });

    const agent = new Agent({
      name: 'DeepEdit',
      instructions,
      model: withLlmBudget(
        modelOverride ?? modelForRequest(provider, apiKey, modelName),
        capability,
        onProgress,
      ),
      modelSettings: { toolChoice: 'required' },
      tools: [
        jsonTool(
          'sandbox_apply_patch',
          'Apply a musicxml-patch@1 to a candidate, minting a new candidate. Use null for op fields you do not need.',
        ),
        jsonTool(
          'sandbox_scoreops',
          'Run structured score operations against a candidate, minting a new candidate. opsJson is a JSON-encoded array of operation objects.',
        ),
        jsonTool('sandbox_engine_check', 'Load a candidate in the notation engine to verify it.'),
        jsonTool('sandbox_render', 'Render a candidate as the strongest verification level.'),
        jsonTool(
          'sandbox_measure_diff',
          'Summarize per-measure differences between candidates. Pass null as againstId to compare with base.',
        ),
        jsonTool('sandbox_analyze', 'Run a harmony or functional-harmony analysis on a candidate.'),
        jsonTool('sandbox_record_score', 'Record an assessment score for a candidate.'),
        jsonTool(
          'finalize',
          'Finish the deep edit by naming the candidate to propose, with a short rationale. Fails (and lets you retry) if the id is not a candidate you created.',
        ),
      ],
      // The loop ends only when finalize actually succeeded; a finalize with an unknown
      // candidate id returns a tool error the model can recover from.
      toolUseBehavior: () =>
        capability.finalized()
          ? {
              isFinalOutput: true,
              isInterrupted: undefined,
              finalOutput: JSON.stringify({ ok: true }),
            }
          : { isFinalOutput: false, isInterrupted: undefined },
    });

    try {
      const runner = new Runner({ tracingDisabled: true });
      await runner.run(agent, prompt, {
        maxTurns: capability.budgets.maxLlmCalls + 2,
        signal: capability.signal,
      });
    } catch (error) {
      if (error instanceof DeepEditLlmBudgetError || capability.signal.aborted) {
        return capability.finalized();
      }
      throw error;
    }
    return capability.finalized();
  };

const buildDeepEditPrompt = (instruction: string, baseXml: string) =>
  [`EDIT REQUEST:\n${instruction}`, '', 'CURRENT MUSICXML (candidate "base"):', baseXml].join('\n');

const errorResult = (
  status: number,
  category: DeepEditErrorCategory,
  message: string,
  audit?: DeepEditAudit,
): DeepEditServiceResult => ({
  status,
  body: {
    error: message,
    errorCategory: category,
    ...(audit ? { deepEdit: audit } : {}),
  },
});

export async function runDeepEditService(
  body: unknown,
  options?: {
    traceContext?: TraceContext;
    signal?: AbortSignal;
    driveAgent?: DeepEditDriver;
    budgets?: DeepEditBudgets;
    /** Test seam: run the real agents-SDK loop against a scripted model. */
    modelOverride?: Model;
    onProgress?: AiEditProgressReporter;
  },
): Promise<DeepEditServiceResult> {
  const startedAt = Date.now();
  const data = asRecord(body);
  const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
  const promptText = typeof data?.promptText === 'string' ? data.promptText.trim() : '';
  // Strict provider parse: resolveProvider coerces unknown values to 'openai', which
  // could route a non-OpenAI credential to the wrong upstream. Deep Edit rejects
  // anything it does not support, byte for byte, before touching keys.
  const rawProvider = typeof data?.provider === 'string' ? data.provider.trim().toLowerCase() : '';
  if (rawProvider !== 'openai' && rawProvider !== 'anthropic') {
    return errorResult(400, 'request', 'Deep Edit supports OpenAI and Anthropic models.');
  }
  const provider = resolveProvider(rawProvider);
  const requestedModel = typeof data?.model === 'string' ? data.model.trim() : '';
  const effort = parseAiEditEffort(data?.editEffort ?? data?.effort);

  if (!prompt && !promptText) {
    return errorResult(400, 'request', 'An edit instruction is required.');
  }
  if (data?.image != null || data?.pdf != null) {
    return errorResult(400, 'request', 'Image and PDF context are not supported in Deep Edit yet.');
  }
  if (provider !== 'openai' && provider !== 'anthropic') {
    return errorResult(400, 'request', 'Deep Edit supports OpenAI and Anthropic models.');
  }
  if (!requestedModel) {
    return errorResult(400, 'request', 'Select a model for Deep Edit.');
  }
  const apiKeyInput = (
    typeof data?.apiKey === 'string'
      ? data.apiKey
      : typeof data?.api_key === 'string'
        ? data.api_key
        : ''
  ).trim();
  const apiKey = resolveApiKeyForProvider(provider, apiKeyInput);
  if (!apiKey) {
    return errorResult(
      401,
      'request',
      `Missing ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key.`,
    );
  }

  const resolution = await resolveScoreContent(body);
  if (resolution.error) {
    return {
      status: resolution.error.status,
      body: { ...resolution.error.body, errorCategory: 'request' },
    };
  }
  const baseXml = resolution.xml;
  if (!looksLikeMusicXml(baseXml) || !/<score-(?:partwise|timewise)\b/i.test(baseXml)) {
    return errorResult(400, 'request', 'Base content must be MusicXML.');
  }

  const budgets = options?.budgets ?? resolveDeepEditBudgets(effort);
  // Phase 1's content/prompt caps apply here too (same env vars, same defaults), on top
  // of the sandbox candidate byte cap.
  const maximumContentBytes = readClampedEnvInteger(
    'MUSIC_PATCH_MAX_CONTENT_BYTES',
    10 * 1024 * 1024,
    1_000,
    50 * 1024 * 1024,
  );
  const maximumPromptChars = readClampedEnvInteger(
    'MUSIC_PATCH_MAX_PROMPT_CHARS',
    12 * 1024 * 1024,
    1_000,
    50 * 1024 * 1024,
  );
  const contentBytes = Buffer.byteLength(baseXml, 'utf8');
  if (contentBytes > maximumContentBytes) {
    return errorResult(
      413,
      'request',
      `Base MusicXML exceeds the ${maximumContentBytes} byte limit.`,
    );
  }
  if (contentBytes > budgets.maxCandidateBytes) {
    return errorResult(
      413,
      'request',
      `Base MusicXML exceeds the ${budgets.maxCandidateBytes} byte Deep Edit limit.`,
    );
  }
  const loopPrompt = promptText || buildDeepEditPrompt(prompt, baseXml);
  if (loopPrompt.length > maximumPromptChars) {
    return errorResult(
      413,
      'request',
      `Deep Edit prompt exceeds the ${maximumPromptChars} character limit.`,
    );
  }

  reportAiEditProgress(options?.onProgress, {
    phase: 'request.validated',
    message: 'Deep Edit request and base score validated',
  });

  const capability = new DeepEditCapability({
    baseXml,
    budgets,
    parentSignal: options?.signal,
  });
  reportAiEditProgress(options?.onProgress, {
    phase: 'deep.started',
    message: 'Deep Edit sandbox started',
  });
  const auditFor = (finalizedCandidateId: string | null, rationale: string): DeepEditAudit => ({
    effort,
    budgets: { ...budgets },
    finalizedCandidateId,
    rationale,
    candidates: capability.auditCandidates().map((candidate) => ({
      ...candidate,
      diff: summarizeMeasureDifferences(baseXml, capability.resolveXml(candidate.id) || baseXml),
    })),
    counters: {
      llmCalls: capability.counters.llmCalls,
      toolCalls: capability.counters.toolCalls,
      renders: capability.counters.renders,
    },
    environment: { ...capability.environment },
    elapsedMs: Math.max(0, Date.now() - startedAt),
  });

  try {
    const driver =
      options?.driveAgent ??
      defaultDriver(provider, apiKey, requestedModel, options?.modelOverride);
    const toolProgress = (name: string): { tool: AiEditProgressTool; label: string } | null => {
      const tools: Record<string, { tool: AiEditProgressTool; label: string }> = {
        sandbox_apply_patch: { tool: 'apply_patch', label: 'Applying a candidate patch' },
        sandbox_scoreops: { tool: 'scoreops', label: 'Running structured score operations' },
        sandbox_engine_check: {
          tool: 'engine_check',
          label: 'Checking a candidate in the notation engine',
        },
        sandbox_render: { tool: 'render', label: 'Rendering a candidate for verification' },
        sandbox_measure_diff: { tool: 'measure_diff', label: 'Comparing candidate measures' },
        sandbox_analyze: { tool: 'analyze', label: 'Analyzing a candidate' },
        sandbox_record_score: { tool: 'record_score', label: 'Recording a candidate assessment' },
        finalize: { tool: 'finalize', label: 'Finalizing the selected candidate' },
      };
      return tools[name] ?? null;
    };
    const executeToolWithProgress = async (name: string, toolArgs: Record<string, unknown>) => {
      const descriptor = toolProgress(name);
      const verificationTool = name === 'sandbox_engine_check' || name === 'sandbox_render';
      if (descriptor) {
        reportAiEditProgress(options?.onProgress, {
          phase: verificationTool ? 'verification.started' : 'tool.started',
          message: descriptor.label,
          tool: descriptor.tool,
          toolCalls: capability.counters.toolCalls,
          candidates: capability.auditCandidates().length,
          renders: capability.counters.renders,
        });
      }
      const result = await executeSandboxTool(capability, name, toolArgs);
      if (descriptor) {
        const verificationLevel =
          result.verification === 'tool_execution' ||
          result.verification === 'patch_apply' ||
          result.verification === 'engine_load' ||
          result.verification === 'render'
            ? result.verification
            : undefined;
        reportAiEditProgress(options?.onProgress, {
          phase:
            name === 'finalize' && result.ok
              ? 'candidate.finalized'
              : verificationTool
                ? 'verification.completed'
                : 'tool.completed',
          message:
            name === 'finalize' && result.ok
              ? 'Candidate selected for the final verification gate'
              : `${descriptor.label} ${result.ok ? 'completed' : 'did not complete'}`,
          tool: descriptor.tool,
          toolCalls: capability.counters.toolCalls,
          candidates: capability.auditCandidates().length,
          renders: capability.counters.renders,
          ...(verificationLevel ? { verificationLevel } : {}),
        });
      }
      return result;
    };
    let finalized: { candidateId: string; rationale: string } | null = null;
    try {
      finalized = await driver({
        capability,
        executeTool: executeToolWithProgress,
        instructions: SANDBOX_INSTRUCTIONS,
        prompt: loopPrompt,
        onProgress: options?.onProgress,
      });
    } catch (error) {
      const timedOut = capability.expired();
      // Bounded diagnostic only: enough to distinguish schema/tool-wiring failures from
      // provider outages, without echoing response bodies wholesale.
      console.error('[deep-edit] Agent loop failed.', {
        provider,
        model: requestedModel,
        effort,
        error: error instanceof Error ? error.name : 'unknown_error',
        detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
      return errorResult(
        timedOut ? 504 : 502,
        timedOut ? 'timeout' : 'provider',
        timedOut ? 'Deep edit exceeded its request budget.' : 'Deep edit provider request failed.',
        auditFor(null, ''),
      );
    }

    if (!finalized) {
      // Every budget class counts: a run stopped by candidate, byte, or render limits is
      // exhaustion, not the model's failure to finalize.
      const exhausted = capability.expired() || capability.hadBudgetDenial();
      return errorResult(
        422,
        exhausted ? 'budget_exhausted' : 'no_finalize',
        exhausted
          ? `Deep edit ran out of budget before finalizing a candidate (${capability.budgetDenialReasons().join(', ') || 'deadline'}).`
          : 'Deep edit ended without finalizing a candidate.',
        auditFor(null, ''),
      );
    }

    const winner = capability.getCandidate(finalized.candidateId);
    if (!winner) {
      return errorResult(
        422,
        'gate_failed',
        `Finalized candidate "${finalized.candidateId.slice(0, 32)}" does not exist.`,
        auditFor(null, finalized.rationale),
      );
    }
    if (!capability.differsFromBase(winner.id)) {
      return errorResult(
        422,
        'gate_failed',
        'Finalized candidate does not materially differ from the base score.',
        auditFor(winner.id, finalized.rationale),
      );
    }
    const structuralIssues = findIntroducedMusicXmlStructuralIssues(baseXml, winner.xml);
    if (structuralIssues.length) {
      return errorResult(
        422,
        'gate_failed',
        `Finalized candidate contains invalid MusicXML: ${structuralIssues[0].message}`,
        auditFor(winner.id, finalized.rationale),
      );
    }

    // Feasibility gate: the winner must hold the strongest level attempted during the
    // run, and ScoreOps-born candidates must pass at least engine_load. The gate runs
    // missing checks itself, charging the same budgets.
    const requiredLevel: DeepEditVerificationLevel = (() => {
      const attempted = capability.strongestAttemptedLevel();
      const floor: DeepEditVerificationLevel =
        winner.createdByTool === 'scoreops' ? 'engine_load' : 'patch_apply';
      return DEEP_EDIT_LEVEL_RANK[attempted] >= DEEP_EDIT_LEVEL_RANK[floor] ? attempted : floor;
    })();
    while (DEEP_EDIT_LEVEL_RANK[winner.verification] < DEEP_EDIT_LEVEL_RANK[requiredLevel]) {
      const nextCheck =
        DEEP_EDIT_LEVEL_RANK[winner.verification] < DEEP_EDIT_LEVEL_RANK.engine_load
          ? 'sandbox_engine_check'
          : 'sandbox_render';
      const checked = await executeToolWithProgress(nextCheck, { candidateId: winner.id });
      if (!checked.ok) {
        const budgetReason = typeof checked.budget === 'string';
        return errorResult(
          422,
          budgetReason ? 'budget_exhausted' : 'gate_failed',
          budgetReason
            ? 'Deep edit ran out of budget while gating the finalized candidate.'
            : `Finalized candidate failed ${nextCheck === 'sandbox_engine_check' ? 'engine' : 'render'} verification: ${String(checked.error ?? 'unknown error').slice(0, 500)}`,
          auditFor(winner.id, finalized.rationale),
        );
      }
    }

    const resolvedBase = resolvedScoreSnapshot(resolution);
    const proposal: AiEditProposal | null = buildAiEditProposal({
      sourceTool: 'music.deep_edit',
      base: resolvedBase,
      proposedXml: winner.xml,
      verification: {
        level: winner.verification,
        llmCalls: capability.counters.llmCalls,
      },
    });
    if (!proposal) {
      return errorResult(
        500,
        'request',
        'Failed to build the deep-edit proposal.',
        auditFor(winner.id, finalized.rationale),
      );
    }
    const proposalSessionId = randomUUID();
    const continuityToken = createProposalContinuityToken({
      proposalSessionId,
      cycle: 1,
      baseContentHash: proposal.baseContentHash,
      proposedContentHash: proposal.proposedContentHash,
    });

    return {
      status: 200,
      body: {
        provider,
        model: requestedModel,
        effort,
        proposal,
        // A candidate chained off another candidate has a patch relative to its parent,
        // not the user's score; publishing it would poison patch display and Phase 2
        // feedback context. Only base-relative patches ship.
        ...(winner.patch && winner.parentId === DEEP_EDIT_BASE_ID ? { patch: winner.patch } : {}),
        annotations: [],
        proposedXml: winner.xml,
        scoreSessionId: resolution.session?.scoreSessionId ?? null,
        revision: resolution.session?.revision ?? null,
        proposalSessionId,
        cycle: 1,
        continuityToken,
        verification: {
          level: winner.verification,
          llmCalls: capability.counters.llmCalls,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          effort,
          budget: { ...budgets },
        },
        deepEdit: auditFor(winner.id, finalized.rationale),
      },
    };
  } finally {
    capability.dispose();
  }
}
