import { type TraceContext } from '../trace-http';
import { convertMusicNotation } from '../music-conversion';
import {
  createScoreArtifact,
  getScoreArtifact,
  summarizeScoreArtifact,
  type ScoreArtifact,
} from '../score-artifacts';
import { withTraceHeaders } from '../trace-http';
import {
  asRecord,
  errorResult,
  normalizeInputArtifactId,
  readBoolean,
  readContent,
  type ServiceResult,
} from './common';

type ChordGanBackend = 'huggingface-space';

type ChordGanServiceOptions = {
  traceContext?: TraceContext;
};

type ChordGanSseEvent = {
  event: string;
  data: Record<string, unknown>;
};

type ChordGanStreamResult = {
  status: number;
  events?: ChordGanSseEvent[];
  body?: Record<string, unknown>;
};

const DEFAULT_CHORDGAN_SPACE_ID = (process.env.MUSIC_CHORDGAN_DEFAULT_SPACE_ID || 'your-org/chordgan-space').trim();
const DEFAULT_CHORDGAN_STYLES = (process.env.MUSIC_CHORDGAN_DEFAULT_STYLES || 'classical,jazz,pop')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const DEFAULT_CHORDGAN_TIMEOUT_MS = 300_000;
const MIN_CHORDGAN_TIMEOUT_MS = 1_000;
const MAX_CHORDGAN_TIMEOUT_MS = 900_000;
const DEFAULT_TRANSFER_API_NAME = (process.env.MUSIC_CHORDGAN_SPACE_TRANSFER_API_NAME || '/transfer').trim();
const DEFAULT_OPTIONS_API_NAME = (process.env.MUSIC_CHORDGAN_SPACE_OPTIONS_API_NAME || '/options').trim();
const DEFAULT_CHORDGAN_SPACE_TOKEN = (process.env.MUSIC_CHORDGAN_SPACE_TOKEN || '').trim();

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function normalizeBackend(value: unknown): ChordGanBackend | null {
  const normalized = readTrimmedString(value).toLowerCase();
  if (!normalized || normalized === 'huggingface-space' || normalized === 'hf-space' || normalized === 'space' || normalized === 'gradio-space') {
    return 'huggingface-space';
  }
  return null;
}

function readBoundedInt(value: unknown, fallback: number, min: number, max: number) {
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
}

function readInputFormat(data: Record<string, unknown> | null): 'musicxml' | 'midi' | null {
  const explicit = readTrimmedString(data?.inputFormat ?? data?.input_format).toLowerCase();
  if (explicit === 'musicxml' || explicit === 'xml') {
    return 'musicxml';
  }
  if (explicit === 'midi') {
    return 'midi';
  }

  const content = readContent(data);
  if (content.trim().startsWith('<')) {
    return 'musicxml';
  }
  const base64Content = readTrimmedString(data?.contentBase64 ?? data?.content_base64);
  if (base64Content.startsWith('TVRoZ')) {
    return 'midi';
  }
  return null;
}

