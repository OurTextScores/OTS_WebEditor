import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { createScoreArtifact, summarizeScoreArtifact } from '../score-artifacts';
import type { TraceContext } from '../trace-http';
import { asRecord, errorResult, looksLikeMusicXml, readBoolean, resolveScoreContent, type ServiceResult } from './common';

type HarmonyServiceOptions = {
  traceContext?: TraceContext;
};

type HarmonySegment = {
  measure: number;
  offsetBeats?: number;
  symbol: string;
  roman?: string | null;
  key?: string | null;
  confidence?: number | null;
  source?: string | null;
};

type HarmonyHelperSuccess = {
  ok: true;
  engine?: string;
  analysis: Record<string, unknown>;
  warnings?: string[];
  content?: {
    musicxml?: string;
  };
  segments?: HarmonySegment[];
};

type HarmonyHelperFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  warnings?: string[];
};

type HarmonyHelperResponse = HarmonyHelperSuccess | HarmonyHelperFailure;

type HarmonyToolConfig = {
  pythonCommand: string;
  scriptPath: string;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_SCRIPT_PATH = join(process.cwd(), 'tools', 'music21_harmony', 'analyze_harmony.py');

const readBoundedInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const intValue = Math.trunc(parsed);
  if (intValue < min) {
    return min;
  }
  if (intValue > max) {
    return max;
  }
  return intValue;
};

const normalizeExistingHarmonyMode = (value: unknown): 'preserve' | 'replace' | 'fill-missing' => {
  if (typeof value !== 'string') {
    return 'fill-missing';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'preserve' || normalized === 'replace' || normalized === 'fill-missing') {
    return normalized;
  }
  return 'fill-missing';
};

const normalizeHarmonicRhythm = (value: unknown): 'auto' | 'measure' | 'beat' => {
  if (typeof value !== 'string') {
    return 'auto';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'measure' || normalized === 'beat') {
    return normalized;
  }
  return 'auto';
};

const logHarmonyServiceEvent = (
  level: 'info' | 'warn' | 'error',
  event: string,
  traceContext: TraceContext | undefined,
  extra?: Record<string, unknown>,
) => {
  const line = JSON.stringify({
    event,
    requestId: traceContext?.requestId || null,
    traceId: traceContext?.traceId || null,
    sessionId: traceContext?.sessionId || null,
    clientSessionId: traceContext?.clientSessionId || null,
    ...(extra || {}),
  });
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
};

