import { createHash } from 'node:crypto';
import { allowServerCredentialFallback } from '../api-access-control';
import { convertMusicNotation } from '../music-conversion';
import { createScoreArtifact, summarizeScoreArtifact } from '../score-artifacts';
import { type TraceContext, withTraceHeaders } from '../trace-http';

const DEFAULT_TRANSCODA_SPACE_ID = (
  process.env.MUSIC_TRANSCODA_SPACE_ID || 'jhlusko/transcoda'
).trim();
const DEFAULT_TRANSCODA_MODEL_ID = (
  process.env.MUSIC_TRANSCODA_MODEL_ID || 'btrkeks/transcoda-59M-zeroshot-v1'
).trim();
const DEFAULT_TRANSCODA_REVISION = (
  process.env.MUSIC_TRANSCODA_REVISION || 'b529f8aa5d996d9224df3395b5b92d0867343c91'
).trim();
const DEFAULT_TRANSCODA_TIMEOUT_MS = 300_000;
const DEFAULT_TRANSCODA_MAX_LENGTH = 2048;
const DEFAULT_TRANSCODA_NUM_BEAMS = 3;
const DEFAULT_TRANSCODA_REPETITION_PENALTY = 1.1;
const MAX_IMAGE_BYTES = Number(process.env.MUSIC_TRANSCODA_MAX_IMAGE_BYTES || 15 * 1024 * 1024);
const CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.MUSIC_TRANSCODA_CACHE_TTL_MS || 10 * 60 * 1000),
);
const CACHE_MAX_ENTRIES = Math.max(
  1,
  Math.floor(Number(process.env.MUSIC_TRANSCODA_CACHE_MAX_ENTRIES || 64)),
);

type OmrServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

type OmrServiceOptions = {
  traceContext?: TraceContext;
};

type CachedOmrServiceResult = {
  status: number;
  body: Record<string, unknown>;
  storedAt: number;
};

const transcriptionCache = new Map<string, CachedOmrServiceResult>();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const getDefaultTranscodaSpaceToken = () =>
  allowServerCredentialFallback()
    ? (process.env.MUSIC_TRANSCODA_SPACE_TOKEN || process.env.HF_TOKEN || '').trim()
    : '';

const safeErrorMessage = (value: unknown): string => {
  if (value instanceof Error && value.message.trim()) {
    return value.message.trim();
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '';
};

const serializeError = (value: unknown): Record<string, unknown> => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      cause:
        value.cause instanceof Error
          ? {
              name: value.cause.name,
              message: value.cause.message,
            }
          : typeof value.cause === 'string'
            ? value.cause
            : undefined,
    };
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return {
      name: typeof record.name === 'string' ? record.name : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
      status: typeof record.status === 'number' ? record.status : undefined,
      detail: typeof record.detail === 'string' ? record.detail : undefined,
      data: typeof record.data === 'string' ? record.data.slice(0, 2000) : undefined,
    };
  }
  return { message: String(value) };
};

const readFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readBoolean = (camel: unknown, snake: unknown, fallback: boolean) => {
  if (typeof camel === 'boolean') {
    return camel;
  }
  if (typeof snake === 'boolean') {
    return snake;
  }
  return fallback;
};

function normalizeDecoding(value: unknown): 'greedy' | 'beam' {
  const raw = readTrimmedString(value).toLowerCase();
  return raw === 'beam' ? 'beam' : 'greedy';
}

function buildCacheKey(args: {
  imageBytes: Buffer;
  mimeType: string;
  spaceId: string;
  decoding: 'greedy' | 'beam';
  maxLength: number;
  numBeams: number;
  repetitionPenalty: number;
  includeContent: boolean;
  convertToMusicXml: boolean;
  deepValidate: boolean;
  pageNumber: number | null;
}) {
  const hash = createHash('sha256');
  hash.update(args.imageBytes);
  hash.update(
    JSON.stringify({
      mimeType: args.mimeType,
      spaceId: args.spaceId,
      decoding: args.decoding,
      maxLength: args.maxLength,
      numBeams: args.numBeams,
      repetitionPenalty: args.repetitionPenalty,
      includeContent: args.includeContent,
      convertToMusicXml: args.convertToMusicXml,
      deepValidate: args.deepValidate,
      pageNumber: args.pageNumber,
    }),
  );
  return hash.digest('hex');
}

