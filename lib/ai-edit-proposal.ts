import { asRecord } from './as-record';

export type AiEditProposal = {
  sourceTool: string;
  baseXml: string;
  proposedXml: string;
  baseScoreSessionId: string | null;
  baseRevision: number | null;
  baseContentHash: string;
  expectedCurrentContentHash: string;
  baseIdentityHash?: string;
  expectedCurrentIdentityHash?: string;
  proposedContentHash?: string;
  proposedIdentityHash?: string;
  verification: {
    level: 'patch_apply' | 'tool_execution' | 'engine_load' | 'render';
  };
};

const VERIFICATION_LEVELS = new Set(['patch_apply', 'tool_execution', 'engine_load', 'render']);

export function findAiEditProposal(value: unknown): AiEditProposal | null {
  const visited = new Set<unknown>();
  const visit = (candidate: unknown, depth: number): AiEditProposal | null => {
    if (depth > 5 || visited.has(candidate)) return null;
    visited.add(candidate);
    const record = asRecord(candidate);
    if (!record) return null;
    const proposal = asRecord(record.proposal);
    const verification = asRecord(proposal?.verification);
    if (
      proposal &&
      typeof proposal.sourceTool === 'string' &&
      typeof proposal.baseXml === 'string' &&
      typeof proposal.proposedXml === 'string' &&
      typeof proposal.baseContentHash === 'string' &&
      typeof proposal.expectedCurrentContentHash === 'string' &&
      (proposal.baseIdentityHash == null || typeof proposal.baseIdentityHash === 'string') &&
      (proposal.expectedCurrentIdentityHash == null ||
        typeof proposal.expectedCurrentIdentityHash === 'string') &&
      typeof verification?.level === 'string' &&
      VERIFICATION_LEVELS.has(verification.level)
    ) {
      return proposal as AiEditProposal;
    }
    for (const key of ['body', 'execution', 'result']) {
      const found = visit(record[key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  return visit(value, 0);
}
