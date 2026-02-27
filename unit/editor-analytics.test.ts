import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    extractTraceContextFromHeaders,
    getOrCreateEditorSessionId,
    trackEditorAnalyticsEvent,
} from '../lib/editor-analytics';

describe('editor analytics helper', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        process.env.NODE_ENV = 'development';
        sessionStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('extracts request/trace ids from response headers', () => {
        const headers = new Headers({
            'x-request-id': 'req_123',
            'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        });
        expect(extractTraceContextFromHeaders(headers)).toEqual({
            requestId: 'req_123',
            traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        });
    });

    it('creates and reuses a stable editor session id in session storage', () => {
        const first = getOrCreateEditorSessionId();
        const second = getOrCreateEditorSessionId();
        expect(first).toBeTruthy();
        expect(second).toBe(first);
    });

    it('sends sanitized payload to analytics endpoint', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 201,
        } as Response);

        trackEditorAnalyticsEvent('score_editor_runtime_loaded', {
            editor_surface: 'embedded',
            model: '   gpt-5.2   ',
            empty_value: '   ',
        });

        await Promise.resolve();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [, requestInit] = fetchSpy.mock.calls[0] as [RequestInfo, RequestInit];
        const payload = JSON.parse(String(requestInit.body || '{}'));
        expect(payload.eventName).toBe('score_editor_runtime_loaded');
        expect(payload.properties).toMatchObject({
            editor_surface: 'embedded',
            model: 'gpt-5.2',
        });
        expect(payload.properties.empty_value).toBeUndefined();
    });
});