function getHarmonyToolConfig(timeoutOverride?: number): HarmonyToolConfig {
  const pythonCommand = (process.env.MUSIC_HARMONY_PYTHON || 'python3').trim() || 'python3';
  const scriptPath = (process.env.MUSIC_HARMONY_SCRIPT || DEFAULT_SCRIPT_PATH).trim() || DEFAULT_SCRIPT_PATH;
  const timeoutMs = readBoundedInt(
    timeoutOverride ?? process.env.MUSIC_HARMONY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  return {
    pythonCommand,
    scriptPath,
    timeoutMs,
  };
}

async function ensureHelperScriptExists(scriptPath: string): Promise<void> {
  await access(scriptPath, fsConstants.R_OK);
}

async function runHarmonyHelper(args: {
  xml: string;
  settings: Record<string, unknown>;
  timeoutMs: number;
  traceContext?: TraceContext;
}): Promise<HarmonyHelperResponse> {
  const config = getHarmonyToolConfig(args.timeoutMs);
  try {
    await ensureHelperScriptExists(config.scriptPath);
  } catch {
    return {
      ok: false,
      error: {
        code: 'helper_missing',
        message: `Harmony helper script was not found at ${config.scriptPath}.`,
      },
    };
  }

  const payload = JSON.stringify({
    xml: args.xml,
    settings: args.settings,
  });

  return await new Promise<HarmonyHelperResponse>((resolve) => {
    const child = spawn(config.pythonCommand, [config.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value: HarmonyHelperResponse) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        ok: false,
        error: {
          code: 'timeout',
          message: `Harmony analysis timed out after ${config.timeoutMs}ms.`,
        },
      });
    }, config.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        error: {
          code: 'spawn_failed',
          message: error.message || 'Failed to start harmony analysis helper.',
        },
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) {
        return;
      }
      const trimmedStdout = stdout.trim();
      if (!trimmedStdout) {
        finish({
          ok: false,
          error: {
            code: 'helper_empty_output',
            message: stderr.trim() || `Harmony helper exited with code ${String(code)} and no output.`,
          },
        });
        return;
      }
      try {
        const parsed = JSON.parse(trimmedStdout) as HarmonyHelperResponse;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
          finish({
            ok: false,
            error: {
              code: 'helper_invalid_output',
              message: 'Harmony helper returned invalid JSON payload.',
            },
          });
          return;
        }
        finish(parsed);
      } catch (error) {
        finish({
          ok: false,
          error: {
            code: 'helper_invalid_output',
            message: error instanceof Error ? error.message : 'Harmony helper returned non-JSON output.',
            details: {
              stderr: stderr.trim() || undefined,
            },
          },
        });
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

function validateHarmonyOutputXml(xml: string): string | null {
  const trimmed = xml.trim();
  if (!trimmed) {
    return 'Harmony analysis output MusicXML was empty.';
  }
  if (!looksLikeMusicXml(trimmed)) {
    return 'Harmony analysis output is not recognizable MusicXML.';
  }
  if (!/<part\b/i.test(trimmed)) {
    return 'Harmony analysis output MusicXML does not contain any <part> elements.';
  }
  if (!/<measure\b/i.test(trimmed)) {
    return 'Harmony analysis output MusicXML does not contain any <measure> elements.';
  }
  return null;
}

function helperErrorStatus(code: string): number {
  switch (code) {
    case 'invalid_request':
    case 'invalid_musicxml':
      return 400;
    case 'dependency_missing':
    case 'helper_missing':
    case 'spawn_failed':
    case 'timeout':
      return 503;
    default:
      return 500;
  }
}

export async function runHarmonyAnalyzeService(body: unknown, options?: HarmonyServiceOptions): Promise<ServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);
  const resolution = await resolveScoreContent(body);
  if (resolution.error) {
    return resolution.error;
  }
  if (!looksLikeMusicXml(resolution.xml)) {
    return errorResult(400, 'invalid_request', 'Harmony analysis currently supports MusicXML input only.');
  }

  const insertHarmony = readBoolean(data?.insertHarmony, data?.insert_harmony, true);
  const includeContent = readBoolean(data?.includeContent, data?.include_content, true);
  const persistArtifacts = readBoolean(data?.persistArtifacts, data?.persist_artifacts, false);
  const preferLocalKey = readBoolean(data?.preferLocalKey, data?.prefer_local_key, true);
  const includeRomanNumerals = readBoolean(data?.includeRomanNumerals, data?.include_roman_numerals, false);
  const simplifyForMma = readBoolean(data?.simplifyForMma, data?.simplify_for_mma, true);
  const existingHarmonyMode = normalizeExistingHarmonyMode(data?.existingHarmonyMode ?? data?.existing_harmony_mode);
  const harmonicRhythm = normalizeHarmonicRhythm(data?.harmonicRhythm ?? data?.harmonic_rhythm);
  const maxChangesPerMeasure = readBoundedInt(
    data?.maxChangesPerMeasure ?? data?.max_changes_per_measure,
    2,
    1,
    8,
  );
  const timeoutMs = readBoundedInt(data?.timeoutMs ?? data?.timeout_ms, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);

  logHarmonyServiceEvent('info', 'music.harmony.analyze.request', traceContext, {
    insertHarmony,
    includeContent,
    persistArtifacts,
    preferLocalKey,
    includeRomanNumerals,
    simplifyForMma,
    existingHarmonyMode,
    harmonicRhythm,
    maxChangesPerMeasure,
    timeoutMs,
    sourceArtifactId: resolution.artifact?.id || null,
    sessionId: resolution.session?.scoreSessionId || null,
  });

  const startedAt = Date.now();
  const helper = await runHarmonyHelper({
    xml: resolution.xml,
    settings: {
      insertHarmony,
      includeContent,
      preferLocalKey,
      includeRomanNumerals,
      simplifyForMma,
      existingHarmonyMode,
      harmonicRhythm,
      maxChangesPerMeasure,
    },
    timeoutMs,
    traceContext,
  });

  if (!helper.ok) {
    const status = helperErrorStatus(helper.error.code);
    logHarmonyServiceEvent(status >= 500 ? 'error' : 'warn', 'music.harmony.analyze.python_result', traceContext, {
      ok: false,
      durationMs: Date.now() - startedAt,
      code: helper.error.code,
      message: helper.error.message,
    });
    return errorResult(status, helper.error.code, helper.error.message, helper.error.details);
  }

  const taggedXml = typeof helper.content?.musicxml === 'string' ? helper.content.musicxml : '';
  if (insertHarmony || includeContent || persistArtifacts) {
    const validationError = validateHarmonyOutputXml(taggedXml);
    if (validationError) {
      return errorResult(500, 'invalid_output', validationError);
    }
  }

  let outputArtifact = null;
  if (persistArtifacts) {
    outputArtifact = await createScoreArtifact({
      format: 'musicxml',
      content: taggedXml,
      encoding: 'utf8',
      mimeType: 'application/vnd.recordare.musicxml+xml',
      filename: 'harmony-tagged.musicxml',
      label: 'music21-harmony-output',
      sourceArtifactId: resolution.artifact?.id || undefined,
      metadata: {
        origin: 'api/music/harmony/analyze',
        engine: 'music21',
      },
    });
  }

  const warnings = Array.isArray(helper.warnings)
    ? helper.warnings.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  logHarmonyServiceEvent('info', 'music.harmony.analyze.summary', traceContext, {
    ok: true,
    durationMs: Date.now() - startedAt,
    warningCount: warnings.length,
    segmentCount: Array.isArray(helper.segments) ? helper.segments.length : 0,
    outputArtifactId: outputArtifact?.id || null,
  });

  const responseBody: Record<string, unknown> = {
    ok: true,
    engine: helper.engine || 'music21',
    analysis: helper.analysis,
    warnings,
    segments: Array.isArray(helper.segments) ? helper.segments : [],
    scoreSessionId: resolution.session?.scoreSessionId ?? null,
    revision: resolution.session?.revision ?? null,
    sourceArtifactId: resolution.artifact?.id ?? null,
  };
  if (includeContent) {
    responseBody.content = { musicxml: taggedXml };
  }
  if (outputArtifact) {
    responseBody.artifacts = { outputArtifact: summarizeScoreArtifact(outputArtifact) };
  }

  return {
    status: 200,
    body: responseBody,
  };
}
