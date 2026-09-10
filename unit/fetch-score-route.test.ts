import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../app/api/fetch-score/route';

const ENV_KEYS = [
  'MUSIC_FETCH_SCORE_MAX_BYTES',
  'MUSIC_FETCH_SCORE_TIMEOUT_MS',
  'MUSIC_FETCH_SCORE_MAX_REDIRECTS',
] as const;

const ALLOWED = 'https://drive.usercontent.google.com/download?id=abc';

const makeRequest = (target: string | null) =>
  new Request(
    target === null
      ? 'http://localhost/api/fetch-score'
      : `http://localhost/api/fetch-score?url=${encodeURIComponent(target)}`,
  );

const redirectTo = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

const okBody = (bytes: Uint8Array, contentType = 'application/xml') =>
  new Response(new Uint8Array(bytes).buffer, {
    status: 200,
    headers: { 'content-type': contentType },
  });

describe('fetch-score route — SSRF & size hardening (M1)', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('rejects a missing url without fetching', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a disallowed host without fetching', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const res = await GET(makeRequest('https://evil.example.com/x'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-https allowed host', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const res = await GET(makeRequest('http://drive.google.com/x'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies an allowed download and sets nosniff', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okBody(new Uint8Array([1, 2, 3])));
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('blocks a redirect to a disallowed host and never fetches it (SSRF)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest/meta-data/'));
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(400);
    // First hop fetched the allowed URL; the metadata address is re-validated and blocked
    // BEFORE any second fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ALLOWED);
  });

  it('follows an allowed redirect chain', async () => {
    const second = 'https://drive.google.com/uc?export=download&id=abc';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo(second))
      .mockResolvedValueOnce(okBody(new Uint8Array([9])));
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(second);
  });

  it('caps the redirect count', async () => {
    process.env.MUSIC_FETCH_SCORE_MAX_REDIRECTS = '1';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirectTo(ALLOWED)); // always redirects (to an allowed host)
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2); // hop 0 and hop 1, then give up
  });

  it('rejects a disallowed content-type (text/html)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okBody(new Uint8Array([1]), 'text/html; charset=utf-8'),
    );
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(415);
  });

  it('fast-rejects an oversized advertised content-length', async () => {
    process.env.MUSIC_FETCH_SCORE_MAX_BYTES = '10';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(5), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'content-length': '999' },
      }),
    );
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(413);
  });

  it('rejects an oversized streamed body with no content-length', async () => {
    process.env.MUSIC_FETCH_SCORE_MAX_BYTES = '100';
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(200));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream, { status: 200 }));
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(413);
  });

  it('maps an upstream timeout/abort to 504', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(504);
  });

  it('maps a generic upstream failure to 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('econnrefused'));
    const res = await GET(makeRequest(ALLOWED));
    expect(res.status).toBe(502);
  });
});
