import { describe, expect, it } from 'vitest';
import { applyTraceHeaders, resolveTraceContext, withTraceHeaders } from '../lib/trace-http';

describe('trace-http session propagation', () => {
  it('normalizes session identifiers from request headers', () => {
    const trace = resolveTraceContext(new Headers({
      'x-request-id': 'req-123',
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      'x-client-session-id': 'session-abc12345',
    }));

    expect(trace).toMatchObject({
      requestId: 'req-123',
      traceId: '0123456789abcdef0123456789abcdef',
      clientSessionId: 'session-abc12345',
      sessionId: 'session-abc12345',
    });
  });

  it('writes trace and session headers to outbound headers', () => {
    const trace = resolveTraceContext(new Headers({
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
      'x-session-id': 'session-xyz98765',
    }));

    const outbound = withTraceHeaders(trace, { 'content-type': 'application/json' });
    expect(outbound.get('x-session-id')).toBe('session-xyz98765');
    expect(outbound.get('x-client-session-id')).toBe('session-xyz98765');
    expect(outbound.get('x-trace-id')).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    const responseHeaders = new Headers();
    applyTraceHeaders(responseHeaders, trace);
    expect(responseHeaders.get('x-session-id')).toBe('session-xyz98765');
    expect(responseHeaders.get('x-client-session-id')).toBe('session-xyz98765');
  });
});
