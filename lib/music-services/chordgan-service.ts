import { type TraceContext } from '../trace-http';
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
  persistArtifacts: boolean;
  validate: boolean;
  deepValidate: boolean;
  timeoutMs: number;
  dryRun: boolean;
  applyModeHint: 'replace' | 'append' | null;
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
    persistArtifacts: readBoolean(data?.persistArtifacts, data?.persist_artifacts, true),
    validate: readBoolean(data?.validate, undefined, true),
    deepValidate: readBoolean(data?.deepValidate, data?.deep_validate, false),
    timeoutMs,
    dryRun: readBoolean(data?.dryRun, data?.dry_run, true),
    applyModeHint,
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
  const styles = DEFAULT_CHORDGAN_STYLES.length > 0 ? DEFAULT_CHORDGAN_STYLES : ['classical'];

  logChordGanServiceEvent('info', 'music.chordgan.options.result', traceContext, {
    backend,
    spaceId,
    styleCount: styles.length,
    dryRunOnly: true,
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
        dryRunOnly: true,
      },
      message: 'ChordGAN options are static in Phase 0. Dynamic Space discovery is planned for Phase 1.',
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
  if (!request.dryRun) {
    return errorResult(
      501,
      'not_implemented',
      'ChordGAN inference is not enabled yet. Phase 0 supports dryRun mode only.',
      {
        phase: 'phase0',
      },
    );
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
        stage: 'dry_run',
        message: `Prepared dry-run request for style "${style || 'unknown'}".`,
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