const logChordGanServiceEvent = (
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

type ParsedTransferRequest = {
  backend: ChordGanBackend | null;
  backendInput: string;
  spaceId: string;
  style: string;
  inputArtifactId: string;
  content: string;
  contentBase64: string;
  inputFormat: 'musicxml' | 'midi' | null;
  includeMidi: boolean;
  includeMusicXml: boolean;
  includeContent: boolean;
  persistArtifacts: boolean;
  validate: boolean;
  deepValidate: boolean;
  timeoutMs: number;
  dryRun: boolean;
  applyModeHint: 'replace' | 'append' | null;
  hfToken: string;
};

function parseTransferRequest(body: unknown): ParsedTransferRequest {
  const data = asRecord(body);
  const backendInput = readTrimmedString(data?.backend || 'huggingface-space') || 'huggingface-space';
  const timeoutMs = readBoundedInt(
    data?.timeoutMs ?? data?.timeout_ms,
    DEFAULT_CHORDGAN_TIMEOUT_MS,
    MIN_CHORDGAN_TIMEOUT_MS,
    MAX_CHORDGAN_TIMEOUT_MS,
  );
  const applyModeRaw = readTrimmedString(data?.applyModeHint ?? data?.apply_mode_hint).toLowerCase();
  const applyModeHint = applyModeRaw === 'replace' || applyModeRaw === 'append' ? applyModeRaw : null;

  return {
    backend: normalizeBackend(backendInput),
    backendInput,
    spaceId: readTrimmedString(data?.spaceId ?? data?.space_id) || DEFAULT_CHORDGAN_SPACE_ID,
    style: readTrimmedString(data?.style ?? data?.styleTarget ?? data?.style_target),
    inputArtifactId: normalizeInputArtifactId(data),
    content: readContent(data),
    contentBase64: readTrimmedString(data?.contentBase64 ?? data?.content_base64),
    inputFormat: readInputFormat(data),
    includeMidi: readBoolean(data?.includeMidi, data?.include_midi, true),
    includeMusicXml: readBoolean(data?.includeMusicXml, data?.include_music_xml, true),
    includeContent: readBoolean(data?.includeContent, data?.include_content, false),
    persistArtifacts: readBoolean(data?.persistArtifacts, data?.persist_artifacts, true),
    validate: readBoolean(data?.validate, undefined, true),
    deepValidate: readBoolean(data?.deepValidate, data?.deep_validate, false),
    timeoutMs,
    dryRun: readBoolean(data?.dryRun, data?.dry_run, true),
    applyModeHint,
    hfToken: readTrimmedString(data?.hfToken ?? data?.hf_token) || DEFAULT_CHORDGAN_SPACE_TOKEN,
  };
}

function decodeMidiDataUrl(dataUrl: string): string | null {
  const trimmed = dataUrl.trim();
  const marker = 'base64,';
  const idx = trimmed.indexOf(marker);
  if (idx < 0) {
    return null;
  }
  const base64 = trimmed.slice(idx + marker.length).trim();
  return base64 || null;
}

function looksLikeMidiBase64(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('TVRoZ');
}

function parseStylesFromSpaceData(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const styles = new Set<string>();
  for (const entry of data) {
    if (typeof entry === 'string' && entry.trim()) {
      styles.add(entry.trim());
      continue;
    }
    const record = asRecord(entry);
    const choices = record?.choices;
    if (!Array.isArray(choices)) {
      continue;
    }
    for (const choice of choices) {
      if (Array.isArray(choice) && typeof choice[0] === 'string' && choice[0].trim()) {
        styles.add(choice[0].trim());
        continue;
      }
      if (typeof choice === 'string' && choice.trim()) {
        styles.add(choice.trim());
      }
    }
  }
  return [...styles];
}

async function fetchChordGanSpaceStyles(args: {
  spaceId: string;
  apiName: string;
  hfToken?: string;
  traceContext?: TraceContext;
}): Promise<{ styles: string[]; raw: unknown }> {
  const { Client } = await import('@gradio/client');
  const app = await Client.connect(args.spaceId, {
    events: ['data', 'status', 'log'],
    ...(args.hfToken ? { token: args.hfToken as `hf_${string}` } : {}),
    ...(args.traceContext ? { headers: withTraceHeaders(args.traceContext) } : {}),
  });
  try {
    const result = await app.predict(args.apiName, []);
    const data = asRecord(result)?.data;
    return {
      styles: parseStylesFromSpaceData(data),
      raw: result,
    };
  } finally {
    app.close();
  }
}

function extractMidiBase64FromSpaceData(data: unknown): { midiBase64: string | null; strategy: string } {
  if (typeof data === 'string') {
    const direct = data.trim();
    if (looksLikeMidiBase64(direct)) {
      return { midiBase64: direct, strategy: 'string-base64' };
    }
    const fromDataUrl = decodeMidiDataUrl(direct);
    if (fromDataUrl && looksLikeMidiBase64(fromDataUrl)) {
      return { midiBase64: fromDataUrl, strategy: 'string-data-url' };
    }
  }

  const record = asRecord(data);
  if (record) {
    const candidates = [
      record.midiBase64,
      record.midi_base64,
      record.outputMidiBase64,
      record.output_midi_base64,
      record.midi,
      record.output,
      record.data,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const trimmed = candidate.trim();
      if (looksLikeMidiBase64(trimmed)) {
        return { midiBase64: trimmed, strategy: 'object-base64-field' };
      }
      const fromDataUrl = decodeMidiDataUrl(trimmed);
      if (fromDataUrl && looksLikeMidiBase64(fromDataUrl)) {
        return { midiBase64: fromDataUrl, strategy: 'object-data-url-field' };
      }
    }
  }

  if (Array.isArray(data)) {
    for (const candidate of data) {
      const extracted = extractMidiBase64FromSpaceData(candidate);
      if (extracted.midiBase64) {
        return { midiBase64: extracted.midiBase64, strategy: `array:${extracted.strategy}` };
      }
    }
  }

  return { midiBase64: null, strategy: 'unrecognized' };
}

async function callChordGanSpaceTransfer(args: {
  spaceId: string;
  apiName: string;
  hfToken?: string;
  midiBase64: string;
  style: string;
  timeoutMs: number;
  traceContext?: TraceContext;
}): Promise<{ midiBase64: string; strategy: string; raw: unknown }> {
  const { Client } = await import('@gradio/client');
  const app = await Client.connect(args.spaceId, {
    events: ['data', 'status', 'log'],
    ...(args.hfToken ? { token: args.hfToken as `hf_${string}` } : {}),
    ...(args.traceContext ? { headers: withTraceHeaders(args.traceContext) } : {}),
  });

  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const predictPromise = app.predict(args.apiName, [args.midiBase64, args.style]);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`ChordGAN Space transfer timed out after ${args.timeoutMs}ms.`));
      }, args.timeoutMs);
    });

    const result = await Promise.race([predictPromise, timeoutPromise]);
    const data = asRecord(result)?.data ?? result;
    const extracted = extractMidiBase64FromSpaceData(data);
    if (!extracted.midiBase64) {
      throw new Error(
        `ChordGAN Space output did not include recognizable MIDI base64 (strategy=${extracted.strategy}).`,
      );
    }
    return {
      midiBase64: extracted.midiBase64,
      strategy: extracted.strategy,
      raw: {
        ...asRecord(result),
        durationMs: Date.now() - startedAt,
      },
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    app.close();
  }
}

