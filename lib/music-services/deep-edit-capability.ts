import { randomUUID } from 'node:crypto';
import type { MusicXmlPatch } from './patch-service';
import { canonicalizeMusicXmlIdentity } from '../musicxml-identity';

// Phase 3 containment object (design §7). One instance per deep-edit request owns the
// base snapshot, every candidate, and every budget counter. Candidate ids are minted
// here and validated here; sandbox tools never resolve model-supplied ids against any
// wider namespace (sessions, artifacts, files).

export type DeepEditVerificationLevel = 'patch_apply' | 'tool_execution' | 'engine_load' | 'render';

export const DEEP_EDIT_LEVEL_RANK: Record<DeepEditVerificationLevel, number> = {
  tool_execution: 0,
  patch_apply: 1,
  engine_load: 2,
  render: 3,
};

export type DeepEditScore = {
  kind: string;
  value: number | string;
  detail?: string;
};

export type DeepEditCandidate = {
  id: string;
  parentId: string | null;
  xml: string;
  createdByTool: 'apply_patch' | 'scoreops';
  patch?: MusicXmlPatch;
  verification: DeepEditVerificationLevel;
  engineError?: string;
  scores: DeepEditScore[];
};

export type DeepEditBudgets = {
  maxLlmCalls: number;
  maxToolCalls: number;
  maxCandidates: number;
  maxRenders: number;
  budgetMs: number;
  maxCandidateBytes: number;
  maxTotalBytes: number;
};

export type DeepEditCounters = {
  llmCalls: number;
  toolCalls: number;
  renders: number;
  candidateBytes: number;
};

export type DeepEditChargeResult =
  { ok: true } | { ok: false; reason: 'llm_calls' | 'tool_calls' | 'renders' | 'deadline' };

export type DeepEditMintResult =
  | { ok: true; candidate: DeepEditCandidate }
  | { ok: false; reason: 'candidate_limit' | 'candidate_bytes' | 'total_bytes' };

export const DEEP_EDIT_BASE_ID = 'base';

const CANDIDATE_ID_PATTERN = /^cand-[0-9]+$/;

const byteLength = (value: string) => Buffer.byteLength(value, 'utf8');

export class DeepEditCapability {
  readonly requestId: string;
  readonly baseXml: string;
  readonly budgets: DeepEditBudgets;
  readonly counters: DeepEditCounters;
  readonly deadlineAt: number;

  private readonly candidates = new Map<string, DeepEditCandidate>();
  private readonly controller = new AbortController();
  private readonly deadlineTimer: ReturnType<typeof setTimeout>;
  private readonly parentAbortListener: (() => void) | null = null;
  private readonly parentSignal: AbortSignal | null;
  private nextCandidateNumber = 1;
  private strongestAttempted: DeepEditVerificationLevel = 'tool_execution';
  private budgetDenials = new Set<string>();
  private finalizedState: { candidateId: string; rationale: string } | null = null;
  private readonly baseIdentity: string;

  /**
   * Availability of the environment-dependent verification backends. webmscore and the
   * MuseScore CLI are optional in some deployments (ScoreOps falls back to its XML
   * executor); a check that fails against the base score marks the backend unavailable so
   * candidates are not blamed for a missing runtime and the gate does not demand a level
   * this deployment cannot produce.
   */
  readonly environment: {
    engine: 'unknown' | 'available' | 'unavailable';
    render: 'unknown' | 'available' | 'unavailable';
  } = {
    engine: 'unknown',
    render: 'unknown',
  };

