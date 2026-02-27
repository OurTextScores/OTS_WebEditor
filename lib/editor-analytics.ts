type AnalyticsScalar = string | number | boolean | null | undefined;
type AnalyticsProperties = Record<string, AnalyticsScalar>;

type TrackOptions = {
    beacon?: boolean;
};

type TraceContext = {
    requestId?: string;
    traceId?: string;
};

const ANALYTICS_ENDPOINT = (process.env.NEXT_PUBLIC_ANALYTICS_EVENTS_PATH || '/api/analytics/events').trim();
const SESSION_STORAGE_KEY = 'ots_editor_session_id';
const MAX_STRING_LENGTH = 160;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i;

const shouldSkipTracking = () => (
    typeof window === 'undefined'
    || process.env.NODE_ENV === 'test'
    || Boolean((globalThis as Record<string, unknown>)?.JEST_WORKER_ID)
);

const sanitizeValue = (value: AnalyticsScalar): AnalyticsScalar => {
    if (typeof value !== 'string') {
        return value;
    }
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
        return undefined;
    }
    if (trimmed.length <= MAX_STRING_LENGTH) {
        return trimmed;
    }
    return `${trimmed.slice(0, MAX_STRING_LENGTH - 1)}…`;
};

const sanitizeProperties = (properties?: AnalyticsProperties): AnalyticsProperties | undefined => {
    if (!properties) {
        return undefined;
    }
    const next: AnalyticsProperties = {};
    for (const [key, value] of Object.entries(properties)) {
        const sanitized = sanitizeValue(value);
        if (sanitized !== undefined) {
            next[key] = sanitized;
        }
    }
    return Object.keys(next).length > 0 ? next : undefined;
};

const buildPayload = (eventName: string, properties?: AnalyticsProperties) => {
    const payload: Record<string, unknown> = { eventName };
    const safeProps = sanitizeProperties(properties);
    if (safeProps && Object.keys(safeProps).length > 0) {
        payload.properties = safeProps;
    }
    return JSON.stringify(payload);
};

const ensureSessionId = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    try {
        const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (existing?.trim()) {
            return existing.trim();
        }
        const nextId = window.crypto?.randomUUID?.() || `sess_${Date.now().toString(36)}`;
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextId);
        return nextId;
    } catch {
        return window.crypto?.randomUUID?.() || `sess_${Date.now().toString(36)}`;
    }
};

export const getOrCreateEditorSessionId = () => ensureSessionId();

export const extractTraceContextFromHeaders = (headers: Headers | null | undefined): TraceContext => {
    if (!headers) {
        return {};
    }
    const requestId = headers.get('x-request-id')?.trim() || undefined;
    const directTraceId = headers.get('x-trace-id')?.trim() || undefined;
    if (directTraceId) {
        return { requestId, traceId: directTraceId };
    }
    const traceparent = headers.get('traceparent')?.trim() || '';
    const match = traceparent.match(TRACEPARENT_PATTERN);
    const traceId = match?.[1] || undefined;
    return { requestId, traceId };
};

export const trackEditorAnalyticsEvent = (eventName: string, properties?: AnalyticsProperties, options?: TrackOptions) => {
    if (shouldSkipTracking() || !ANALYTICS_ENDPOINT) {
        return;
    }

    const body = buildPayload(eventName, properties);
    if (options?.beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        const sent = navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
        if (sent) {
            return;
        }
    }

    void fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        cache: 'no-store',
        credentials: 'same-origin',
    }).catch(() => {
        // Non-blocking: telemetry should never break editor flows.
    });
};
