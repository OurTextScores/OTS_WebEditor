import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { extractPatchAnnotations, type PatchAnnotation } from '../patch-annotations';
import { computeMusicXmlIdentityHashServer } from '../musicxml-identity-server';
import { computeScoreHash } from './scoreops-session-store';
import { asRecord } from './common';

// Client-owned continuity context for one proposal session (design §6). The client is the
// continuity owner; this module only validates shape, applies deterministic bounds, and
// verifies lineage. Context influences prompt quality, never authorization.

export type ProposalSessionConstraint = {
  cycle: number;
  kind: 'rejected' | 'note';
  partIndex: number | null;
  measureRange: string | null;
  text: string;
};

export type ProposalPreviousCycle = {
  cycle: number;
  baseContentHash: string;
  baseIdentityHash: string | null;
  proposedContentHash: string;
  proposedIdentityHash: string | null;
  expectedCurrentContentHash: string | null;
  expectedCurrentIdentityHash: string | null;
  continuityToken: string | null;
  patchJson: string;
  annotations: PatchAnnotation[];
};

export type ProposalSessionContext = {
  id: string;
  originalInstruction: string;
  cycle: number;
  previousCycle: ProposalPreviousCycle | null;
  constraints: ProposalSessionConstraint[];
};

export type ProposalLineage = 'verified' | 'client_attested' | 'mismatch' | 'none';
export type ProposalContinuity = 'server' | 'client' | 'none';

export type ProposalContextFlags = {
  provided: boolean;
  lineage: ProposalLineage;
  continuity: ProposalContinuity;
  previousCycleDropped: boolean;
  truncated: string[];
};

export const PROPOSAL_SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const RAW_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IDENTITY_HASH_PATTERN = /^xmlid-v\d+:[0-9a-f]{64}$/;
const CONSTRAINT_KINDS = new Set(['rejected', 'note']);

const DEFAULT_INSTRUCTION_MAX_CHARS = 4_000;
const DEFAULT_PREVIOUS_PATCH_MAX_CHARS = 60_000;
const DEFAULT_ANNOTATIONS_MAX = 50;
const DEFAULT_ANNOTATION_COMMENT_MAX_CHARS = 500;
const DEFAULT_CONSTRAINTS_MAX = 120;
const DEFAULT_CONSTRAINT_TEXT_MAX_CHARS = 300;
const HARD_CONSTRAINTS_INPUT_MAX = 500;
const DEFAULT_CONTEXT_TOTAL_MAX_CHARS = 120_000;

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

const sanitizeText = (value: string, maxChars: number) =>
  value
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);

const readOptionalHash = (value: unknown, pattern: RegExp): string | null =>
  typeof value === 'string' && pattern.test(value.trim()) ? value.trim() : null;

export type ParseProposalSessionContextResult =
  | { context: null; flags: ProposalContextFlags }
  | { context: ProposalSessionContext; flags: ProposalContextFlags }
  | { error: string };

const emptyFlags = (): ProposalContextFlags => ({
  provided: false,
  lineage: 'none',
  continuity: 'none',
  previousCycleDropped: false,
  truncated: [],
});

// Stateless continuity signing. The token binds a session id, cycle number, and the
// base/proposed hashes the server actually returned, so a later feedback request can prove
// its previous-cycle chain came from this server rather than being client-invented. The
// key is env-provided for multi-instance deployments; the per-process fallback degrades
// gracefully to client-attested continuity after a restart (never a hard failure).
const CONTINUITY_TOKEN_PATTERN = /^pct-v1:[0-9a-f]{64}$/;

const continuityKeyGlobal = globalThis as typeof globalThis & {
  __otsProposalContinuityKey?: Buffer;
};

const continuityKey = (): Buffer => {
  const envSecret = (process.env.MUSIC_PROPOSAL_CONTINUITY_SECRET || '').trim();
  if (envSecret) {
    return Buffer.from(envSecret, 'utf8');
  }
  if (!continuityKeyGlobal.__otsProposalContinuityKey) {
    continuityKeyGlobal.__otsProposalContinuityKey = randomBytes(32);
  }
  return continuityKeyGlobal.__otsProposalContinuityKey;
};