async function resolveInputSourceForTransfer(request: ParsedTransferRequest): Promise<{
  sourceKind: 'artifact' | 'inline-base64' | 'inline-text';
  sourceArtifact: ScoreArtifact | null;
  sourceContent: string;
  sourceFormat: 'musicxml' | 'midi';
  sourceFilename: string;
}> {
  if (request.inputArtifactId) {
    const artifact = await getScoreArtifact(request.inputArtifactId);
    if (!artifact) {
      throw new Error(`Input artifact not found: ${request.inputArtifactId}`);
    }
    const format = artifact.format === 'midi'
      ? 'midi'
      : artifact.format === 'musicxml'
        ? 'musicxml'
        : null;
    if (!format) {
      throw new Error(`Input artifact must be musicxml or midi format (got ${artifact.format}).`);
    }
    return {
      sourceKind: 'artifact',
      sourceArtifact: artifact,
      sourceContent: artifact.content,
      sourceFormat: format,
      sourceFilename: artifact.filename || `input.${format === 'midi' ? 'mid' : 'musicxml'}`,
    };
  }

  if (request.contentBase64) {
    if (request.inputFormat && request.inputFormat !== 'midi') {
      throw new Error('contentBase64 is only supported for MIDI input in this phase.');
    }
    return {
      sourceKind: 'inline-base64',
      sourceArtifact: null,
      sourceContent: request.contentBase64,
      sourceFormat: 'midi',
      sourceFilename: 'input.mid',
    };
  }

  if (request.content) {
    const format = request.inputFormat || 'musicxml';
    return {
      sourceKind: 'inline-text',
      sourceArtifact: null,
      sourceContent: request.content,
      sourceFormat: format,
      sourceFilename: format === 'midi' ? 'input.mid' : 'input.musicxml',
    };
  }

  throw new Error('Missing input source. Provide inputArtifactId or content/contentBase64.');
}

