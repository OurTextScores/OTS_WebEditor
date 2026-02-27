export type TraceContext = {
    requestId: string;
    traceparent: string;
    traceId: string;
    tracestate: string;
    baggage: string;
    clientSessionId: string;
    sessionId: string;
};

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

const toHeaders = (input?: Request | Headers | HeadersInit | null): Headers => {
    if (!input) {
        return new Headers();
    }
    if (input instanceof Headers) {
        return input;
    }
    if (typeof (input as Request).headers !== 'undefined') {
        return (input as Request).headers;
    }
    return new Headers(input as HeadersInit);
};

const randomHex = (bytes: number) => {
    const values = crypto.getRandomValues(new Uint8Array(bytes));
    return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
};

const parseTraceId = (traceparent: string) => {
    const match = traceparent.match(TRACEPARENT_PATTERN);
    return match ? match[1].toLowerCase() : '';
};

const ensureTraceparent = (value: string) => {
    const trimmed = value.trim();
    if (TRACEPARENT_PATTERN.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    return `00-${randomHex(16)}-${randomHex(8)}-01`;
};

const normalizeSessionId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !SESSION_ID_PATTERN.test(trimmed)) {
        return '';
    }
    return trimmed;
};

export const resolveTraceContext = (input?: Request | Headers | HeadersInit | null): TraceContext => {
    const headers = toHeaders(input);
    const requestId = headers.get('x-request-id')?.trim() || crypto.randomUUID();
    const traceparent = ensureTraceparent(headers.get('traceparent') || '');
    const traceId = parseTraceId(traceparent) || randomHex(16);
    const tracestate = headers.get('tracestate')?.trim() || '';
    const baggage = headers.get('baggage')?.trim() || '';
    const clientSessionId = normalizeSessionId(
        headers.get('x-client-session-id')
        || headers.get('x-session-id')
        || '',
    );
    const sessionId = normalizeSessionId(
        headers.get('x-session-id')
        || headers.get('x-client-session-id')
        || '',
    );

    return {
        requestId,
        traceparent,
        traceId,
        tracestate,
        baggage,
        clientSessionId,
        sessionId,
    };
};

export const withTraceHeaders = (trace: TraceContext, headers?: HeadersInit): Headers => {
    const next = new Headers(headers);
    next.set('x-request-id', trace.requestId);
    next.set('traceparent', trace.traceparent);
    next.set('x-trace-id', trace.traceId);
    if (trace.tracestate) {
        next.set('tracestate', trace.tracestate);
    }
    if (trace.baggage) {
        next.set('baggage', trace.baggage);
    }
    if (trace.clientSessionId) {
        next.set('x-client-session-id', trace.clientSessionId);
    }
    if (trace.sessionId) {
        next.set('x-session-id', trace.sessionId);
    }
    return next;
};

export const applyTraceHeaders = (headers: Headers, trace: TraceContext) => {
    headers.set('x-request-id', trace.requestId);
    headers.set('traceparent', trace.traceparent);
    headers.set('x-trace-id', trace.traceId);
    if (trace.tracestate) {
        headers.set('tracestate', trace.tracestate);
    }
    if (trace.clientSessionId) {
        headers.set('x-client-session-id', trace.clientSessionId);
    }
    if (trace.sessionId) {
        headers.set('x-session-id', trace.sessionId);
    }
};
