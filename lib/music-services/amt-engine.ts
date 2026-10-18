/**
 * Anticipatory Music Transformer engine: calls the HARP Gradio Space's `/process` endpoint
 * (accompany a melody) over Gradio's plain REST queue API and returns the output MIDI.
 *
 * Not `@gradio/client`: its `handle_file` uploads without the original filename, and the
 * Space's file input rejects anything not named `.mid`/`.midi`. The REST flow is:
 *
 *   POST {host}/gradio_api/upload            multipart files=<in.mid>       -> ["<server path>"]
 *   POST {host}/gradio_api/call/process      { data: [FileData, model, melody, history] } -> { event_id }
 *   GET  {host}/gradio_api/call/process/{id} SSE: `event: complete` data [FileData] | `event: error`
 *   GET  FileData.url                        -> output .mid
 *
 * See docs/private/music-ai-specialists/amt-infilling-hf-space-runbook.md.
 */

import { type TraceContext, withTraceHeaders } from '../trace-http';

export const AMT_MODELS = {
  'small-800k': 'stanford-crfm/music-small-800k',
  'medium-800k': 'stanford-crfm/music-medium-800k',
  'large-800k': 'stanford-crfm/music-large-800k',
} as const;
export type AmtModelKey = keyof typeof AMT_MODELS;

/** A request the Space refused because of its input (wrong melody instrument, no free channel...). */
export class AmtInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmtInputError';
  }
}

/** The Space could not serve the request: auth, quota, timeout, outage. */
export class AmtSpaceError extends Error {
  status: number;
  /** The Space refused access (401/403/404): a private Space without a token that can read it. */
  accessDenied: boolean;
  constructor(
    message: string,
    status: number,
    options?: { cause?: unknown; accessDenied?: boolean },
  ) {
    super(message, options);
    this.name = 'AmtSpaceError';
    this.status = status;
    this.accessDenied = options?.accessDenied ?? false;
  }
}

export type AmtAccompanyRequest = {
  midiBytes: Uint8Array;
  model: AmtModelKey;
  melodyInstrument: string;
  historySeconds: number;
  spaceId: string;
  spaceUrl?: string;
  hfToken?: string;
  timeoutMs: number;
  traceContext?: TraceContext;
};

export type AmtAccompanyResult = {
  midiBytes: Uint8Array;
  endpoint: string;
  durationMs: number;
};

/** The Space's host, following Hugging Face's subdomain rule (lowercase, `/` `_` `.` -> `-`). */
export function spaceHostFromId(spaceId: string): string {
  return `https://${spaceId.trim().toLowerCase().replace(/[/_.]/g, '-')}.hf.space`;
}

// gr.Error messages the Space raises for its input, as opposed to failures of the Space itself.
const INPUT_ERROR_PATTERNS = [/no part plays/i, /every midi channel/i, /invalid file type/i];
const QUOTA_ERROR_PATTERN = /quota|zerogpu|gpu task aborted|exceeded/i;

const safeMessage = (value: unknown): string => {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
};

/** The last `complete` or `error` event in a Gradio SSE body. */
export function parseGradioSse(
  body: string,
): { event: 'complete' | 'error'; data: unknown } | null {
  let found: { event: 'complete' | 'error'; data: unknown } | null = null;
  for (const block of body.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const event = lines
      .find((l) => l.startsWith('event:'))
      ?.slice(6)
      .trim();
    if (event !== 'complete' && event !== 'error') continue;
    const raw = lines
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n');
    let data: unknown = raw;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      // Leave non-JSON data as text.
    }
    found = { event, data };
  }
  return found;
}

function errorText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['error', 'message', 'title']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string;
    }
  }
  return '';
}