  constructor(args: { baseXml: string; budgets: DeepEditBudgets; parentSignal?: AbortSignal }) {
    this.requestId = randomUUID();
    this.baseXml = args.baseXml;
    this.baseIdentity = canonicalizeMusicXmlIdentity(args.baseXml);
    this.budgets = args.budgets;
    this.counters = { llmCalls: 0, toolCalls: 0, renders: 0, candidateBytes: 0 };
    this.deadlineAt = Date.now() + args.budgets.budgetMs;
    this.deadlineTimer = setTimeout(() => {
      this.controller.abort(new Error('Deep edit exceeded its request budget.'));
    }, args.budgets.budgetMs);
    this.parentSignal = args.parentSignal ?? null;
    if (this.parentSignal) {
      const listener = () => this.controller.abort(this.parentSignal?.reason);
      if (this.parentSignal.aborted) {
        listener();
      } else {
        this.parentSignal.addEventListener('abort', listener, { once: true });
        this.parentAbortListener = listener;
      }
    }
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  remainingMs(): number {
    return Math.max(0, this.deadlineAt - Date.now());
  }

  expired(): boolean {
    return this.signal.aborted || this.remainingMs() <= 0;
  }

  chargeLlmCall(): DeepEditChargeResult {
    if (this.expired()) {
      return this.denied('deadline');
    }
    if (this.counters.llmCalls >= this.budgets.maxLlmCalls) {
      return this.denied('llm_calls');
    }
    this.counters.llmCalls += 1;
    return { ok: true };
  }

  chargeToolCall(): DeepEditChargeResult {
    if (this.expired()) {
      return this.denied('deadline');
    }
    if (this.counters.toolCalls >= this.budgets.maxToolCalls) {
      return this.denied('tool_calls');
    }
    this.counters.toolCalls += 1;
    return { ok: true };
  }

  chargeRender(): DeepEditChargeResult {
    if (this.expired()) {
      return this.denied('deadline');
    }
    if (this.counters.renders >= this.budgets.maxRenders) {
      return this.denied('renders');
    }
    this.counters.renders += 1;
    return { ok: true };
  }

  /** True once any charge or mint was refused for a budget reason. */
  hadBudgetDenial(): boolean {
    return this.budgetDenials.size > 0;
  }

  budgetDenialReasons(): string[] {
    return [...this.budgetDenials].sort();
  }

  /**
   * Record the finalize decision. Only a live, capability-minted candidate is accepted;
   * "base" and unknown ids fail so the agent loop can recover instead of terminating.
   * Finalize deliberately charges no budget — an exhausted run must still be able to end.
   */
  tryFinalize(candidateId: string, rationale: string): { ok: true } | { ok: false; error: string } {
    if (candidateId === DEEP_EDIT_BASE_ID || !this.candidates.has(candidateId)) {
      return {
        ok: false,
        error: `"${candidateId.slice(0, 64)}" is not a live candidate id; finalize requires a candidate you created.`,
      };
    }
    if (!this.differsFromBase(candidateId)) {
      return {
        ok: false,
        error: `"${candidateId.slice(0, 64)}" is identity-equivalent to base; create a material edit before finalizing.`,
      };
    }
    this.finalizedState = { candidateId, rationale };
    return { ok: true };
  }

  finalized(): { candidateId: string; rationale: string } | null {
    return this.finalizedState;
  }

  /** Valid ids for tool arguments: the base snapshot or a capability-minted candidate. */
  isValidSourceId(id: string): boolean {
    return id === DEEP_EDIT_BASE_ID || (CANDIDATE_ID_PATTERN.test(id) && this.candidates.has(id));
  }

  resolveXml(id: string): string | null {
    if (id === DEEP_EDIT_BASE_ID) {
      return this.baseXml;
    }
    return this.candidates.get(id)?.xml ?? null;
  }

  getCandidate(id: string): DeepEditCandidate | null {
    return this.candidates.get(id) ?? null;
  }

  differsFromBase(candidateId: string): boolean {
    const candidate = this.candidates.get(candidateId);
    return Boolean(candidate && canonicalizeMusicXmlIdentity(candidate.xml) !== this.baseIdentity);
  }

  mintCandidate(args: {
    parentId: string;
    xml: string;
    createdByTool: DeepEditCandidate['createdByTool'];
    patch?: MusicXmlPatch;
    verification: Extract<DeepEditVerificationLevel, 'patch_apply' | 'tool_execution'>;
  }): DeepEditMintResult {
    if (this.candidates.size >= this.budgets.maxCandidates) {
      this.budgetDenials.add('candidate_limit');
      return { ok: false, reason: 'candidate_limit' };
    }
    const bytes = byteLength(args.xml);
    if (bytes > this.budgets.maxCandidateBytes) {
      this.budgetDenials.add('candidate_bytes');
      return { ok: false, reason: 'candidate_bytes' };
    }
    if (this.counters.candidateBytes + bytes > this.budgets.maxTotalBytes) {
      this.budgetDenials.add('total_bytes');
      return { ok: false, reason: 'total_bytes' };
    }
    const candidate: DeepEditCandidate = {
      id: `cand-${this.nextCandidateNumber}`,
      parentId: args.parentId,
      xml: args.xml,
      createdByTool: args.createdByTool,
      ...(args.patch ? { patch: args.patch } : {}),
      verification: args.verification,
      scores: [],
    };
    this.nextCandidateNumber += 1;
    this.candidates.set(candidate.id, candidate);
    this.counters.candidateBytes += bytes;
    this.recordAttemptedLevel(args.verification);
    return { ok: true, candidate };
  }

  recordVerification(
    candidateId: string,
    level: DeepEditVerificationLevel,
    engineError?: string,
  ): void {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return;
    }
    if (engineError !== undefined) {
      candidate.engineError = engineError.slice(0, 2_000);
      return;
    }
    if (DEEP_EDIT_LEVEL_RANK[level] > DEEP_EDIT_LEVEL_RANK[candidate.verification]) {
      candidate.verification = level;
    }
    delete candidate.engineError;
    this.recordAttemptedLevel(level);
  }

