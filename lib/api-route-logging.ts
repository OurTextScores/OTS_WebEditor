import { type TraceContext } from './trace-http';

type ApiRouteSummaryInput = {
  event: string;
  route: string;
  method: string;
  status: number;
  startedAt: number;
  trace: TraceContext;
  extra?: Record<string, unknown>;
};

export const logApiRouteSummary = (input: ApiRouteSummaryInput) => {
  console.info(JSON.stringify({
    event: input.event,
    route: input.route,
    method: input.method,
    status: input.status,
    durationMs: Date.now() - input.startedAt,
    requestId: input.trace.requestId,
    traceId: input.trace.traceId,
    sessionId: input.trace.sessionId || null,
    clientSessionId: input.trace.clientSessionId || null,
    ...(input.extra || {}),
  }));
};
