import {
  AI_EDIT_PROGRESS_VERSION,
  reportAiEditProgress,
  type AiEditProgressOperation,
  type AiEditProgressReporter,
  type AiEditProgressResultEvent,
} from './ai-edit-progress';

type StreamServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

const encoder = new TextEncoder();

const encodeEvent = (event: 'progress' | 'result', payload: unknown) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

export const wantsAiEditProgressStream = (request: Request) =>
  (request.headers.get('accept') || '')
    .split(',')
    .some((value) => value.trim().toLowerCase().startsWith('text/event-stream'));

export const createAiEditProgressStreamResponse = (args: {
  operation: AiEditProgressOperation;
  startedAt: number;
  parentSignal?: AbortSignal;
  run: (reporter: AiEditProgressReporter, signal: AbortSignal) => Promise<StreamServiceResult>;
  onSettled?: (result: StreamServiceResult) => void;
}) => {
  const requestController = new AbortController();
  const abortFromParent = () => requestController.abort(args.parentSignal?.reason);
  if (args.parentSignal?.aborted) {
    abortFromParent();
  } else {
    args.parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  let streamClosed = false;
  let sequence = 0;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const closeStream = () => {
    if (streamClosed) {
      return;
    }
    streamClosed = true;
    if (keepalive) {
      clearInterval(keepalive);
      keepalive = null;
    }
    args.parentSignal?.removeEventListener('abort', abortFromParent);
    try {
      controllerRef?.close();
    } catch {
      // The client may already have cancelled the stream.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const enqueue = (event: 'progress' | 'result', payload: unknown) => {
        if (streamClosed) {
          return;
        }
        try {
          controller.enqueue(encodeEvent(event, payload));
        } catch {
          requestController.abort(new DOMException('Progress stream closed.', 'AbortError'));
          closeStream();
        }
      };
      const reporter: AiEditProgressReporter = (update) => {
        reportAiEditProgress((safeUpdate) => {
          sequence += 1;
          enqueue('progress', {
            version: AI_EDIT_PROGRESS_VERSION,
            type: 'progress',
            operation: args.operation,
            sequence,
            elapsedMs: Math.max(0, Date.now() - args.startedAt),
            ...safeUpdate,
          });
        }, update);
      };

      reporter({ phase: 'request.accepted', message: 'Request accepted' });
      keepalive = setInterval(() => {
        if (!streamClosed) {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            requestController.abort(new DOMException('Progress stream closed.', 'AbortError'));
            closeStream();
          }
        }
      }, 15_000);

      void args
        .run(reporter, requestController.signal)
        .catch((): StreamServiceResult => ({
          status: 500,
          body: { error: 'AI edit stream failed unexpectedly.' },
        }))
        .then((result) => {
          if (!streamClosed) {
            sequence += 1;
            const terminal: AiEditProgressResultEvent = {
              version: AI_EDIT_PROGRESS_VERSION,
              type: 'result',
              operation: args.operation,
              sequence,
              elapsedMs: Math.max(0, Date.now() - args.startedAt),
              status: result.status,
              body: result.body,
            };
            enqueue('result', terminal);
          }
          try {
            args.onSettled?.(result);
          } catch {
            // Summary logging is observational and must not strand the stream.
          }
          closeStream();
        });
    },
    cancel(reason) {
      if (!requestController.signal.aborted) {
        requestController.abort(
          reason ?? new DOMException('Progress stream cancelled.', 'AbortError'),
        );
      }
      closeStream();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
};