  recordScore(candidateId: string, score: DeepEditScore): boolean {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return false;
    }
    if (candidate.scores.length >= 20) {
      return false;
    }
    candidate.scores.push({
      kind: score.kind.slice(0, 64),
      value: typeof score.value === 'string' ? score.value.slice(0, 200) : score.value,
      ...(score.detail ? { detail: score.detail.slice(0, 500) } : {}),
    });
    return true;
  }

  /**
   * Record that a verification level was exercised in this run, whether or not it
   * succeeded. The finalize gate holds every winner to the strongest attempted level, so
   * a failed engine check on one candidate still raises the bar for all of them.
   */
  noteAttemptedLevel(level: DeepEditVerificationLevel): void {
    this.recordAttemptedLevel(level);
  }

  /** Strongest verification level attempted on any candidate during this run. */
  strongestAttemptedLevel(): DeepEditVerificationLevel {
    return this.strongestAttempted;
  }

  candidateCount(): number {
    return this.candidates.size;
  }

  auditCandidates(): Array<{
    id: string;
    parentId: string | null;
    createdByTool: string;
    verification: DeepEditVerificationLevel;
    engineError?: string;
    scores: DeepEditScore[];
  }> {
    return [...this.candidates.values()].map((candidate) => ({
      id: candidate.id,
      parentId: candidate.parentId,
      createdByTool: candidate.createdByTool,
      verification: candidate.verification,
      ...(candidate.engineError ? { engineError: candidate.engineError } : {}),
      scores: candidate.scores,
    }));
  }

  dispose(): void {
    clearTimeout(this.deadlineTimer);
    if (this.parentSignal && this.parentAbortListener) {
      this.parentSignal.removeEventListener('abort', this.parentAbortListener);
    }
    if (!this.controller.signal.aborted) {
      this.controller.abort(new Error('Deep edit request completed.'));
    }
  }

  private recordAttemptedLevel(level: DeepEditVerificationLevel): void {
    if (DEEP_EDIT_LEVEL_RANK[level] > DEEP_EDIT_LEVEL_RANK[this.strongestAttempted]) {
      this.strongestAttempted = level;
    }
  }

  private denied(
    reason: 'llm_calls' | 'tool_calls' | 'renders' | 'deadline',
  ): DeepEditChargeResult {
    this.budgetDenials.add(reason);
    return { ok: false, reason };
  }
}