function readCachedResult(cacheKey: string): OmrServiceResult | null {
  if (CACHE_TTL_MS <= 0) {
    return null;
  }
  const cached = transcriptionCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  const ageMs = Date.now() - cached.storedAt;
  if (ageMs > CACHE_TTL_MS) {
    transcriptionCache.delete(cacheKey);
    return null;
  }
  transcriptionCache.delete(cacheKey);
  transcriptionCache.set(cacheKey, cached);
  return {
    status: cached.status,
    body: {
      ...cached.body,
      cache: {
        hit: true,
        key: cacheKey,
        ageMs,
        ttlMs: CACHE_TTL_MS,
      },
    },
  };
}

function writeCachedResult(cacheKey: string, result: OmrServiceResult) {
  if (CACHE_TTL_MS <= 0 || result.status !== 200) {
    return;
  }
  if (result.body.conversionError) {
    return;
  }
  if (Array.isArray(result.body.warnings) && result.body.warnings.length > 0) {
    return;
  }
  while (transcriptionCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = transcriptionCache.keys().next().value;
    if (!oldestKey) break;
    transcriptionCache.delete(oldestKey);
  }
  transcriptionCache.set(cacheKey, {
    status: result.status,
    body: {
      ...result.body,
      cache: {
        hit: false,
        key: cacheKey,
        ttlMs: CACHE_TTL_MS,
      },
    },
    storedAt: Date.now(),
  });
}

function parseImagePayload(data: Record<string, unknown> | null) {
  const explicitBase64 = readTrimmedString(data?.imageBase64 ?? data?.image_base64);
  const dataUrl = readTrimmedString(data?.imageDataUrl ?? data?.image_data_url);
  let mimeType = readTrimmedString(data?.mimeType ?? data?.mime_type) || 'image/png';
  let base64 = explicitBase64;
  if (!base64 && dataUrl) {
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1] || mimeType;
      base64 = match[2] || '';
    }
  }
  const compact = base64.replace(/\s+/g, '');
  if (!compact) {
    return { error: 'Missing imageBase64 or imageDataUrl.' };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(compact, 'base64');
    const reencoded = bytes.toString('base64').replace(/=+$/, '');
    if (reencoded !== compact.replace(/=+$/, '')) {
      return { error: 'Image payload is not valid base64.' };
    }
  } catch {
    return { error: 'Image payload is not valid base64.' };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      error: `Image payload exceeds size limit (${bytes.length} bytes > ${MAX_IMAGE_BYTES}).`,
    };
  }
  return { base64: compact, bytes, mimeType };
}

function extractKernFromGradioData(data: unknown): {
  kern: string;
  metadata: Record<string, unknown> | string | null;
  rawOutputs?: unknown[];
} {
  if (!Array.isArray(data)) {
    return { kern: '', metadata: null };
  }
  const rawOutputs = data as unknown[];
  const kern = typeof rawOutputs[0] === 'string' ? rawOutputs[0].trim() : '';
  const metadataRaw = rawOutputs[1];
  if (typeof metadataRaw === 'string' && metadataRaw.trim()) {
    try {
      return { kern, metadata: JSON.parse(metadataRaw), rawOutputs };
    } catch {
      return { kern, metadata: metadataRaw, rawOutputs };
    }
  }
  return {
    kern,
    metadata: asRecord(metadataRaw),
    rawOutputs,
  };
}