async function convertInputToMidiBase64(args: {
  content: string;
  inputFormat: 'musicxml' | 'midi';
  filename: string;
  validate: boolean;
  deepValidate: boolean;
  timeoutMs: number;
  traceContext?: TraceContext;
}) {
  if (args.inputFormat === 'midi') {
    const normalized = await convertMusicNotation({
      inputFormat: 'midi',
      outputFormat: 'midi',
      content: args.content,
      contentEncoding: 'base64',
      filename: args.filename,
      validate: args.validate,
      deepValidate: args.deepValidate,
      timeoutMs: args.timeoutMs,
      traceContext: args.traceContext,
    });
    return {
      midiBase64: normalized.content,
      conversion: normalized,
    };
  }

  const converted = await convertMusicNotation({
    inputFormat: 'musicxml',
    outputFormat: 'midi',
    content: args.content,
    filename: args.filename,
    validate: args.validate,
    deepValidate: args.deepValidate,
    timeoutMs: args.timeoutMs,
    traceContext: args.traceContext,
  });
  return {
    midiBase64: converted.content,
    conversion: converted,
  };
}

export async function runChordGanOptionsService(
  body: unknown,
  options?: ChordGanServiceOptions,
): Promise<ServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);
  const backendInput = readTrimmedString(data?.backend || 'huggingface-space') || 'huggingface-space';
  const backend = normalizeBackend(backendInput);
  if (!backend) {
    return errorResult(400, 'invalid_request', `Unsupported ChordGAN backend: ${backendInput || '(empty)'}.`);
  }

  const spaceId = readTrimmedString(data?.spaceId ?? data?.space_id) || DEFAULT_CHORDGAN_SPACE_ID;
  const token = readTrimmedString(data?.hfToken ?? data?.hf_token) || DEFAULT_CHORDGAN_SPACE_TOKEN;
  const preferDynamic = readBoolean(data?.preferDynamic, data?.prefer_dynamic, true);
  const stylesFallback = DEFAULT_CHORDGAN_STYLES.length > 0 ? DEFAULT_CHORDGAN_STYLES : ['classical'];
  let styles = stylesFallback;
  let dynamicLoaded = false;
  const warnings: string[] = [];
  let rawOptions: unknown = null;

  if (preferDynamic) {
    try {
      const dynamic = await fetchChordGanSpaceStyles({
        spaceId,
        apiName: DEFAULT_OPTIONS_API_NAME,
        hfToken: token || undefined,
        traceContext,
      });
      if (dynamic.styles.length > 0) {
        styles = dynamic.styles;
        dynamicLoaded = true;
      } else {
        warnings.push('ChordGAN Space options endpoint returned no styles; using fallback styles.');
      }
      rawOptions = dynamic.raw;
    } catch (error) {
      warnings.push(`Failed to fetch ChordGAN styles from Space; using fallback styles. (${error instanceof Error ? error.message : 'unknown'})`);
    }
  }

  logChordGanServiceEvent('info', 'music.chordgan.options.result', traceContext, {
    backend,
    spaceId,
    styleCount: styles.length,
    dynamicLoaded,
  });

  return {
    status: 200,
    body: {
      ok: true,
      specialist: 'chordgan',
      backend,
      phase: 'phase0',
      options: {
        styles,
        defaults: {
          backend,
          spaceId,
          style: styles[0] || '',
          timeoutMs: DEFAULT_CHORDGAN_TIMEOUT_MS,
        },
        gradio: {
          optionsApiName: DEFAULT_OPTIONS_API_NAME,
          transferApiName: DEFAULT_TRANSFER_API_NAME,
        },
      },
      capabilities: {
        stream: true,
        dryRunOnly: false,
        dynamicOptions: true,
      },
      warnings,
      backendRaw: readBoolean(data?.includeRawOutput, data?.include_raw_output, false) ? rawOptions : undefined,
      message: dynamicLoaded
        ? 'ChordGAN options loaded from Hugging Face Space.'
        : 'ChordGAN options loaded from fallback defaults.',
    },
  };
}