/** Accompany the melody in `midiBytes` on the AMT Space; returns the Space's output MIDI. */
export async function runAmtAccompany(request: AmtAccompanyRequest): Promise<AmtAccompanyResult> {
  const host = (request.spaceUrl || spaceHostFromId(request.spaceId)).replace(/\/+$/, '');
  const endpoint = `${host}/gradio_api/call/process`;
  const startedAt = Date.now();
  const headers: Record<string, string> = {
    ...(request.traceContext
      ? Object.fromEntries(withTraceHeaders(request.traceContext).entries())
      : {}),
    ...(request.hfToken ? { Authorization: `Bearer ${request.hfToken}` } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  const call = async (url: string, init: RequestInit, step: string): Promise<Response> => {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      throw new AmtSpaceError(
        aborted
          ? `AMT Space timed out after ${request.timeoutMs}ms (${step}, ${host}).`
          : `AMT Space connection failed (${step}, ${host}): ${safeMessage(err) || 'unknown error'}`,
        aborted ? 504 : 503,
        { cause: err },
      );
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).trim();
      // Hugging Face's own error pages are HTML; they say nothing the status doesn't.
      const detail = body.startsWith('<') ? '' : body.slice(0, 300);
      // A private Space answers 404 (or 401/403) to a missing or wrong token.
      const accessDenied = res.status === 401 || res.status === 403 || res.status === 404;
      const hint = !accessDenied
        ? ''
        : request.hfToken
          ? ' Check MUSIC_AMT_SPACE_ID and that MUSIC_AMT_SPACE_TOKEN can read the Space.'
          : ' No Hugging Face token was sent, and a private Space needs one.';
      throw new AmtSpaceError(
        `AMT Space ${step} failed with HTTP ${res.status} (${host}).${hint}${detail ? ` ${detail}` : ''}`,
        res.status === 429 ? 429 : 503,
        { accessDenied },
      );
    }
    return res;
  };

  try {
    const form = new FormData();
    form.append(
      'files',
      new Blob([request.midiBytes as Uint8Array<ArrayBuffer>], { type: 'audio/midi' }),
      'input.mid',
    );
    const uploaded = (await (
      await call(`${host}/gradio_api/upload`, { method: 'POST', body: form }, 'upload')
    ).json()) as unknown;
    const serverPath = Array.isArray(uploaded) ? uploaded[0] : null;
    if (typeof serverPath !== 'string' || !serverPath) {
      throw new AmtSpaceError(`AMT Space upload returned no file path (${host}).`, 503);
    }

    const queued = (await (
      await call(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [
              { path: serverPath, orig_name: 'input.mid', meta: { _type: 'gradio.FileData' } },
              AMT_MODELS[request.model],
              request.melodyInstrument,
              request.historySeconds,
            ],
          }),
        },
        'queue',
      )
    ).json()) as { event_id?: unknown };
    if (typeof queued?.event_id !== 'string') {
      throw new AmtSpaceError(`AMT Space did not queue the request (${host}).`, 503);
    }

    const stream = await (
      await call(`${endpoint}/${queued.event_id}`, { method: 'GET' }, 'result')
    ).text();
    const outcome = parseGradioSse(stream);
    if (!outcome) {
      throw new AmtSpaceError(
        `AMT Space ended the result stream without an answer (${host}).`,
        503,
      );
    }
    if (outcome.event === 'error') {
      const message = errorText(outcome.data) || 'The Space reported an error without a message.';
      if (INPUT_ERROR_PATTERNS.some((p) => p.test(message))) throw new AmtInputError(message);
      throw new AmtSpaceError(
        `AMT Space generation failed: ${message}`,
        QUOTA_ERROR_PATTERN.test(message) ? 429 : 502,
      );
    }

    const file = Array.isArray(outcome.data) ? outcome.data[0] : null;
    const url = file && typeof file === 'object' ? (file as { url?: unknown }).url : null;
    if (typeof url !== 'string' || !url) {
      throw new AmtSpaceError(`AMT Space returned no output file (${host}).`, 502);
    }
    const midiBytes = new Uint8Array(
      await (await call(url, { method: 'GET' }, 'download')).arrayBuffer(),
    );
    return { midiBytes, endpoint, durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}