async function callTranscodaSpace(args: {
  spaceId: string;
  hfToken?: string;
  imageBytes: Buffer;
  mimeType: string;
  decoding: 'greedy' | 'beam';
  maxLength: number;
  numBeams: number;
  repetitionPenalty: number;
  timeoutMs: number;
  traceContext?: TraceContext;
}) {
  const { Client } = await import('@gradio/client');
  let app: Awaited<ReturnType<typeof Client.connect>>;
  try {
    app = await Client.connect(args.spaceId, {
      events: ['data', 'status', 'log'],
      ...(args.hfToken ? { token: args.hfToken as `hf_${string}` } : {}),
      ...(args.traceContext ? { headers: withTraceHeaders(args.traceContext) } : {}),
    });
  } catch (err) {
    const message = safeErrorMessage(err) || 'Unable to connect to the Transcoda Space.';
    throw new Error(`Transcoda Space connection failed for ${args.spaceId}: ${message}`, {
      cause: err,
    });
  }

  const imageBytes = new Uint8Array(args.imageBytes);
  const imageBlob =
    typeof File === 'function'
      ? new File([imageBytes], 'score-page.png', { type: args.mimeType })
      : new Blob([imageBytes], { type: args.mimeType });
  const startedAt = Date.now();
  let prediction: unknown;
  try {
    prediction = await Promise.race([
      app.predict('/transcribe', [
        imageBlob,
        args.decoding,
        args.maxLength,
        args.numBeams,
        args.repetitionPenalty,
      ]),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          clearTimeout(timer);
          reject(new Error(`Transcoda Space transcription timed out after ${args.timeoutMs}ms.`));
        }, args.timeoutMs);
      }),
    ]);
  } catch (err) {
    const message = safeErrorMessage(err) || 'OMR transcription error.';
    const detail = {
      spaceId: args.spaceId,
      endpoint: '/transcribe',
      decoding: args.decoding,
      maxLength: args.maxLength,
      numBeams: args.numBeams,
      repetitionPenalty: args.repetitionPenalty,
      timeoutMs: args.timeoutMs,
      providerError: serializeError(err),
    };
    const wrapped = new Error(
      `Transcoda Space transcription failed for ${args.spaceId} /transcribe (${args.decoding}, maxLength=${args.maxLength}, numBeams=${args.numBeams}, repetitionPenalty=${args.repetitionPenalty}): ${message}`,
      { cause: err },
    ) as Error & { details?: Record<string, unknown> };
    wrapped.details = detail;
    throw wrapped;
  }
  const extracted = extractKernFromGradioData((prediction as { data?: unknown })?.data);
  if (!extracted.kern) {
    const wrapped = new Error('Transcoda Space did not return **kern output.') as Error & {
      details?: Record<string, unknown>;
    };
    wrapped.details = {
      spaceId: args.spaceId,
      endpoint: '/transcribe',
      rawOutputs: extracted.rawOutputs,
    };
    throw wrapped;
  }
  return {
    kern: extracted.kern,
    metadata: extracted.metadata,
    rawOutputs: extracted.rawOutputs,
    durationMs: Date.now() - startedAt,
  };
}

