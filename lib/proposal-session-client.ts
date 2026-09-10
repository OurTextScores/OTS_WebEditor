import type { PatchAnnotation } from './patch-annotations';

// Client-side owner of one proposal session (design §6): the original instruction, the
// previous visible cycle, and cumulative constraints, carried across Send Feedback cycles
// and sent to the server as bounded context. Cleared when the proposal workflow closes or
// a fresh AI request begins.

export type ProposalConstraint = {
  cycle: number;
  kind: 'rejected' | 'note';
  partIndex: number | null;
  measureRange: string | null;
  text: string;
};

export type ClientProposalPreviousCycle = {
  cycle: number;
  baseContentHash: string;
  baseIdentityHash: string | null;
  proposedContentHash: string;
  proposedIdentityHash: string | null;
  continuityToken: string | null;
  patch: unknown | null;
  annotations: PatchAnnotation[];
};

export type ClientProposalSession = {
  id: string;
  originalInstruction: string;
  includeChat: boolean;
  cycle: number;
  previousCycle: ClientProposalPreviousCycle | null;
  constraints: ProposalConstraint[];
};

export type ProposalHashSource =
  | {
      baseContentHash?: unknown;
      baseIdentityHash?: unknown;
      proposedContentHash?: unknown;
      proposedIdentityHash?: unknown;
    }
  | null
  | undefined;

const CONSTRAINTS_MAX = 120;

const readHash = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const fallbackSessionId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildPreviousCycle = (
  cycle: number,
  proposal: ProposalHashSource,
  patch: unknown | null,
  annotations: PatchAnnotation[],
  continuityToken: unknown,
): ClientProposalPreviousCycle | null => {
  const baseContentHash = readHash(proposal?.baseContentHash);
  const proposedContentHash = readHash(proposal?.proposedContentHash);
  if (!baseContentHash || !proposedContentHash) {
    return null;
  }
  return {
    cycle,
    baseContentHash,
    baseIdentityHash: readHash(proposal?.baseIdentityHash),
    proposedContentHash,
    proposedIdentityHash: readHash(proposal?.proposedIdentityHash),
    continuityToken: readHash(continuityToken),
    patch: patch ?? null,
    annotations,
  };
};

export function createClientProposalSession(args: {
  id?: string | null;
  originalInstruction: string;
  includeChat: boolean;
  proposal?: ProposalHashSource;
  patch?: unknown | null;
  annotations?: PatchAnnotation[];
  continuityToken?: unknown;
}): ClientProposalSession {
  return {
    id: typeof args.id === 'string' && args.id.trim() ? args.id.trim() : fallbackSessionId(),
    originalInstruction: args.originalInstruction,
    includeChat: args.includeChat,
    cycle: 1,
    previousCycle: buildPreviousCycle(
      1,
      args.proposal,
      args.patch ?? null,
      args.annotations ?? [],
      args.continuityToken,
    ),
    constraints: [],
  };
}

export type SentFeedbackBlock = {
  partIndex: number;
  measureRange: string;
  status: string;
  comment?: string;
};

/**
 * Fold one cycle of user feedback into the cumulative constraint list.
 * - Rejections and per-block revision comments become standing constraints tied to their
 *   part/measure location; global notes accumulate unlocated.
 * - Only an explicit later decision reverses an earlier constraint: 'accepted' clears the
 *   location, and a new 'comment'/'rejected' on the same location replaces what was there.
 *   'pending' means the user has not decided and never reverses anything.
 */
