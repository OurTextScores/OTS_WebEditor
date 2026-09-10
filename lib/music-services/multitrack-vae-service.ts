import { createHash } from 'node:crypto';
import { convertMusicNotation } from '../music-conversion';
import { createScoreArtifact, summarizeScoreArtifact } from '../score-artifacts';
import type { TraceContext } from '../trace-http';
import {
  MultitrackVaeInputError,
  runMultitrackVaeGenerate,
  type MultitrackVaeMode,
  type MultitrackVaeModelKind,
} from './multitrack-vae-engine';

const CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.MUSIC_MULTITRACK_VAE_CACHE_TTL_MS || 10 * 60 * 1000),
);
const CACHE_MAX_ENTRIES = Math.max(
  1,
  Math.floor(Number(process.env.MUSIC_MULTITRACK_VAE_CACHE_MAX_ENTRIES || 64)),
);
const DEFAULT_MODEL: MultitrackVaeModelKind =
  (process.env.MUSIC_MULTITRACK_VAE_DEFAULT_MODEL || '').trim() === 'unconditioned'
    ? 'unconditioned'
    : 'chords';

const VALID_MODES: MultitrackVaeMode[] = [
  'sample',
  'chord_progression',
  'style_interpolation',
  'reconstruct',
  'encode_interpolation',
];

export type MultitrackVaeServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

export type MultitrackVaeServiceOptions = {
  traceContext?: TraceContext;
};

type CachedResult = MultitrackVaeServiceResult & { storedAt: number };

const resultCache = new Map<string, CachedResult>();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const readFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const readBoolean = (camel: unknown, snake: unknown, fallback: boolean) => {
  if (typeof camel === 'boolean') return camel;
  if (typeof snake === 'boolean') return snake;
  return fallback;
};

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMode(value: unknown): MultitrackVaeMode | null {
  const raw = readTrimmedString(value);
  return (VALID_MODES as string[]).includes(raw) ? (raw as MultitrackVaeMode) : null;
}

function normalizeModel(value: unknown): MultitrackVaeModelKind {
  const raw = readTrimmedString(value);
  if (raw === 'chords' || raw === 'unconditioned') return raw;
  return DEFAULT_MODEL;
}

