import { allowServerCredentialFallback } from '../api-access-control';
import { convertMusicNotation } from '../music-conversion';
import { createScoreArtifact, getScoreArtifact, summarizeScoreArtifact } from '../score-artifacts';
import type { TraceContext } from '../trace-http';
import {
  AMT_MODELS,
  AmtInputError,
  AmtSpaceError,
  runAmtAccompany,
  type AmtModelKey,
} from './amt-engine';
import {
  AmtMidiError,
  encodeMidi,
  extractGeneratedTracks,
  midiDurationSeconds,
  prepareMelody,
  readMidi,
} from './amt-midi';

const ORIGIN = 'api/music/infill';
const ENGINE = 'anticipatory-music-transformer';

// Phase 1 serves accompaniment only: the Space has no region/instrument infill endpoint yet.
const AVAILABLE_MODES = ['accompany'] as const;
const PLANNED_MODES = ['infill_region', 'infill_instrument', 'continue', 'generate'];

const env = (name: string) => (process.env[name] || '').trim();
const defaultSpaceId = () => env('MUSIC_AMT_SPACE_ID') || 'jhlusko/Anticipatory-Music-Transformer';
const defaultSpaceToken = () =>
  allowServerCredentialFallback() ? env('MUSIC_AMT_SPACE_TOKEN') || env('HF_TOKEN') : '';
