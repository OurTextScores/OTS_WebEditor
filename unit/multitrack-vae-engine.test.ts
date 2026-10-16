// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMultitrackVaeGenerate } from '../lib/music-services/multitrack-vae-engine';
import { resolveTraceContext } from '../lib/trace-http';

describe('runMultitrackVaeGenerate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the trace headers and the JSON content type to the service', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({ midi_base64: 'TVRoZA==', metadata: { num_measures: 4 } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const trace = resolveTraceContext(
      new Request('http://localhost/api', { headers: { 'x-request-id': 'req-123' } }),
    );

    await runMultitrackVaeGenerate({
      mode: 'sample',
      model: 'chords',
      serviceUrl: 'http://vae.test',
      traceContext: trace,
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-request-id')).toBe('req-123');
    expect(headers.get('traceparent')).toBe(trace.traceparent);
    expect(headers.get('x-trace-id')).toBe(trace.traceId);
  });

  it('sends the JSON content type without a trace context', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({ midi_base64: 'TVRoZA==', metadata: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await runMultitrackVaeGenerate({
      mode: 'sample',
      model: 'chords',
      serviceUrl: 'http://vae.test',
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('traceparent')).toBeNull();
  });
});
