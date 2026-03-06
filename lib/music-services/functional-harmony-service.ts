import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { createScoreArtifact, summarizeScoreArtifact } from '../score-artifacts';
import type { TraceContext } from '../trace-http';
import { asRecord, errorResult, looksLikeMusicXml, readBoolean, resolveScoreContent, type ServiceResult } from './common';

type FunctionalHarmonyServiceOptions = {
  traceContext?: TraceContext;
};

type FunctionalHarmonySegment = {
  movementIndex?: number;
  measureIndex: number;
  measureNumber?: string | number | null;
  startBeat?: number | null;
  endBeat?: number | null;
  romanNumeral?: string | null;
  key?: string | null;
  functionLabel?: string | null;
  cadenceLabel?: string | null;
  confidence?: number | null;
  source?: string | null;
};

type FunctionalHarmonyKeyRegion = {
  startMeasureIndex: number;
  endMeasureIndex: number;
  key: string;
  measureCount: number;
};

type FunctionalHarmonyCadence = {
  measureIndex: number;
  measureNumber?: string | number | null;
  label: string;
  confidence?: number | null;
};

type FunctionalHarmonyHelperSuccess = {
  ok: true;
  engine?: string;
  analysis: Record<string, unknown>;
  warnings?: string[];
  segments?: FunctionalHarmonySegment[];
  keys?: FunctionalHarmonyKeyRegion[];
  cadences?: FunctionalHarmonyCadence[];
  annotatedXml?: string;
  exports?: {
    json?: string;
    rntxt?: string;
  };
};

type FunctionalHarmonyHelperFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  warnings?: string[];
};

type FunctionalHarmonyHelperResponse = FunctionalHarmonyHelperSuccess | FunctionalHarmonyHelperFailure;

