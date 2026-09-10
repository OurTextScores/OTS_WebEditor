import { describe, expect, it } from 'vitest';
import { applyTraceHeaders, resolveTraceContext, withTraceHeaders } from '../lib/trace-http';

describe('trace-http session propagation', () => {
  it('normalizes session identifiers from request headers', () => {
    const trace = resolveTraceContext(
      new Headers({
        'x-request-id': 'req-123',
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        'x-client-session-id': 'session-abc12345',
      }),
    );

    expect(trace).toMatchObject({
      requestId: 'req-123',
      traceId: '0123456789abcdef0123456789abcdef',
      clientSessionId: 'session-abc12345',
      sessionId: 'session-abc12345',
    });
  });

  it('writes trace and session headers to outbound headers', () => {
    const trace = resolveTraceContext(
      new Headers({
        traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
        'x-session-id': 'session-xyz98765',
      }),
    );

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

describe('inbound correlation values (L6)', () => {
  const contextFor = (headers: Record<string, string>) => resolveTraceContext(new Headers(headers));

  it('keeps a well-formed request id', () => {
    expect(contextFor({ 'x-request-id': 'req-01HZX.9:abc_' }).requestId).toBe('req-01HZX.9:abc_');
  });

  it('replaces a request id carrying anything a log line should not contain', () => {
    // Only values that can actually arrive. The platform already blocks the worst
    // ones -- `Headers` rejects NUL, CR, LF and anything above U+00FF -- so what
    // reaches this code is escape sequences, whitespace and high Latin-1. That is
    // what is left to validate, and it is enough to derail a log line.
    for (const hostile of ['\u001b[31mred', 'has space', 'tab\there', 'semi;colon', 'caf\u00e9']) {
      const { requestId } = contextFor({ 'x-request-id': hostile });
      expect(requestId, hostile).not.toBe(hostile);
      // Still correlatable: a generated UUID, not an empty string.
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('replaces an unbounded request id', () => {
    const { requestId } = contextFor({ 'x-request-id': 'a'.repeat(129) });

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps tracestate and baggage that are within spec', () => {
    const context = contextFor({
      tracestate: 'vendor=t61rcWkgMzE,other=abc',
      baggage: 'userId=42,tier=free',
    });

    expect(context.tracestate).toBe('vendor=t61rcWkgMzE,other=abc');
    expect(context.baggage).toBe('userId=42,tier=free');
  });

  it('drops tracestate and baggage past their spec caps', () => {
    const context = contextFor({
      tracestate: `v=${'x'.repeat(512)}`,
      baggage: `k=${'y'.repeat(8192)}`,
    });

    expect(context.tracestate).toBe('');
    expect(context.baggage).toBe('');
  });

  it('drops tracestate and baggage carrying control characters', () => {
    const context = contextFor({
      tracestate: 'vendor=ok\u0007bell',
      baggage: 'k=v\u001b[0m',
    });

    expect(context.tracestate).toBe('');
    expect(context.baggage).toBe('');
  });

  it('never forwards a rejected value upstream', () => {
    // The point of the finding: these are echoed to third-party APIs, so rejecting
    // them at parse time has to mean they cannot reappear on the way out.
    const context = contextFor({
      'x-request-id': '\u001b[31mred',
      tracestate: 'vendor=ok\u0007bell',
      baggage: `k=${'y'.repeat(8192)}`,
    });
    const outbound = withTraceHeaders(context);

    expect(outbound.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(outbound.get('tracestate')).toBeNull();
    expect(outbound.get('baggage')).toBeNull();
  });
});
