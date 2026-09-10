import { computeMusicXmlIdentityHashServer } from '../musicxml-identity-server';
import { computeScoreHash } from './scoreops-session-store';
import type { ResolvedScoreSnapshot } from './common';

export type AiEditProposal = {
  sourceTool: string;
  baseXml: string;
  proposedXml: string;
  baseScoreSessionId: string | null;
  baseRevision: number | null;
  baseContentHash: string;
  expectedCurrentContentHash: string;
  baseIdentityHash: string;
  expectedCurrentIdentityHash: string;
  proposedContentHash: string;
  proposedIdentityHash: string;
  verification: {
    level: 'patch_apply' | 'tool_execution' | 'engine_load' | 'render';
    attempts?: number;
    llmCalls?: number;
  };
};

type BuildAiEditProposalArgs = {
  sourceTool: string;
  base: ResolvedScoreSnapshot;
  proposedXml: string;
  verification?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export function buildAiEditProposal(args: BuildAiEditProposalArgs): AiEditProposal | null {
  if (!args.proposedXml.trim() || !args.base.xml.trim() || !args.base.contentHash.trim()) {
    return null;
  }

  const verificationInput = asRecord(args.verification);
  const verificationLevel =
    verificationInput?.level === 'patch_apply' ||
    verificationInput?.level === 'engine_load' ||
    verificationInput?.level === 'render'
      ? verificationInput.level
      : 'tool_execution';
  const baseIdentityHash = computeMusicXmlIdentityHashServer(args.base.xml);

  return {
    sourceTool: args.sourceTool,
    baseXml: args.base.xml,
    proposedXml: args.proposedXml,
    baseScoreSessionId: args.base.scoreSessionId,
    baseRevision: args.base.revision,
    baseContentHash: args.base.contentHash,
    expectedCurrentContentHash: args.base.contentHash,
    baseIdentityHash,
    expectedCurrentIdentityHash: baseIdentityHash,
    proposedContentHash: computeScoreHash(args.proposedXml),
    proposedIdentityHash: computeMusicXmlIdentityHashServer(args.proposedXml),
    verification: {
      level: verificationLevel,
      ...(typeof verificationInput?.attempts === 'number'
        ? { attempts: verificationInput.attempts }
        : {}),
      ...(typeof verificationInput?.llmCalls === 'number'
        ? { llmCalls: verificationInput.llmCalls }
        : {}),
    },
  };
}