export async function runChordGanTransferService(
  body: unknown,
  options?: ChordGanServiceOptions,
): Promise<ServiceResult> {
  const traceContext = options?.traceContext;
  const request = parseTransferRequest(body);
  if (!request.backend) {
    return errorResult(400, 'invalid_request', `Unsupported ChordGAN backend: ${request.backendInput || '(empty)'}.`);
  }
  if (!request.style) {
    return errorResult(400, 'invalid_request', 'Missing style for ChordGAN transfer.');
  }
  if (!request.includeMidi && !request.includeMusicXml) {
    return errorResult(400, 'invalid_request', 'At least one output must be requested (includeMidi or includeMusicXml).');
  }

  const warnings: string[] = [];
  const sourceKind = request.inputArtifactId
    ? 'artifact'
    : (request.contentBase64 ? 'inline-base64' : (request.content ? 'inline-text' : 'none'));
  if (sourceKind === 'none') {
    return errorResult(400, 'invalid_request', 'Missing input source. Provide inputArtifactId or content/contentBase64.');
  }
  if (!request.inputFormat) {
    warnings.push('Input format could not be inferred; defaulting to backend-side detection in future phases.');
  }
  if (request.content && request.contentBase64 && !request.inputArtifactId) {
    warnings.push('Both content and contentBase64 were provided; content will be preferred in future phases.');
  }
  logChordGanServiceEvent('info', 'music.chordgan.transfer.request', traceContext, {
    backend: request.backend,
    spaceId: request.spaceId,
    style: request.style,
    sourceKind,
    includeMidi: request.includeMidi,
    includeMusicXml: request.includeMusicXml,
    timeoutMs: request.timeoutMs,
    dryRun: request.dryRun,
  });

  if (!request.dryRun) {
    try {
      const source = await resolveInputSourceForTransfer(request);
      const sourceMidi = await convertInputToMidiBase64({
        content: source.sourceContent,
        inputFormat: source.sourceFormat,
        filename: source.sourceFilename,
        validate: request.validate,
        deepValidate: request.deepValidate,
        timeoutMs: request.timeoutMs,
        traceContext,
      });
      const transferStartedAt = Date.now();
      const spaceResult = await callChordGanSpaceTransfer({
        spaceId: request.spaceId,
        apiName: DEFAULT_TRANSFER_API_NAME,
        hfToken: request.hfToken || undefined,
        midiBase64: sourceMidi.midiBase64,
        style: request.style,
        timeoutMs: request.timeoutMs,
        traceContext,
      });

      const outputMidiNormalized = await convertMusicNotation({
        inputFormat: 'midi',
        outputFormat: 'midi',
        content: spaceResult.midiBase64,
        contentEncoding: 'base64',
        filename: 'chordgan-output.mid',
        validate: request.validate,
        deepValidate: request.deepValidate,
        timeoutMs: request.timeoutMs,
        traceContext,
      });

      let musicXmlResult: Awaited<ReturnType<typeof convertMusicNotation>> | null = null;
      if (request.includeMusicXml) {
        musicXmlResult = await convertMusicNotation({
          inputFormat: 'midi',
          outputFormat: 'musicxml',
          content: outputMidiNormalized.content,
          contentEncoding: 'base64',
          filename: 'chordgan-output.musicxml',
          validate: request.validate,
          deepValidate: request.deepValidate,
          timeoutMs: request.timeoutMs,
          traceContext,
        });
      }

      let sourceArtifactSummary: ReturnType<typeof summarizeScoreArtifact> | null = null;
      if (source.sourceArtifact) {
        sourceArtifactSummary = summarizeScoreArtifact(source.sourceArtifact);
      }

      let generatedMidiArtifact: ScoreArtifact | null = null;
      let outputArtifact: ScoreArtifact | null = null;

      if (request.persistArtifacts) {
        generatedMidiArtifact = await createScoreArtifact({
          format: 'midi',
          content: outputMidiNormalized.content,
          encoding: 'base64',
          mimeType: 'audio/midi',
          filename: 'chordgan-output.mid',
          label: 'chordgan-output-midi',
          parentArtifactId: source.sourceArtifact?.id,
          sourceArtifactId: source.sourceArtifact?.id,
          validation: outputMidiNormalized.validation,
          provenance: outputMidiNormalized.provenance,
          metadata: {
            origin: 'api/music/chordgan/transfer',
            specialist: 'chordgan',
            backend: request.backend,
            spaceId: request.spaceId,
            style: request.style,
            strategy: spaceResult.strategy,
          },
        });
        if (musicXmlResult) {
          outputArtifact = await createScoreArtifact({
            format: 'musicxml',
            content: musicXmlResult.content,
            filename: 'chordgan-output.musicxml',
            label: 'chordgan-output-musicxml',
            parentArtifactId: generatedMidiArtifact.id,
            sourceArtifactId: source.sourceArtifact?.id || generatedMidiArtifact.id,
            validation: musicXmlResult.validation,
            provenance: musicXmlResult.provenance,
            metadata: {
              origin: 'api/music/chordgan/transfer',
              specialist: 'chordgan',
              backend: request.backend,
              spaceId: request.spaceId,
              style: request.style,
            },
          });
        }
      }

      const responseWarnings = warnings.slice();
      if (sourceMidi.conversion.validation.summary.warning > 0) {
        responseWarnings.push(`Input conversion returned ${sourceMidi.conversion.validation.summary.warning} warning(s).`);
      }
      if (outputMidiNormalized.validation.summary.warning > 0) {
        responseWarnings.push(`Output MIDI normalization returned ${outputMidiNormalized.validation.summary.warning} warning(s).`);
      }
      if (musicXmlResult && musicXmlResult.validation.summary.warning > 0) {
        responseWarnings.push(`MIDI -> MusicXML conversion returned ${musicXmlResult.validation.summary.warning} warning(s).`);
      }

      logChordGanServiceEvent('info', 'music.chordgan.transfer.backend_result', traceContext, {
        backend: request.backend,
        spaceId: request.spaceId,
        style: request.style,
        durationMs: Date.now() - transferStartedAt,
        strategy: spaceResult.strategy,
        includeMusicXml: request.includeMusicXml,
        warningsCount: responseWarnings.length,
      });

      return {
        status: 200,
        body: {
          ready: true,
          specialist: 'chordgan',
          backend: request.backend,
          phase: 'phase1',
          dryRun: false,
          request: {
            backend: request.backend,
            spaceId: request.spaceId,
            style: request.style,
            inputArtifactId: request.inputArtifactId || null,
            inputFormat: source.sourceFormat,
            includeMidi: request.includeMidi,
            includeMusicXml: request.includeMusicXml,
            includeContent: request.includeContent,
            persistArtifacts: request.persistArtifacts,
            validate: request.validate,
            deepValidate: request.deepValidate,
            timeoutMs: request.timeoutMs,
            applyModeHint: request.applyModeHint,
            sourceKind: source.sourceKind,
            transferApiName: DEFAULT_TRANSFER_API_NAME,
          },
          capabilities: {
            stream: true,
            dryRunOnly: false,
          },
          sourceArtifact: sourceArtifactSummary,
          generatedMidiArtifact: generatedMidiArtifact ? summarizeScoreArtifact(generatedMidiArtifact) : null,
          outputArtifact: outputArtifact ? summarizeScoreArtifact(outputArtifact) : null,
          generatedMidiArtifactId: generatedMidiArtifact?.id || null,
          outputArtifactId: outputArtifact?.id || null,
          generation: {
            backendResponse: {
              provider: request.backend,
              spaceId: request.spaceId,
              apiName: DEFAULT_TRANSFER_API_NAME,
              strategy: spaceResult.strategy,
            },
            conversions: {
              sourceToMidi: {
                inputFormat: sourceMidi.conversion.inputFormat,
                outputFormat: sourceMidi.conversion.outputFormat,
                validation: sourceMidi.conversion.validation,
              },
              outputMidi: {
                validation: outputMidiNormalized.validation,
              },
              outputMusicXml: musicXmlResult
                ? {
                    validation: musicXmlResult.validation,
                  }
                : null,
            },
          },
          warnings: responseWarnings,
          message: 'ChordGAN transfer completed.',
          midiBase64: request.includeMidi ? outputMidiNormalized.content : undefined,
          musicxml: request.includeMusicXml ? (musicXmlResult?.content || '') : undefined,
          content: request.includeContent
            ? {
                midi: request.includeMidi ? outputMidiNormalized.content : undefined,
                musicxml: request.includeMusicXml ? (musicXmlResult?.content || undefined) : undefined,
              }
            : undefined,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ChordGAN transfer failed.';
      logChordGanServiceEvent('error', 'music.chordgan.transfer.backend_result', traceContext, {
        backend: request.backend,
        spaceId: request.spaceId,
        style: request.style,
        error: message,
      });
      return errorResult(400, 'bad_request', message);
    }
  }

  return {
    status: 200,
    body: {
      ready: true,
      specialist: 'chordgan',
      backend: request.backend,
      phase: 'phase0',
      dryRun: true,
      request: {
        backend: request.backend,
        spaceId: request.spaceId,
        style: request.style,
        inputArtifactId: request.inputArtifactId || null,
        inputFormat: request.inputFormat,
        includeMidi: request.includeMidi,
        includeMusicXml: request.includeMusicXml,
        includeContent: request.includeContent,
        persistArtifacts: request.persistArtifacts,
        validate: request.validate,
        deepValidate: request.deepValidate,
        timeoutMs: request.timeoutMs,
        applyModeHint: request.applyModeHint,
        sourceKind,
        contentChars: request.content.length,
        contentBase64Chars: request.contentBase64.length,
      },
      capabilities: {
        stream: true,
        dryRunOnly: true,
        plannedBackend: {
          provider: 'huggingface-space',
          optionsApiName: DEFAULT_OPTIONS_API_NAME,
          transferApiName: DEFAULT_TRANSFER_API_NAME,
        },
      },
      generation: null,
      warnings,
      message: 'ChordGAN transfer request prepared. Set dryRun=false after Phase 1 backend inference is enabled.',
    },
  };
}

export async function runChordGanTransferStreamService(
  body: unknown,
  options?: ChordGanServiceOptions,
): Promise<ChordGanStreamResult> {
  const transfer = await runChordGanTransferService(body, options);
  if (transfer.status !== 200) {
    return {
      status: transfer.status,
      body: transfer.body,
    };
  }

  const resultBody = transfer.body;
  const backend = readTrimmedString(resultBody.backend) || 'huggingface-space';
  const style = readTrimmedString(asRecord(resultBody.request)?.style);
  const dryRun = Boolean(resultBody.dryRun);
  const statusMessage = readTrimmedString(resultBody.message)
    || (dryRun
      ? `Prepared dry-run request for style "${style || 'unknown'}".`
      : `Completed transfer for style "${style || 'unknown'}".`);
  const events: ChordGanSseEvent[] = [
    {
      event: 'ready',
      data: {
        specialist: 'chordgan',
        backend,
        phase: 'phase0',
      },
    },
    {
      event: 'status',
      data: {
        stage: dryRun ? 'dry_run' : 'completed',
        message: statusMessage,
      },
    },
    {
      event: 'result',
      data: resultBody,
    },
  ];

  logChordGanServiceEvent('info', 'music.chordgan.transfer.stream_result', options?.traceContext, {
    backend,
    style: style || null,
    eventCount: events.length,
  });

  return {
    status: 200,
    events,
  };
}