export function accumulateProposalConstraints(
  existing: ProposalConstraint[],
  revisedCycle: number,
  sentBlocks: SentFeedbackBlock[],
  globalComment: string,
): ProposalConstraint[] {
  const blockKey = (partIndex: number | null, measureRange: string | null) =>
    `${partIndex ?? 'x'}:${measureRange ?? ''}`;
  const decidedKeys = new Set(
    sentBlocks
      .filter(
        (block) =>
          block.status === 'accepted' || block.status === 'rejected' || block.status === 'comment',
      )
      .map((block) => blockKey(block.partIndex, block.measureRange)),
  );
  // Any explicit decision this cycle supersedes older located constraints at the same spot.
  const next = existing.filter(
    (constraint) =>
      constraint.measureRange === null ||
      !decidedKeys.has(blockKey(constraint.partIndex, constraint.measureRange)),
  );
  const seenKeys = new Set<string>();
  for (const block of sentBlocks) {
    const key = blockKey(block.partIndex, block.measureRange);
    if (seenKeys.has(key)) {
      continue;
    }
    if (block.status === 'rejected') {
      seenKeys.add(key);
      next.push({
        cycle: revisedCycle,
        kind: 'rejected',
        partIndex: block.partIndex,
        measureRange: block.measureRange,
        text: '',
      });
    } else if (block.status === 'comment' && (block.comment || '').trim()) {
      seenKeys.add(key);
      next.push({
        cycle: revisedCycle,
        kind: 'note',
        partIndex: block.partIndex,
        measureRange: block.measureRange,
        text: (block.comment || '').trim(),
      });
    }
  }
  const note = globalComment.trim();
  if (
    note &&
    !next.some(
      (constraint) =>
        constraint.kind === 'note' && constraint.measureRange === null && constraint.text === note,
    )
  ) {
    next.push({
      cycle: revisedCycle,
      kind: 'note',
      partIndex: null,
      measureRange: null,
      text: note,
    });
  }
  return next.length > CONSTRAINTS_MAX ? next.slice(next.length - CONSTRAINTS_MAX) : next;
}

export function advanceClientProposalSession(
  session: ClientProposalSession,
  args: {
    responseId?: unknown;
    newCycle?: unknown;
    proposal?: ProposalHashSource;
    patch?: unknown | null;
    annotations?: PatchAnnotation[];
    continuityToken?: unknown;
    sentBlocks: SentFeedbackBlock[];
    sentGlobalComment: string;
  },
): ClientProposalSession {
  const revisedCycle = session.cycle;
  // Only the exact successor cycle is a valid transition; anything else means local state
  // diverged from the server, so keep counting locally rather than adopting the jump.
  const newCycle =
    typeof args.newCycle === 'number' && args.newCycle === session.cycle + 1
      ? args.newCycle
      : session.cycle + 1;
  return {
    ...session,
    id:
      typeof args.responseId === 'string' && args.responseId.trim()
        ? args.responseId.trim()
        : session.id,
    cycle: newCycle,
    previousCycle: buildPreviousCycle(
      newCycle,
      args.proposal,
      args.patch ?? null,
      args.annotations ?? [],
      args.continuityToken,
    ),
    constraints: accumulateProposalConstraints(
      session.constraints,
      revisedCycle,
      args.sentBlocks,
      args.sentGlobalComment,
    ),
  };
}

/**
 * Shape the request field for /api/music/diff/feedback. The expected-current hashes come
 * from the compare Apply gate, which advances them after each user-authorized partial
 * Apply — they describe the legitimate partial-Apply state the server should verify
 * lineage against.
 */
export function buildProposalSessionRequestPayload(
  session: ClientProposalSession,
  expectedCurrent: { contentHash: string | null; identityHash: string | null },
): Record<string, unknown> {
  return {
    id: session.id,
    cycle: session.cycle,
    originalInstruction: session.originalInstruction,
    ...(session.previousCycle
      ? {
          previousCycle: {
            cycle: session.cycle,
            baseContentHash: session.previousCycle.baseContentHash,
            baseIdentityHash: session.previousCycle.baseIdentityHash,
            proposedContentHash: session.previousCycle.proposedContentHash,
            proposedIdentityHash: session.previousCycle.proposedIdentityHash,
            expectedCurrentContentHash: expectedCurrent.contentHash,
            expectedCurrentIdentityHash: expectedCurrent.identityHash,
            continuityToken: session.previousCycle.continuityToken,
            patch: session.previousCycle.patch,
            annotations: session.previousCycle.annotations,
          },
        }
      : {}),
    constraints: session.constraints,
  };
}
