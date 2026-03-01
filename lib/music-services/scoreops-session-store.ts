import { createHash, randomUUID } from 'node:crypto';

export type ScoreOpsSessionState = {
  scoreSessionId: string;
  revision: number;
  artifactId: string | null;
  contentHash: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const sessions = (globalThis as any).scoreOpsSessions || new Map<string, ScoreOpsSessionState>();
(globalThis as any).scoreOpsSessions = sessions;

export function computeScoreHash(content: string) {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

export function getScoreOpsSession(scoreSessionId: string) {
  return sessions.get(scoreSessionId) || null;
}

export function createScoreOpsSession(input: {
  content: string;
  artifactId: string | null;
  revision?: number;
}) {
  const now = new Date().toISOString();
  const session: ScoreOpsSessionState = {
    scoreSessionId: `sess_${randomUUID()}`,
    revision: Math.max(0, Math.trunc(input.revision ?? 0)),
    artifactId: input.artifactId,
    contentHash: computeScoreHash(input.content),
    content: input.content,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.scoreSessionId, session);
  return session;
}

export function updateScoreOpsSession(
  scoreSessionId: string,
  input: {
    content: string;
    artifactId: string | null;
    nextRevision?: number;
  },
) {
  const existing = sessions.get(scoreSessionId);
  if (!existing) {
    return null;
  }
  const nextRevision = Number.isFinite(input.nextRevision)
    ? Math.max(existing.revision, Math.trunc(input.nextRevision as number))
    : existing.revision + 1;
  const next: ScoreOpsSessionState = {
    ...existing,
    revision: nextRevision,
    artifactId: input.artifactId,
    content: input.content,
    contentHash: computeScoreHash(input.content),
    updatedAt: new Date().toISOString(),
  };
  sessions.set(scoreSessionId, next);
  return next;
}

export function clearScoreOpsSessions() {
  sessions.clear();
}
