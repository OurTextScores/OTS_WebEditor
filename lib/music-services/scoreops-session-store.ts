import { createHash, randomUUID } from 'node:crypto';

import type { EditorLaunchContext } from '../editor-launch-context';

export type ScoreOpsSessionMetadata = {
  launchContext?: EditorLaunchContext | null;
  [key: string]: unknown;
};

export type ScoreOpsSessionState = {
  scoreSessionId: string;
  revision: number;
  artifactId: string | null;
  contentHash: string;
  content: string;
  metadata: ScoreOpsSessionMetadata | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Thrown when a session mutation is rejected by the store (e.g. content exceeds the
 * configured size cap). Carries an HTTP-ish `status` and a machine `code` so callers can
 * translate it into a structured error response instead of a 500.
 */
export class ScoreOpsSessionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ScoreOpsSessionError';
    this.code = code;
    this.status = status;
  }
}

type SessionEntry = {
  state: ScoreOpsSessionState;
  /** Last create/read/update time; drives idle-TTL eviction and LRU ordering. */
  lastAccessMs: number;
};

// Defaults bound memory for the in-process session store so unauthenticated
// `/api/music/scoreops/session/open` calls cannot grow it without limit (finding M2).
// All are overridable via env; set any to 0 to disable that particular guard.
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // evict sessions idle > 24h
const DEFAULT_SESSION_MAX = 500; // hard cap on concurrent live sessions (LRU-evicted)
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // sweep at most once per 5 min
const DEFAULT_MAX_CONTENT_BYTES = 25 * 1024 * 1024; // reject a single session > 25 MB

// Versioned global key so a hot-reload doesn't inherit a Map of the old (unwrapped) shape.
type ScoreOpsSessionGlobal = typeof globalThis & {
  scoreOpsSessionsV2?: Map<string, SessionEntry>;
};

const scoreOpsSessionGlobal = globalThis as ScoreOpsSessionGlobal;
const sessions = scoreOpsSessionGlobal.scoreOpsSessionsV2 || new Map<string, SessionEntry>();
scoreOpsSessionGlobal.scoreOpsSessionsV2 = sessions;

let lastCleanupAt = 0;

function readNonNegativeEnvInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const getTtlMs = () =>
  readNonNegativeEnvInt('MUSIC_SCOREOPS_SESSION_TTL_MS', DEFAULT_SESSION_TTL_MS);
const getMaxSessions = () =>
  readNonNegativeEnvInt('MUSIC_SCOREOPS_SESSION_MAX', DEFAULT_SESSION_MAX);
const getCleanupIntervalMs = () =>
  readNonNegativeEnvInt('MUSIC_SCOREOPS_SESSION_CLEANUP_INTERVAL_MS', DEFAULT_CLEANUP_INTERVAL_MS);
const getMaxContentBytes = () =>
  readNonNegativeEnvInt('MUSIC_SCOREOPS_MAX_CONTENT_BYTES', DEFAULT_MAX_CONTENT_BYTES);

export function computeScoreHash(content: string) {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function assertContentWithinLimit(content: string) {
  const maxBytes = getMaxContentBytes();
  if (maxBytes <= 0) {
    return;
  }
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > maxBytes) {
    throw new ScoreOpsSessionError(
      'content_too_large',
      `Score content is ${bytes} bytes, exceeding the ${maxBytes}-byte session limit.`,
      413,
    );
  }
}

function isExpired(entry: SessionEntry, nowMs: number, ttlMs: number) {
  return ttlMs > 0 && nowMs - entry.lastAccessMs > ttlMs;
}

/** Refresh access time and move the entry to the MRU end of the insertion order. */
function touch(scoreSessionId: string, entry: SessionEntry, nowMs: number) {
  entry.lastAccessMs = nowMs;
  sessions.delete(scoreSessionId);
  sessions.set(scoreSessionId, entry);
}

/** Throttled sweep of idle-expired sessions; runs on writes, at most once per interval. */
function maybeSweepExpired(nowMs: number) {
  const intervalMs = getCleanupIntervalMs();
  if (intervalMs > 0 && nowMs - lastCleanupAt < intervalMs) {
    return;
  }
  lastCleanupAt = nowMs;
  const ttlMs = getTtlMs();
  if (ttlMs <= 0) {
    return;
  }
  for (const [id, entry] of sessions) {
    if (isExpired(entry, nowMs, ttlMs)) {
      sessions.delete(id);
    }
  }
}

/** Evict least-recently-used sessions until the store is within the max-entry cap. */
function enforceMaxSessions() {
  const max = getMaxSessions();
  if (max <= 0) {
    return;
  }
  while (sessions.size > max) {
    const oldestKey = sessions.keys().next().value as string | undefined;
    if (oldestKey === undefined) {
      break;
    }
    sessions.delete(oldestKey);
  }
}

export function getScoreOpsSession(scoreSessionId: string) {
  const entry = sessions.get(scoreSessionId);
  if (!entry) {
    return null;
  }
  const nowMs = Date.now();
  if (isExpired(entry, nowMs, getTtlMs())) {
    sessions.delete(scoreSessionId);
    return null;
  }
  touch(scoreSessionId, entry, nowMs);
  return entry.state;
}

export function createScoreOpsSession(input: {
  content: string;
  artifactId: string | null;
  revision?: number;
  metadata?: ScoreOpsSessionMetadata | null;
}) {
  assertContentWithinLimit(input.content);
  const nowMs = Date.now();
  maybeSweepExpired(nowMs);
  const now = new Date(nowMs).toISOString();
  const session: ScoreOpsSessionState = {
    scoreSessionId: `sess_${randomUUID()}`,
    revision: Math.max(0, Math.trunc(input.revision ?? 0)),
    artifactId: input.artifactId,
    contentHash: computeScoreHash(input.content),
    content: input.content,
    metadata: input.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.scoreSessionId, { state: session, lastAccessMs: nowMs });
  enforceMaxSessions();
  return session;
}

export function updateScoreOpsSession(
  scoreSessionId: string,
  input: {
    content: string;
    artifactId: string | null;
    nextRevision?: number;
    metadata?: ScoreOpsSessionMetadata | null;
  },
) {
  assertContentWithinLimit(input.content);
  const entry = sessions.get(scoreSessionId);
  if (!entry) {
    return null;
  }
  const nowMs = Date.now();
  if (isExpired(entry, nowMs, getTtlMs())) {
    sessions.delete(scoreSessionId);
    return null;
  }
  const existing = entry.state;
  const nextRevision = Number.isFinite(input.nextRevision)
    ? Math.max(existing.revision, Math.trunc(input.nextRevision as number))
    : existing.revision + 1;
  const next: ScoreOpsSessionState = {
    ...existing,
    revision: nextRevision,
    artifactId: input.artifactId,
    content: input.content,
    contentHash: computeScoreHash(input.content),
    metadata: input.metadata === undefined ? existing.metadata : input.metadata,
    updatedAt: new Date(nowMs).toISOString(),
  };
  entry.state = next;
  touch(scoreSessionId, entry, nowMs);
  return next;
}

export function clearScoreOpsSessions() {
  sessions.clear();
}