export function createProposalContinuityToken(args: {
  proposalSessionId: string;
  cycle: number;
  baseContentHash: string;
  proposedContentHash: string;
}): string {
  const digest = createHmac('sha256', continuityKey())
    .update(
      `pct-v1|${args.proposalSessionId}|${args.cycle}|${args.baseContentHash}|${args.proposedContentHash}`,
      'utf8',
    )
    .digest('hex');
  return `pct-v1:${digest}`;
}

export function verifyProposalContinuityToken(
  token: string | null,
  args: {
    proposalSessionId: string;
    cycle: number;
    baseContentHash: string;
    proposedContentHash: string;
  },
): boolean {
  if (!token || !CONTINUITY_TOKEN_PATTERN.test(token)) {
    return false;
  }
  const expected = createProposalContinuityToken(args);
  return timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
}

/**
 * Validate and bound the client-supplied `proposalSession` request field.
 * Structural violations return `{ error }` (the route maps them to 400).
 * Oversized text is truncated deterministically and reported in `flags.truncated`.
 */
export function parseProposalSessionContext(
  value: unknown,
  args: { iteration: number },
): ParseProposalSessionContextResult {
  if (value == null) {
    return { context: null, flags: emptyFlags() };
  }
  const record = asRecord(value);
  if (!record) {
    return { error: 'proposalSession must be an object.' };
  }
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!PROPOSAL_SESSION_ID_PATTERN.test(id)) {
    return { error: 'proposalSession.id is invalid.' };
  }
  const cycle = Number(record.cycle);
  if (!Number.isInteger(cycle) || cycle < 1) {
    return { error: 'proposalSession.cycle must be a positive integer.' };
  }
  if (cycle !== args.iteration + 1) {
    return { error: 'proposalSession.cycle does not match the request iteration.' };
  }

  const flags = emptyFlags();
  flags.provided = true;
  const truncated = new Set<string>();

  const instructionMaxChars = readClampedEnvInteger(
    'MUSIC_FEEDBACK_INSTRUCTION_MAX_CHARS',
    DEFAULT_INSTRUCTION_MAX_CHARS,
    100,
    100_000,
  );
  const rawInstruction =
    typeof record.originalInstruction === 'string' ? record.originalInstruction : '';
  const originalInstruction = sanitizeText(rawInstruction, instructionMaxChars);
  if (sanitizeText(rawInstruction, Number.MAX_SAFE_INTEGER).length > originalInstruction.length) {
    truncated.add('originalInstruction');
  }

  let previousCycle: ProposalPreviousCycle | null = null;
  if (record.previousCycle != null) {
    const prev = asRecord(record.previousCycle);
    if (!prev) {
      return { error: 'proposalSession.previousCycle must be an object.' };
    }
    const prevCycle = Number(prev.cycle);
    if (!Number.isInteger(prevCycle) || prevCycle !== cycle) {
      return { error: 'proposalSession.previousCycle.cycle must equal proposalSession.cycle.' };
    }
    const baseContentHash = readOptionalHash(prev.baseContentHash, RAW_HASH_PATTERN);
    const proposedContentHash = readOptionalHash(prev.proposedContentHash, RAW_HASH_PATTERN);
    if (!baseContentHash || !proposedContentHash) {
      return {
        error: 'proposalSession.previousCycle requires valid base and proposed content hashes.',
      };
    }

    const previousPatchMaxChars = readClampedEnvInteger(
      'MUSIC_FEEDBACK_PREVIOUS_PATCH_MAX_CHARS',
      DEFAULT_PREVIOUS_PATCH_MAX_CHARS,
      1_000,
      5_000_000,
    );
    let patchJson = '';
    if (prev.patch != null) {
      const patchRecord = asRecord(prev.patch);
      if (
        !patchRecord ||
        patchRecord.format !== 'musicxml-patch@1' ||
        !Array.isArray(patchRecord.ops)
      ) {
        return { error: 'proposalSession.previousCycle.patch must be a musicxml-patch@1 object.' };
      }
      const serialized = JSON.stringify({ format: patchRecord.format, ops: patchRecord.ops });
      if (serialized.length > previousPatchMaxChars) {
        // A truncated JSON patch would mislead the model; omit it entirely instead.
        truncated.add('previousPatch');
      } else {
        patchJson = serialized;
      }
    }

    const annotationsMax = readClampedEnvInteger(
      'MUSIC_FEEDBACK_PRIOR_ANNOTATIONS_MAX',
      DEFAULT_ANNOTATIONS_MAX,
      1,
      500,
    );
    const allAnnotations = extractPatchAnnotations({ annotations: prev.annotations })
      .map((annotation) => ({
        ...annotation,
        comment: sanitizeText(annotation.comment, DEFAULT_ANNOTATION_COMMENT_MAX_CHARS),
      }))
      .filter((annotation) => annotation.comment);
    if (allAnnotations.length > annotationsMax) {
      truncated.add('previousAnnotations');
    }
    const annotations = allAnnotations.slice(0, annotationsMax);

    previousCycle = {
      cycle: prevCycle,
      baseContentHash,
      baseIdentityHash: readOptionalHash(prev.baseIdentityHash, IDENTITY_HASH_PATTERN),
      proposedContentHash,
      proposedIdentityHash: readOptionalHash(prev.proposedIdentityHash, IDENTITY_HASH_PATTERN),
      expectedCurrentContentHash: readOptionalHash(
        prev.expectedCurrentContentHash,
        RAW_HASH_PATTERN,
      ),
      expectedCurrentIdentityHash: readOptionalHash(
        prev.expectedCurrentIdentityHash,
        IDENTITY_HASH_PATTERN,
      ),
      continuityToken: readOptionalHash(prev.continuityToken, CONTINUITY_TOKEN_PATTERN),
      patchJson,
      annotations,
    };
  }

  let constraints: ProposalSessionConstraint[] = [];
  if (record.constraints != null) {
    if (!Array.isArray(record.constraints)) {
      return { error: 'proposalSession.constraints must be an array.' };
    }
    if (record.constraints.length > HARD_CONSTRAINTS_INPUT_MAX) {
      return {
        error: `proposalSession.constraints exceeds ${HARD_CONSTRAINTS_INPUT_MAX} entries.`,
      };
    }
    const constraintTextMaxChars = readClampedEnvInteger(
      'MUSIC_FEEDBACK_CONSTRAINT_TEXT_MAX_CHARS',
      DEFAULT_CONSTRAINT_TEXT_MAX_CHARS,
      50,
      5_000,
    );
    for (let i = 0; i < record.constraints.length; i += 1) {
      const entry = asRecord(record.constraints[i]);
      if (!entry) {
        return { error: `proposalSession.constraints[${i}] must be an object.` };
      }
      const constraintCycle = Number(entry.cycle);
      const kind = typeof entry.kind === 'string' ? entry.kind : '';
      if (!Number.isInteger(constraintCycle) || constraintCycle < 1 || constraintCycle > cycle) {
        return { error: `proposalSession.constraints[${i}].cycle is out of range.` };
      }
      if (!CONSTRAINT_KINDS.has(kind)) {
        return { error: `proposalSession.constraints[${i}].kind is invalid.` };
      }
      const partIndexValue = Number(entry.partIndex);
      const partIndex =
        Number.isInteger(partIndexValue) && partIndexValue >= 0 ? partIndexValue : null;
      const measureRange =
        typeof entry.measureRange === 'string' ? sanitizeText(entry.measureRange, 128) : '';
      const text =
        typeof entry.text === 'string' ? sanitizeText(entry.text, constraintTextMaxChars) : '';
      if (!text && !measureRange) {
        continue;
      }
      constraints.push({
        cycle: constraintCycle,
        kind: kind as 'rejected' | 'note',
        partIndex,
        measureRange: measureRange || null,
        text,
      });
    }
    const constraintsMax = readClampedEnvInteger(
      'MUSIC_FEEDBACK_CONSTRAINTS_MAX',
      DEFAULT_CONSTRAINTS_MAX,
      10,
      HARD_CONSTRAINTS_INPUT_MAX,
    );
    if (constraints.length > constraintsMax) {
      // Keep the most recent constraints: later cycles carry the freshest user intent.
      constraints = constraints.slice(constraints.length - constraintsMax);
      truncated.add('constraints');
    }
  }

  // Aggregate budget across every context section, independent of the per-field caps, so
  // the rendered proposal context has a hard ceiling before prompt construction. Drop
  // order is deterministic: oldest constraints first, then trailing annotations, then the
  // previous patch.
  const totalBudgetChars = readClampedEnvInteger(
    'MUSIC_FEEDBACK_CONTEXT_MAX_CHARS',
    DEFAULT_CONTEXT_TOTAL_MAX_CHARS,
    10_000,
    5_000_000,
  );
  const contextSize = () =>
    originalInstruction.length +
    (previousCycle ? previousCycle.patchJson.length : 0) +
    (previousCycle
      ? previousCycle.annotations.reduce(
          (sum, annotation) => sum + annotation.comment.length + 24,
          0,
        )
      : 0) +
    constraints.reduce(
      (sum, constraint) =>
        sum + constraint.text.length + (constraint.measureRange?.length ?? 0) + 24,
      0,
    );
  while (contextSize() > totalBudgetChars && constraints.length) {
    constraints.shift();
    truncated.add('constraints');
  }
  while (contextSize() > totalBudgetChars && previousCycle && previousCycle.annotations.length) {
    previousCycle.annotations.pop();
    truncated.add('previousAnnotations');
  }
  if (contextSize() > totalBudgetChars && previousCycle && previousCycle.patchJson) {
    previousCycle.patchJson = '';
    truncated.add('previousPatch');
  }

  flags.truncated = [...truncated].sort();
  return {
    context: {
      id,
      originalInstruction,
      cycle,
      previousCycle,
      constraints,
    },
    flags,
  };
}