export async function runMusicOmrTranscribeService(
  body: unknown,
  options?: OmrServiceOptions,
): Promise<OmrServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);
  const imagePayload = parseImagePayload(data);
  if ('error' in imagePayload) {
    return { status: 400, body: { ok: false, error: imagePayload.error } };
  }

  const spaceId = readTrimmedString(data?.spaceId ?? data?.space_id) || DEFAULT_TRANSCODA_SPACE_ID;
  const hfToken =
    readTrimmedString(data?.hfToken ?? data?.hf_token) || getDefaultTranscodaSpaceToken();
  const decoding = normalizeDecoding(data?.decoding);
  const maxLength = Math.max(
    1,
    Math.floor(
      readFiniteNumber(data?.maxLength ?? data?.max_length) || DEFAULT_TRANSCODA_MAX_LENGTH,
    ),
  );
  const numBeams = Math.max(
    1,
    Math.floor(readFiniteNumber(data?.numBeams ?? data?.num_beams) || DEFAULT_TRANSCODA_NUM_BEAMS),
  );
  const repetitionPenalty =
    readFiniteNumber(data?.repetitionPenalty ?? data?.repetition_penalty) ||
    DEFAULT_TRANSCODA_REPETITION_PENALTY;
  const timeoutMs = Math.max(
    1,
    Math.floor(
      readFiniteNumber(data?.timeoutMs ?? data?.timeout_ms) ||
        Number(process.env.MUSIC_TRANSCODA_TIMEOUT_MS) ||
        DEFAULT_TRANSCODA_TIMEOUT_MS,
    ),
  );
  const includeContent = readBoolean(data?.includeContent, data?.include_content, false);
  const convertToMusicXml = readBoolean(data?.convertToMusicXml, data?.convert_to_musicxml, true);
  const deepValidate = readBoolean(data?.deepValidate, data?.deep_validate, false);
  const pageNumber = readFiniteNumber(data?.pageNumber ?? data?.page_number);
  const startedAt = Date.now();
  const cacheKey = buildCacheKey({
    imageBytes: imagePayload.bytes,
    mimeType: imagePayload.mimeType,
    spaceId,
    decoding,
    maxLength,
    numBeams,
    repetitionPenalty,
    includeContent,
    convertToMusicXml,
    deepValidate,
    pageNumber: pageNumber || null,
  });
  const cached = readCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  const imageArtifact = await createScoreArtifact({
    format: 'png',
    content: imagePayload.base64,
    encoding: 'base64',
    mimeType: imagePayload.mimeType,
    filename: pageNumber
      ? `transcoda-page-${Math.max(1, Math.floor(pageNumber))}.png`
      : 'transcoda-page.png',
    label: 'transcoda-input-image',
    metadata: {
      origin: 'api/music/omr/transcribe',
      pageNumber: pageNumber || null,
    },
  });

  const transcription = await callTranscodaSpace({
    spaceId,
    hfToken,
    imageBytes: imagePayload.bytes,
    mimeType: imagePayload.mimeType,
    decoding,
    maxLength,
    numBeams,
    repetitionPenalty,
    timeoutMs,
    traceContext,
  });

  const kernArtifact = await createScoreArtifact({
    format: 'kern',
    content: transcription.kern,
    encoding: 'utf8',
    mimeType: 'text/plain; charset=utf-8',
    filename: pageNumber
      ? `transcoda-page-${Math.max(1, Math.floor(pageNumber))}.krn`
      : 'transcoda-output.krn',
    label: 'transcoda-output-kern',
    parentArtifactId: imageArtifact.id,
    sourceArtifactId: imageArtifact.id,
    metadata: {
      origin: 'api/music/omr/transcribe',
      pageNumber: pageNumber || null,
      spaceId,
      model: DEFAULT_TRANSCODA_MODEL_ID,
      revision: DEFAULT_TRANSCODA_REVISION,
      decoding,
      maxLength,
      numBeams,
      repetitionPenalty,
      spaceMetadata: transcription.metadata,
    },
  });

  let conversion: Awaited<ReturnType<typeof convertMusicNotation>> | null = null;
  let musicXmlArtifact: Awaited<ReturnType<typeof createScoreArtifact>> | null = null;
  let conversionError: string | null = null;
  if (convertToMusicXml) {
    try {
      conversion = await convertMusicNotation({
        inputFormat: 'kern',
        outputFormat: 'musicxml',
        content: transcription.kern,
        filename: kernArtifact.filename,
        validate: true,
        deepValidate,
        timeoutMs,
        traceContext,
      });
      musicXmlArtifact = await createScoreArtifact({
        format: 'musicxml',
        content: conversion.content,
        encoding: conversion.contentEncoding,
        mimeType: 'application/vnd.recordare.musicxml+xml',
        filename: pageNumber
          ? `transcoda-page-${Math.max(1, Math.floor(pageNumber))}.musicxml`
          : 'transcoda-output.musicxml',
        label: 'transcoda-output-musicxml',
        parentArtifactId: kernArtifact.id,
        sourceArtifactId: imageArtifact.id,
        validation: conversion.validation,
        provenance: conversion.provenance,
        metadata: {
          origin: 'api/music/omr/transcribe',
          pageNumber: pageNumber || null,
          conversion: conversion.normalization,
        },
      });
    } catch (err) {
      conversionError = err instanceof Error ? err.message : String(err);
    }
  }

  const result: OmrServiceResult = {
    status: 200,
    body: {
      ok: true,
      provider: 'huggingface-space',
      engine: 'transcoda',
      spaceId,
      model: DEFAULT_TRANSCODA_MODEL_ID,
      revision: DEFAULT_TRANSCODA_REVISION,
      pageNumber: pageNumber || null,
      decoding,
      inputArtifactId: imageArtifact.id,
      kernArtifactId: kernArtifact.id,
      musicXmlArtifactId: musicXmlArtifact?.id ?? null,
      inputArtifact: summarizeScoreArtifact(imageArtifact),
      kernArtifact: summarizeScoreArtifact(kernArtifact),
      musicXmlArtifact: musicXmlArtifact ? summarizeScoreArtifact(musicXmlArtifact) : null,
      metadata: transcription.metadata,
      durationMs: Date.now() - startedAt,
      spaceDurationMs: transcription.durationMs,
      warnings: conversionError
        ? ['Transcoda returned kern text, but the OTS API could not convert it to MusicXML.']
        : [],
      conversionError: conversionError
        ? {
            message: conversionError,
          }
        : null,
      conversion: conversion
        ? {
            inputFormat: conversion.inputFormat,
            outputFormat: conversion.outputFormat,
            contentEncoding: conversion.contentEncoding,
            normalization: conversion.normalization,
            validation: conversion.validation,
            provenance: conversion.provenance,
          }
        : null,
      cache: {
        hit: false,
        key: cacheKey,
        ttlMs: CACHE_TTL_MS,
      },
      content: includeContent
        ? {
            kern: transcription.kern,
            musicxml: conversion?.content ?? '',
          }
        : undefined,
    },
  };
  writeCachedResult(cacheKey, result);
  return result;
}