type FunctionalHarmonyToolConfig = {
  pythonCommand: string;
  scriptPath: string;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_SCRIPT_PATH = join(process.cwd(), 'tools', 'functional_harmony', 'analyze_functional_harmony.py');

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

const logFunctionalHarmonyEvent = (
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

function getToolConfig(timeoutOverride?: number): FunctionalHarmonyToolConfig {
  const pythonCommand = (process.env.MUSIC_FUNCTIONAL_HARMONY_PYTHON || 'python3').trim() || 'python3';
  const scriptPath = (process.env.MUSIC_FUNCTIONAL_HARMONY_SCRIPT || DEFAULT_SCRIPT_PATH).trim() || DEFAULT_SCRIPT_PATH;
  const timeoutMs = readBoundedInt(
    timeoutOverride ?? process.env.MUSIC_FUNCTIONAL_HARMONY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  return { pythonCommand, scriptPath, timeoutMs };
}

async function ensureHelperScriptExists(scriptPath: string): Promise<void> {
  await access(scriptPath, fsConstants.R_OK);
}

async function runHelper(args: {
  xml: string;
  settings: Record<string, unknown>;
  timeoutMs: number;
}): Promise<FunctionalHarmonyHelperResponse> {
  const config = getToolConfig(args.timeoutMs);
  try {
    await ensureHelperScriptExists(config.scriptPath);
  } catch {
    return {
      ok: false,
      error: {
        code: 'helper_missing',
        message: `Functional harmony helper script was not found at ${config.scriptPath}.`,
      },
    };
  }

  const payload = JSON.stringify({
    xml: args.xml,
    settings: args.settings,
  });

  return await new Promise<FunctionalHarmonyHelperResponse>((resolve) => {
    const child = spawn(config.pythonCommand, [config.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value: FunctionalHarmonyHelperResponse) => {
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
          message: `Functional harmony analysis timed out after ${config.timeoutMs}ms.`,
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
          message: error.message || 'Failed to start functional harmony helper.',
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
            message: stderr.trim() || `Functional harmony helper exited with code ${String(code)} and no output.`,
          },
        });
        return;
      }
      try {
        const parsed = JSON.parse(trimmedStdout) as FunctionalHarmonyHelperResponse;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
          finish({
            ok: false,
            error: {
              code: 'helper_invalid_output',
              message: 'Functional harmony helper returned invalid JSON payload.',
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
            message: error instanceof Error ? error.message : 'Functional harmony helper returned non-JSON output.',
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

export async function runFunctionalHarmonyAnalyzeService(
  body: unknown,
  options?: FunctionalHarmonyServiceOptions,
): Promise<ServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);
  const resolution = await resolveScoreContent(body);
  if (resolution.error) {
    return resolution.error;
  }
  if (!looksLikeMusicXml(resolution.xml)) {
    return errorResult(400, 'invalid_request', 'Functional harmony analysis currently requires MusicXML input.');
  }

  const backend = typeof data?.backend === 'string' && data.backend.trim() ? data.backend.trim() : 'music21-roman';
  if (backend !== 'music21-roman') {
    return errorResult(400, 'invalid_request', `Unsupported functional harmony backend: ${backend}.`);
  }

  const includeSegments = readBoolean(data?.includeSegments, data?.include_segments, true);
  const includeTextExport = readBoolean(data?.includeTextExport, data?.include_text_export, true);
  const includeAnnotatedContent = readBoolean(data?.includeAnnotatedContent, data?.include_annotated_content, true);
  const persistArtifacts = readBoolean(data?.persistArtifacts, data?.persist_artifacts, true);
  const preferLocalKey = readBoolean(data?.preferLocalKey, data?.prefer_local_key, true);
  const detectCadences = readBoolean(data?.detectCadences, data?.detect_cadences, true);
  const detectModulations = readBoolean(data?.detectModulations, data?.detect_modulations, true);
  const timeoutMs = readBoundedInt(data?.timeoutMs ?? data?.timeout_ms, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const granularity = typeof data?.granularity === 'string' && data.granularity.trim().toLowerCase() === 'measure'
    ? 'measure'
    : 'auto';

  logFunctionalHarmonyEvent('info', 'music.functional_harmony.request', traceContext, {
    backend,
    includeSegments,
    includeTextExport,
    includeAnnotatedContent,
    persistArtifacts,
    preferLocalKey,
    detectCadences,
    detectModulations,
    timeoutMs,
  });

  const helper = await runHelper({
    xml: resolution.xml,
    settings: {
      backend,
      includeSegments,
      includeTextExport,
      includeAnnotatedContent,
      preferLocalKey,
      detectCadences,
      detectModulations,
      granularity,
    },
    timeoutMs,
  });

  if (!helper.ok) {
    logFunctionalHarmonyEvent('error', 'music.functional_harmony.failure', traceContext, {
      backend,
      code: helper.error.code,
      message: helper.error.message,
    });
    return {
      status: helper.error.code === 'timeout' ? 408 : 400,
      body: {
        ok: false,
        error: helper.error,
        warnings: helper.warnings || [],
      },
    };
  }

  const annotatedXml = typeof helper.annotatedXml === 'string' ? helper.annotatedXml.trim() : '';
  if (annotatedXml && !looksLikeMusicXml(annotatedXml)) {
    return errorResult(400, 'bad_response', 'Functional harmony helper returned invalid annotated MusicXML.');
  }

  let jsonArtifact = null;
  let rntxtArtifact = null;
  let annotatedArtifact = null;
  if (persistArtifacts) {
    if (typeof helper.exports?.json === 'string' && helper.exports.json.trim()) {
      jsonArtifact = await createScoreArtifact({
        format: 'json',
        content: helper.exports.json,
        encoding: 'utf8',
        mimeType: 'application/json',
        filename: 'functional-harmony.json',
        label: 'functional-harmony-json',
        sourceArtifactId: resolution.artifact?.id,
        metadata: {
          origin: 'api/music/functional-harmony/analyze',
          backend,
        },
      });
    }
    if (typeof helper.exports?.rntxt === 'string' && helper.exports.rntxt.trim()) {
      rntxtArtifact = await createScoreArtifact({
        format: 'rntxt',
        content: helper.exports.rntxt,
        encoding: 'utf8',
        mimeType: 'text/plain',
        filename: 'functional-harmony.rntxt',
        label: 'functional-harmony-rntxt',
        sourceArtifactId: resolution.artifact?.id,
        metadata: {
          origin: 'api/music/functional-harmony/analyze',
          backend,
        },
      });
    }
    if (annotatedXml) {
      annotatedArtifact = await createScoreArtifact({
        format: 'musicxml',
        content: annotatedXml,
        encoding: 'utf8',
        mimeType: 'application/vnd.recordare.musicxml+xml',
        filename: 'functional-harmony-annotated.musicxml',
        label: 'functional-harmony-annotated',
        sourceArtifactId: resolution.artifact?.id,
        metadata: {
          origin: 'api/music/functional-harmony/analyze',
          backend,
        },
      });
    }
  }

  const segments = includeSegments ? (helper.segments || []) : [];
  const warnings = helper.warnings || [];
  logFunctionalHarmonyEvent('info', 'music.functional_harmony.result', traceContext, {
    backend,
    measureCount: Number(helper.analysis.measureCount || 0),
    segmentCount: Number(helper.analysis.segmentCount || 0),
    warningCount: warnings.length,
  });

  return {
    status: 200,
    body: {
      ok: true,
      engine: helper.engine || backend,
      analysis: helper.analysis,
      warnings,
      segments,
      keys: helper.keys || [],
      cadences: helper.cadences || [],
      annotatedXml,
      exports: helper.exports || {},
      artifacts: {
        annotatedXml: annotatedArtifact ? summarizeScoreArtifact(annotatedArtifact) : null,
        json: jsonArtifact ? summarizeScoreArtifact(jsonArtifact) : null,
        rntxt: rntxtArtifact ? summarizeScoreArtifact(rntxtArtifact) : null,
      },
      scoreSessionId: resolution.session?.scoreSessionId ?? null,
      revision: resolution.session?.revision ?? null,
      sourceArtifactId: resolution.artifact?.id ?? null,
    },
  };
}