const matchesAny = (value: string, candidates: Array<string | null>) =>
  candidates.some((candidate) => candidate !== null && candidate === value);

/**
 * Lineage check for the previous cycle against the authoritative current XML.
 * Legitimate states: current equals the previous base (nothing applied), the previous
 * proposal (all applied), or the client's tracked partial-Apply expectation. A mismatch of
 * every raw and identity hash means an unrelated edit occurred; the caller drops the
 * previous-cycle context (design decision: degrade, flag, never block).
 *
 * Honesty of the result depends on who attested the hashes:
 * - `continuity: 'server'` — the request's continuity token proves the base/proposed
 *   hashes were issued by this server for this session and cycle. A current match against
 *   those hashes is `verified`.
 * - `continuity: 'client'` — no valid token; every hash is a client claim. A match is
 *   reported as `client_attested`, never `verified`.
 * - The partial-Apply expectation is tracked by the client's Apply gate, so a match
 *   against only the expected-current hash is `client_attested` even with a valid token.
 */
export function evaluateProposalLineage(
  currentXml: string,
  previousCycle: ProposalPreviousCycle | null,
  session?: { proposalSessionId: string; cycle: number },
): { lineage: ProposalLineage; continuity: ProposalContinuity } {
  if (!previousCycle) {
    return { lineage: 'none', continuity: 'none' };
  }
  const continuity: ProposalContinuity =
    session &&
    verifyProposalContinuityToken(previousCycle.continuityToken, {
      proposalSessionId: session.proposalSessionId,
      cycle: session.cycle,
      baseContentHash: previousCycle.baseContentHash,
      proposedContentHash: previousCycle.proposedContentHash,
    })
      ? 'server'
      : 'client';

  const currentRawHash = computeScoreHash(currentXml);
  let currentIdentityHash: string | null = null;
  const identityCandidatesPresent = Boolean(
    previousCycle.baseIdentityHash ||
    previousCycle.proposedIdentityHash ||
    previousCycle.expectedCurrentIdentityHash,
  );
  if (identityCandidatesPresent) {
    try {
      currentIdentityHash = computeMusicXmlIdentityHashServer(currentXml);
    } catch {
      // Unparseable current XML cannot confirm identity-level lineage.
    }
  }

  const matchesAttested =
    matchesAny(currentRawHash, [
      previousCycle.baseContentHash,
      previousCycle.proposedContentHash,
    ]) ||
    (currentIdentityHash !== null &&
      matchesAny(currentIdentityHash, [
        previousCycle.baseIdentityHash,
        previousCycle.proposedIdentityHash,
      ]));
  if (matchesAttested) {
    return { lineage: continuity === 'server' ? 'verified' : 'client_attested', continuity };
  }
  const matchesExpectation =
    matchesAny(currentRawHash, [previousCycle.expectedCurrentContentHash]) ||
    (currentIdentityHash !== null &&
      matchesAny(currentIdentityHash, [previousCycle.expectedCurrentIdentityHash]));
  if (matchesExpectation) {
    return { lineage: 'client_attested', continuity };
  }
  return { lineage: 'mismatch', continuity };
}