const defaultModel = (): AmtModelKey => {
  const configured = env('MUSIC_AMT_MODEL_ID');
  const key = (Object.keys(AMT_MODELS) as AmtModelKey[]).find(
    (k) => k === configured || AMT_MODELS[k] === configured,
  );
  return key ?? 'medium-800k';
};
const positiveNumberEnv = (name: string, fallback: number) => {
  const value = Number(env(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export type AmtInfillServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

export type AmtInfillServiceOptions = {
  traceContext?: TraceContext;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const readFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const readBoolean = (camel: unknown, snake: unknown, fallback: boolean) => {
  if (typeof camel === 'boolean') return camel;
  if (typeof snake === 'boolean') return snake;
  return fallback;
};
const bad = (error: string): AmtInfillServiceResult => ({
  status: 400,
  body: { ok: false, error },
});

function normalizeModel(value: unknown): AmtModelKey | null {
  const raw = readTrimmedString(value);
  if (!raw) return defaultModel();
  const key = (Object.keys(AMT_MODELS) as AmtModelKey[]).find(
    (k) => k === raw || AMT_MODELS[k] === raw,
  );
  return key ?? null;
}

async function readInputMidi(data: Record<string, unknown> | null): Promise<Uint8Array | string> {
  const inline = readTrimmedString(data?.inputMidiBase64 ?? data?.input_midi_base64);
  if (inline) return Uint8Array.from(Buffer.from(inline.replace(/\s+/g, ''), 'base64'));
  const artifactId = readTrimmedString(data?.inputArtifactId ?? data?.input_artifact_id);
  if (!artifactId) return 'Provide inputMidiBase64 or inputArtifactId (a MIDI artifact).';
  const artifact = await getScoreArtifact(artifactId);
  if (!artifact) return `Artifact "${artifactId}" was not found.`;
  if (artifact.format !== 'midi') {
    return `Artifact "${artifactId}" is ${artifact.format}, not MIDI.`;
  }
  return Uint8Array.from(
    Buffer.from(artifact.content, artifact.encoding === 'base64' ? 'base64' : 'utf8'),
  );
}

type ScoreArtifactRecord = Awaited<ReturnType<typeof createScoreArtifact>>;

/** MusicXML for the generated parts, so the editor can add them as new parts. */
async function convertPartsToMusicXml(
  partsArtifact: ScoreArtifactRecord,
  partsMidiBase64: string,
  mode: string,
  traceContext?: TraceContext,
): Promise<{
  conversion: Awaited<ReturnType<typeof convertMusicNotation>> | null;
  musicXmlArtifact: ScoreArtifactRecord | null;
  conversionError: string | null;
}> {
  try {
    const conversion = await convertMusicNotation({
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      content: partsMidiBase64,
      contentEncoding: 'base64',
      filename: partsArtifact.filename,
      validate: true,
      traceContext,
    });
    const musicXmlArtifact = await createScoreArtifact({
      format: 'musicxml',
      content: conversion.content,
      encoding: conversion.contentEncoding,
      mimeType: 'application/vnd.recordare.musicxml+xml',
      filename: `amt-${mode}-parts.musicxml`,
      label: 'amt-generated-parts-musicxml',
      parentArtifactId: partsArtifact.id,
      sourceArtifactId: partsArtifact.id,
      metadata: { origin: ORIGIN, conversion: conversion.normalization },
    });
    return { conversion, musicXmlArtifact, conversionError: null };
  } catch (err) {
    return {
      conversion: null,
      musicXmlArtifact: null,
      conversionError: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `music.infill` — accompany a melody with the Anticipatory Music Transformer.
 *
 * Takes MIDI (inline or an artifact), holds the chosen melody part fixed, and returns the
 * Space's new parts as their own MIDI (plus MusicXML), ready to add to the score as new
 * parts. The Space places those parts on the input's own tempo map, so they line up with
 * the bars the input started at.
 */
export async function runMusicInfillService(
  body: unknown,
  options?: AmtInfillServiceOptions,
): Promise<AmtInfillServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);

  const mode = readTrimmedString(data?.mode) || 'accompany';
  if (PLANNED_MODES.includes(mode)) {
    return bad(
      `Mode "${mode}" is not available yet; the AMT Space currently serves "accompany" only.`,
    );
  }
  if (!(AVAILABLE_MODES as readonly string[]).includes(mode)) {
    return bad(`Invalid "mode". Use one of: ${AVAILABLE_MODES.join(', ')}.`);
  }

  const model = normalizeModel(data?.model);
  if (!model) {
    return bad(`Invalid "model". Use one of: ${Object.keys(AMT_MODELS).join(', ')}.`);
  }
  const historySeconds = readFiniteNumber(data?.historySeconds ?? data?.history_seconds) ?? 5;
  if (historySeconds < 1 || historySeconds > 10) {
    return bad('historySeconds must be between 1 and 10.');
  }
  const melodyTrack = readFiniteNumber(data?.melodyTrack ?? data?.melody_track);
  const melodyTrackName = readTrimmedString(data?.melodyTrackName ?? data?.melody_track_name);
  const timeoutMs =
    readFiniteNumber(data?.timeoutMs ?? data?.timeout_ms) ??
    positiveNumberEnv('MUSIC_AMT_TIMEOUT_MS', 180_000);
  const maxInputSeconds = positiveNumberEnv('MUSIC_AMT_MAX_INPUT_SECONDS', 60);
  const spaceId = readTrimmedString(data?.spaceId ?? data?.space_id) || defaultSpaceId();
  const spaceUrl = env('MUSIC_AMT_SPACE_URL') || undefined;
  const hfToken = readTrimmedString(data?.hfToken ?? data?.hf_token) || defaultSpaceToken();
  const convertToMusicXml = readBoolean(data?.convertToMusicXml, data?.convert_to_musicxml, true);
  const includeContent = readBoolean(data?.includeContent, data?.include_content, false);

  const input = await readInputMidi(data);
  if (typeof input === 'string') return bad(input);

  let prepared: ReturnType<typeof prepareMelody>;
  let inputSeconds: number;
  try {
    const midi = readMidi(input);
    inputSeconds = midiDurationSeconds(midi);
    prepared = prepareMelody(midi, {
      trackIndex: melodyTrack ?? undefined,
      trackName: melodyTrackName || undefined,
    });
  } catch (err) {
    if (err instanceof AmtMidiError) return bad(err.message);
    throw err;
  }
  // The Space accompanies to the end of the file, and each call gets at most 120s of GPU.
  if (inputSeconds > maxInputSeconds) {
    return bad(
      `The input runs ${inputSeconds.toFixed(1)}s; the limit is ${maxInputSeconds}s. Send a shorter selection.`,
    );
  }

  const startedAt = Date.now();
  let generation: Awaited<ReturnType<typeof runAmtAccompany>>;
  try {
    generation = await runAmtAccompany({
      midiBytes: encodeMidi(prepared.midi),
      model,
      melodyInstrument: prepared.instrument,
      historySeconds,
      spaceId,
      spaceUrl,
      hfToken: hfToken || undefined,
      timeoutMs,
      traceContext,
    });
  } catch (err) {
    if (err instanceof AmtInputError) return bad(err.message);
    if (err instanceof AmtSpaceError) {
      return { status: err.status, body: { ok: false, error: err.message } };
    }
    throw err;
  }

  let extracted: ReturnType<typeof extractGeneratedTracks>;
  try {
    extracted = extractGeneratedTracks(readMidi(generation.midiBytes));
  } catch (err) {
    if (err instanceof AmtMidiError) {
      return {
        status: 502,
        body: { ok: false, error: `AMT Space returned unreadable MIDI: ${err.message}` },
      };
    }
    throw err;
  }

  const warnings = [...prepared.warnings];
  if (prepared.remappedFrom) {
    warnings.push(
      `The melody part shared its instrument with another part, so it was sent as ${prepared.instrument} to keep it apart.`,
    );
  }
  if (!extracted.midi) warnings.push('The model wrote no new notes.');

  const provenance = {
    engine: ENGINE,
    provider: 'huggingface-space',
    spaceId,
    spaceRevision: env('MUSIC_AMT_SPACE_REVISION') || null,
    endpoint: generation.endpoint,
    mode,
    model: AMT_MODELS[model],
    historySeconds,
    melody: {
      trackIndex: prepared.trackIndex,
      trackName: prepared.trackName,
      program: prepared.program,
      instrument: prepared.instrument,
      remappedFrom: prepared.remappedFrom,
    },
  };

  const fullMidiBase64 = Buffer.from(generation.midiBytes).toString('base64');
  const midiArtifact = await createScoreArtifact({
    format: 'midi',
    content: fullMidiBase64,
    encoding: 'base64',
    mimeType: 'audio/midi',
    filename: `amt-${mode}-full.mid`,
    label: 'amt-output-midi',
    metadata: { origin: ORIGIN, ...provenance },
  });

  const accompanimentMidiBase64 = extracted.midi
    ? Buffer.from(encodeMidi(extracted.midi)).toString('base64')
    : '';
  const accompanimentArtifact = accompanimentMidiBase64
    ? await createScoreArtifact({
        format: 'midi',
        content: accompanimentMidiBase64,
        encoding: 'base64',
        mimeType: 'audio/midi',
        filename: `amt-${mode}-parts.mid`,
        label: 'amt-generated-parts-midi',
        parentArtifactId: midiArtifact.id,
        sourceArtifactId: midiArtifact.id,
        metadata: { origin: ORIGIN, ...provenance, generatedParts: extracted.parts },
      })
    : null;

  const { conversion, musicXmlArtifact, conversionError } =
    convertToMusicXml && accompanimentArtifact
      ? await convertPartsToMusicXml(
          accompanimentArtifact,
          accompanimentMidiBase64,
          mode,
          traceContext,
        )
      : { conversion: null, musicXmlArtifact: null, conversionError: null };
  if (conversionError) {
    warnings.push('AMT produced MIDI, but the OTS API could not convert it to MusicXML.');
  }

  return {
    status: 200,
    body: {
      ok: true,
      ...provenance,
      inputSeconds,
      generatedParts: extracted.parts,
      serviceDurationMs: generation.durationMs,
      durationMs: Date.now() - startedAt,
      midiArtifactId: midiArtifact.id,
      accompanimentMidiArtifactId: accompanimentArtifact?.id ?? null,
      musicXmlArtifactId: musicXmlArtifact?.id ?? null,
      midiArtifact: summarizeScoreArtifact(midiArtifact),
      accompanimentMidiArtifact: accompanimentArtifact
        ? summarizeScoreArtifact(accompanimentArtifact)
        : null,
      musicXmlArtifact: musicXmlArtifact ? summarizeScoreArtifact(musicXmlArtifact) : null,
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
      content: includeContent
        ? {
            midiBase64: fullMidiBase64,
            accompanimentMidiBase64,
            musicxml: conversion?.content ?? '',
          }
        : undefined,
    },
  };
}