function buildCacheKey(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function readCachedResult(cacheKey: string): MultitrackVaeServiceResult | null {
  if (CACHE_TTL_MS <= 0) return null;
  const cached = resultCache.get(cacheKey);
  if (!cached) return null;
  const ageMs = Date.now() - cached.storedAt;
  if (ageMs > CACHE_TTL_MS) {
    resultCache.delete(cacheKey);
    return null;
  }
  resultCache.delete(cacheKey);
  resultCache.set(cacheKey, cached);
  return {
    status: cached.status,
    body: { ...cached.body, cache: { hit: true, key: cacheKey, ageMs, ttlMs: CACHE_TTL_MS } },
  };
}

function writeCachedResult(cacheKey: string, result: MultitrackVaeServiceResult) {
  if (CACHE_TTL_MS <= 0 || result.status !== 200) return;
  if (Array.isArray(result.body.warnings) && (result.body.warnings as unknown[]).length > 0) return;
  while (resultCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (!oldestKey) break;
    resultCache.delete(oldestKey);
  }
  resultCache.set(cacheKey, {
    status: result.status,
    body: { ...result.body, cache: { hit: false, key: cacheKey, ttlMs: CACHE_TTL_MS } },
    storedAt: Date.now(),
  });
}

export async function runMusicMultitrackVaeService(
  body: unknown,
  options?: MultitrackVaeServiceOptions,
): Promise<MultitrackVaeServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);

  const mode = normalizeMode(data?.mode);
  if (!mode) {
    return {
      status: 400,
      body: {
        ok: false,
        error: `Missing or invalid "mode". Use one of: ${VALID_MODES.join(', ')}.`,
      },
    };
  }
  const model = normalizeModel(data?.model);
  const chord = readTrimmedString(data?.chord);
  const chords = readStringArray(data?.chords ?? data?.chordProgression ?? data?.chord_progression);
  const temperature = readFiniteNumber(data?.temperature);
  const numBars = readFiniteNumber(data?.numBars ?? data?.num_bars);
  const numSamples = readFiniteNumber(data?.numSamples ?? data?.num_samples);
  const seed = readFiniteNumber(data?.seed);
  const index = readFiniteNumber(data?.index);
  const index1 = readFiniteNumber(data?.index1 ?? data?.index_1);
  const index2 = readFiniteNumber(data?.index2 ?? data?.index_2);
  const inputMidiBase64 = readTrimmedString(data?.inputMidiBase64 ?? data?.input_midi_base64);
  const serviceUrl = readTrimmedString(
    data?.serviceUrl ?? data?.service_url ?? data?.spaceId ?? data?.space_id,
  );
  const timeoutMs = readFiniteNumber(data?.timeoutMs ?? data?.timeout_ms);
  const convertToMusicXml = readBoolean(data?.convertToMusicXml, data?.convert_to_musicxml, true);
  const includeContent = readBoolean(data?.includeContent, data?.include_content, false);

  if (temperature !== null && (temperature < 0.01 || temperature > 1.5)) {
    return { status: 400, body: { ok: false, error: 'temperature must be between 0.01 and 1.5.' } };
  }
  if ((mode === 'reconstruct' || mode === 'encode_interpolation') && !inputMidiBase64) {
    return { status: 400, body: { ok: false, error: `Mode "${mode}" requires inputMidiBase64.` } };
  }

  const startedAt = Date.now();
  const cacheKey = buildCacheKey({
    mode,
    model,
    chord,
    chords,
    temperature,
    numBars,
    numSamples,
    seed,
    index,
    index1,
    index2,
    inputMidiHash: inputMidiBase64
      ? createHash('sha256').update(inputMidiBase64).digest('hex')
      : null,
    convertToMusicXml,
    includeContent,
  });
  const cached = readCachedResult(cacheKey);
  if (cached) return cached;

  let generation: Awaited<ReturnType<typeof runMultitrackVaeGenerate>>;
  try {
    generation = await runMultitrackVaeGenerate({
      mode,
      model,
      chord: chord || undefined,
      chords,
      temperature: temperature ?? undefined,
      numBars: numBars ?? undefined,
      numSamples: numSamples ?? undefined,
      seed: seed ?? undefined,
      inputMidiBase64: inputMidiBase64 || undefined,
      index: index ?? undefined,
      index1: index1 ?? undefined,
      index2: index2 ?? undefined,
      serviceUrl: serviceUrl || undefined,
      timeoutMs: timeoutMs ?? undefined,
      traceContext,
    });
  } catch (err) {
    if (err instanceof MultitrackVaeInputError) {
      return { status: 400, body: { ok: false, error: err.message } };
    }
    const message = err instanceof Error ? err.message : 'Multitrack MusicVAE generation error.';
    const isService = /service|timed out|connection|unavailable|ECONNREFUSED|fetch failed/i.test(
      message,
    );
    return { status: isService ? 503 : 500, body: { ok: false, error: message } };
  }

  const midiArtifact = await createScoreArtifact({
    format: 'midi',
    content: generation.midiBase64,
    encoding: 'base64',
    mimeType: 'audio/midi',
    filename: `multitrack-vae-${mode}.mid`,
    label: 'multitrack-vae-output-midi',
    metadata: {
      origin: 'api/music/multitrack-vae/generate',
      engine: 'multitrack-musicvae',
      provider: 'self-hosted-service',
      endpoint: generation.endpoint,
      mode,
      model,
      checkpoint: generation.checkpoint,
      chords: chords.length > 0 ? chords : chord ? [chord] : [],
      temperature: temperature ?? null,
      numBars: numBars ?? null,
      numMeasures: generation.numMeasures,
      seed: seed ?? null,
      spaceMetadata: generation.metadata,
    },
  });

  let conversion: Awaited<ReturnType<typeof convertMusicNotation>> | null = null;
  let musicXmlArtifact: Awaited<ReturnType<typeof createScoreArtifact>> | null = null;
  let conversionError: string | null = null;
  if (convertToMusicXml) {
    try {
      conversion = await convertMusicNotation({
        inputFormat: 'midi',
        outputFormat: 'musicxml',
        content: generation.midiBase64,
        contentEncoding: 'base64',
        filename: midiArtifact.filename,
        validate: true,
        traceContext,
      });
      musicXmlArtifact = await createScoreArtifact({
        format: 'musicxml',
        content: conversion.content,
        encoding: conversion.contentEncoding,
        mimeType: 'application/vnd.recordare.musicxml+xml',
        filename: `multitrack-vae-${mode}.musicxml`,
        label: 'multitrack-vae-output-musicxml',
        parentArtifactId: midiArtifact.id,
        sourceArtifactId: midiArtifact.id,
        metadata: {
          origin: 'api/music/multitrack-vae/generate',
          conversion: conversion.normalization,
        },
      });
    } catch (err) {
      conversionError = err instanceof Error ? err.message : String(err);
    }
  }

  const warnings = [...generation.warnings];
  if (conversionError) {
    warnings.push(
      'Multitrack MusicVAE produced MIDI, but the OTS API could not convert it to MusicXML.',
    );
  }

  const result: MultitrackVaeServiceResult = {
    status: 200,
    body: {
      ok: true,
      provider: 'self-hosted-service',
      engine: 'multitrack-musicvae',
      endpoint: generation.endpoint,
      mode,
      model,
      checkpoint: generation.checkpoint,
      numMeasures: generation.numMeasures,
      serviceDurationMs: generation.durationMs,
      midiArtifactId: midiArtifact.id,
      musicXmlArtifactId: musicXmlArtifact?.id ?? null,
      midiArtifact: summarizeScoreArtifact(midiArtifact),
      musicXmlArtifact: musicXmlArtifact ? summarizeScoreArtifact(musicXmlArtifact) : null,
      durationMs: Date.now() - startedAt,
      warnings,
      conversionError: conversionError ? { message: conversionError } : null,
      conversion: conversion
        ? {
            inputFormat: conversion.inputFormat,
            outputFormat: conversion.outputFormat,
            contentEncoding: conversion.contentEncoding,
            normalization: conversion.normalization,
            validation: conversion.validation,
          }
        : null,
      cache: { hit: false, key: cacheKey, ttlMs: CACHE_TTL_MS },
      content: includeContent
        ? {
            midiBase64: generation.midiBase64,
            musicxml: conversion?.content ?? '',
          }
        : undefined,
    },
  };
  writeCachedResult(cacheKey, result);
  return result;
}
