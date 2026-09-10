import {
  AI_EDIT_PROGRESS_PHASES,
  AI_EDIT_PROGRESS_VERSION,
  type AiEditProgressEvent,
  type AiEditProgressReporter,
} from './ai-edit-progress';

export type AiEditServiceResponse = {
  status: number;
  body: unknown;
};

const MAX_PROGRESS_BUFFER_CHARS = 80 * 1024 * 1024;
const AI_EDIT_PROGRESS_PHASE_SET = new Set<string>(AI_EDIT_PROGRESS_PHASES);

const parseEventBlock = (block: string) => {
  let eventName = '';
  const dataLines: string[] = [];
  block.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });
  if (!eventName || !dataLines.length) {
    return null;
  }
  try {
    return { eventName, payload: JSON.parse(dataLines.join('\n')) as unknown };
  } catch {
    throw new Error('AI edit progress stream returned invalid JSON.');
  }
};

export const readAiEditServiceResponse = async (
  response: Response,
  onProgress?: AiEditProgressReporter,
): Promise<AiEditServiceResponse> => {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/event-stream')) {
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  }
  if (!response.body) {
    throw new Error('AI edit progress stream returned no body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal: AiEditServiceResponse | null = null;

  const consumeBlock = (block: string) => {
    const parsed = parseEventBlock(block);
    if (!parsed || !parsed.payload || typeof parsed.payload !== 'object') {
      return;
    }
    const payload = parsed.payload as Record<string, unknown>;
    if (payload.version !== AI_EDIT_PROGRESS_VERSION) {
      throw new Error('AI edit progress stream version is unsupported.');
    }
    if (
      parsed.eventName === 'progress' &&
      payload.type === 'progress' &&
      typeof payload.message === 'string' &&
      AI_EDIT_PROGRESS_PHASE_SET.has(String(payload.phase))
    ) {
      onProgress?.(payload as AiEditProgressEvent);
      return;
    }
    if (parsed.eventName === 'result' && payload.type === 'result') {
      terminal = {
        status: typeof payload.status === 'number' ? payload.status : 500,
        body: payload.body ?? {},
      };
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    if (buffer.length > MAX_PROGRESS_BUFFER_CHARS) {
      throw new Error('AI edit progress stream exceeded its client buffer limit.');
    }
    let boundary = buffer.search(/\r?\n\r?\n/);
    while (boundary >= 0) {
      const match = buffer.slice(boundary).match(/^(?:\r?\n){2}/)?.[0] ?? '\n\n';
      consumeBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + match.length);
      boundary = buffer.search(/\r?\n\r?\n/);
    }
    if (done) {
      if (buffer.trim()) {
        consumeBlock(buffer);
      }
      break;
    }
  }

  if (!terminal) {
    throw new Error('AI edit progress stream ended without a result.');
  }
  return terminal;
};
