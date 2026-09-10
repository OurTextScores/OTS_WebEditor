/**
 * Multitrack MusicVAE engine — calls a self-hosted **FastAPI** service running the
 * reference (Python/TensorFlow) magenta Multitrack MusicVAE, and returns base64 MIDI.
 *
 * History: an in-process `@magenta/music` (TF.js) path was rejected (tfjs-node dtype
 * error; pure-JS too slow / blocks the event loop), then a Hugging Face **Gradio** Space
 * was tried and abandoned — Gradio's queue silently refused to dispatch jobs (no error,
 * no handler invocation) across both `@gradio/client` and the version-matched Python
 * client, on HF and locally. The generation code itself is proven. So the model is now
 * served as a plain FastAPI JSON API in a CPU Docker container (self-hosted in the
 * OurTextScores stack), which OTS calls with a plain `fetch`. See
 * docs/private/music-ai-specialists/multitrack-musicvae-hf-space-runbook.md.
 *
 * Service contract:
 *   POST {SERVICE_URL}/multitrack_vae   body = GenerateRequest (below)
 *     -> 200 { midi_base64: string, metadata: { num_measures, config, warnings, ... } }
 *     -> 400 { detail: string }   (bad input: unsupported chord, missing MIDI, etc.)
 *   GET  {SERVICE_URL}/health -> { ok: true, models_loaded: string[] }
 */

import { type TraceContext, withTraceHeaders } from '../trace-http';

const DEFAULT_SERVICE_URL = (
  process.env.MUSIC_MULTITRACK_VAE_SERVICE_URL || 'http://localhost:7860'
).replace(/\/+$/, '');
const DEFAULT_TIMEOUT_MS = Math.max(
  1,
  Math.floor(Number(process.env.MUSIC_MULTITRACK_VAE_TIMEOUT_MS) || 300_000),
);

export type MultitrackVaeModelKind = 'chords' | 'unconditioned';
export type MultitrackVaeMode =
  'sample' | 'chord_progression' | 'style_interpolation' | 'reconstruct' | 'encode_interpolation';

export class MultitrackVaeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MultitrackVaeInputError';
  }
}

export type MultitrackVaeGenerateRequest = {
  mode: MultitrackVaeMode;
  model: MultitrackVaeModelKind;
  chord?: string;
  chords?: string[];
  temperature?: number;
  numBars?: number;
  numSamples?: number;
  seed?: number;
  inputMidiBase64?: string;
  index?: number;
  index1?: number;
  index2?: number;
  serviceUrl?: string;
  timeoutMs?: number;
  traceContext?: TraceContext;
};

export type MultitrackVaeGenerateResult = {
  midiBase64: string;
  numMeasures: number;
  checkpoint: string;
  warnings: string[];
  metadata: Record<string, unknown> | null;
  endpoint: string;
  durationMs: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const safeMessage = (value: unknown): string => {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
};

/** Run one multitrack MusicVAE operation on the self-hosted service. */
export async function runMultitrackVaeGenerate(
  request: MultitrackVaeGenerateRequest,
): Promise<MultitrackVaeGenerateResult> {
  // Client-side guards that don't need the model.
  if (
    (request.mode === 'reconstruct' || request.mode === 'encode_interpolation') &&
    !request.inputMidiBase64
  ) {
    throw new MultitrackVaeInputError(
      `Mode "${request.mode}" requires inputMidiBase64 (a MIDI upload).`,
    );
  }
  if (request.mode === 'chord_progression' && !(request.chords && request.chords.length > 0)) {
    throw new MultitrackVaeInputError('chord_progression requires a non-empty "chords" list.');
  }

  const serviceUrl = (request.serviceUrl || DEFAULT_SERVICE_URL).replace(/\/+$/, '');
  const timeoutMs = Math.max(1, Math.floor(request.timeoutMs || DEFAULT_TIMEOUT_MS));
  const endpoint = `${serviceUrl}/multitrack_vae`;
  const startedAt = Date.now();

  const body = {
    mode: request.mode,
    model: request.model,
    chord: request.chord || '',
    chords: (request.chords || []).join(', '),
    temperature: typeof request.temperature === 'number' ? request.temperature : 0.2,
    num_bars: typeof request.numBars === 'number' ? request.numBars : 32,
    num_samples: typeof request.numSamples === 'number' ? request.numSamples : 4,
    seed: typeof request.seed === 'number' ? request.seed : -1,
    index: typeof request.index === 'number' ? request.index : 0,
    index_1: typeof request.index1 === 'number' ? request.index1 : 0,
    index_2: typeof request.index2 === 'number' ? request.index2 : 1,
    input_midi_base64: request.inputMidiBase64 || '',
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (request.traceContext) {
    Object.assign(headers, withTraceHeaders(request.traceContext));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as { name?: string })?.name === 'AbortError';
    throw new Error(
      aborted
        ? `Multitrack MusicVAE service timed out after ${timeoutMs}ms (${endpoint}).`
        : `Multitrack MusicVAE service connection failed (${endpoint}): ${safeMessage(err) || 'unknown error'}`,
      { cause: err },
    );
  }
  clearTimeout(timer);

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `HTTP ${res.status}`;
    if (res.status === 400 || res.status === 422) {
      throw new MultitrackVaeInputError(detail);
    }
    throw new Error(`Multitrack MusicVAE service error ${res.status} (${endpoint}): ${detail}`);
  }

  const midiBase64 =
    typeof payload?.midi_base64 === 'string' ? payload.midi_base64.replace(/\s+/g, '') : '';
  if (!midiBase64) {
    throw new Error(`Multitrack MusicVAE service returned no MIDI (${endpoint}).`);
  }
  const metadata = asRecord(payload?.metadata);
  const numMeasures =
    typeof metadata?.num_measures === 'number' ? (metadata.num_measures as number) : 0;
  const checkpoint =
    typeof metadata?.config === 'string'
      ? (metadata.config as string)
      : typeof metadata?.model === 'string'
        ? (metadata.model as string)
        : request.model;
  const warnings = Array.isArray(metadata?.warnings)
    ? (metadata.warnings as unknown[]).filter((w): w is string => typeof w === 'string')
    : [];

  return {
    midiBase64,
    numMeasures,
    checkpoint,
    warnings,
    metadata,
    endpoint,
    durationMs: Date.now() - startedAt,
  };
}
