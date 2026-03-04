import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MusicConversionResult, MusicFormat } from './music-conversion';

export type ScoreArtifactFormat = MusicFormat | 'mma';

export type ScoreArtifact = {
    id: string;
    kind: 'score-artifact@1';
    createdAt: string;
    format: ScoreArtifactFormat;
    content: string;
    encoding?: 'utf8' | 'base64';
    mimeType?: string;
    filename?: string;
    label?: string;
    parentArtifactId?: string;
    sourceArtifactId?: string;
    metadata?: Record<string, unknown>;
    validation?: MusicConversionResult['validation'];
    provenance?: MusicConversionResult['provenance'];
};

export type ScoreArtifactSummary = Omit<ScoreArtifact, 'content'> & {
    contentBytes: number;
    contentPreview: string;
};

const DEFAULT_ARTIFACT_DIR = join(tmpdir(), 'ots-score-artifacts');
const DEFAULT_ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastArtifactCleanupAt = 0;

const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '');

export function getScoreArtifactDir() {
    const fromEnv = (process.env.MUSIC_ARTIFACT_DIR || '').trim();
    return fromEnv || DEFAULT_ARTIFACT_DIR;
}

function getArtifactTtlMs() {
    const value = Number(process.env.MUSIC_ARTIFACT_TTL_MS);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_ARTIFACT_TTL_MS;
}

function getArtifactCleanupIntervalMs() {
    const value = Number(process.env.MUSIC_ARTIFACT_CLEANUP_INTERVAL_MS);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CLEANUP_INTERVAL_MS;
}

async function ensureArtifactDir() {
    const dir = getScoreArtifactDir();
    await mkdir(dir, { recursive: true });
    return dir;
}

function artifactPathForId(id: string) {
    return join(getScoreArtifactDir(), `${sanitizeId(id)}.json`);
}

export function summarizeScoreArtifact(artifact: ScoreArtifact): ScoreArtifactSummary {
    const { content, ...rest } = artifact;
    return {
        ...rest,
        contentBytes: Buffer.byteLength(content, 'utf8'),
        contentPreview: content.slice(0, 240),
    };
}

export async function createScoreArtifact(input: Omit<ScoreArtifact, 'id' | 'kind' | 'createdAt'>): Promise<ScoreArtifact> {
    await ensureArtifactDir();
    await maybeCleanupExpiredScoreArtifacts();
    const artifact: ScoreArtifact = {
        id: randomUUID(),
        kind: 'score-artifact@1',
        createdAt: new Date().toISOString(),
        ...input,
    };
    await writeFile(artifactPathForId(artifact.id), JSON.stringify(artifact, null, 2), 'utf8');
    return artifact;
}

export async function getScoreArtifact(id: string): Promise<ScoreArtifact | null> {
    try {
        const raw = await readFile(artifactPathForId(id), 'utf8');
        const parsed = JSON.parse(raw) as ScoreArtifact;
        if (!parsed || parsed.kind !== 'score-artifact@1' || typeof parsed.content !== 'string') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export async function cleanupExpiredScoreArtifacts(options?: {
    nowMs?: number;
    ttlMs?: number;
}): Promise<{ deleted: number; kept: number; skipped: number }> {
    const dir = await ensureArtifactDir();
    const ttlMs = options?.ttlMs ?? getArtifactTtlMs();
    if (ttlMs < 0) {
        return { deleted: 0, kept: 0, skipped: 0 };
    }
    const nowMs = options?.nowMs ?? Date.now();
    const files = await readdir(dir).catch(() => []);
    let deleted = 0;
    let kept = 0;
    let skipped = 0;

    for (const file of files) {
        if (!file.endsWith('.json')) {
            skipped += 1;
            continue;
        }
        const fullPath = join(dir, file);
        try {
            const fileStat = await stat(fullPath);
            const ageMs = Math.max(0, nowMs - fileStat.mtimeMs);
            if (ageMs > ttlMs) {
                await unlink(fullPath).catch(() => undefined);
                deleted += 1;
            } else {
                kept += 1;
            }
        } catch {
            skipped += 1;
        }
    }
    return { deleted, kept, skipped };
}

export async function maybeCleanupExpiredScoreArtifacts(): Promise<void> {
    const intervalMs = getArtifactCleanupIntervalMs();
    if (intervalMs <= 0) {
        return;
    }
    const nowMs = Date.now();
    if ((nowMs - lastArtifactCleanupAt) < intervalMs) {
        return;
    }
    lastArtifactCleanupAt = nowMs;
    try {
        await cleanupExpiredScoreArtifacts({ nowMs });
    } catch {
        // Best-effort cleanup only.
    }
}
