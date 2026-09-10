import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com']);

// Bounds for the upstream fetch (all env-overridable). These cap the SSRF/DoS surface:
// unvalidated redirects, unbounded response buffering, and slow-loris upstreams.
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_TIMEOUT_MS = 30_000; // whole-operation budget (connect + redirects + body)
const DEFAULT_MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Content types we are willing to hand back. Anything else (notably text/html — an SSRF
// exfil / phishing vector, or a Drive interstitial) is rejected. Compared by prefix against
// the type with parameters stripped.
const ALLOWED_CONTENT_TYPE_PREFIXES = [
  'application/octet-stream',
  'application/xml',
  'text/xml',
  'application/vnd.recordare.musicxml', // covers +xml and the zipped variant
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/vnd.musescore',
  'text/plain',
];

function readNonNegativeEnvInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const getMaxBytes = () => readNonNegativeEnvInt('MUSIC_FETCH_SCORE_MAX_BYTES', DEFAULT_MAX_BYTES);
const getTimeoutMs = () =>
  readNonNegativeEnvInt('MUSIC_FETCH_SCORE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
const getMaxRedirects = () =>
  readNonNegativeEnvInt('MUSIC_FETCH_SCORE_MAX_REDIRECTS', DEFAULT_MAX_REDIRECTS);

function isAllowedUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function normalizeContentType(raw: string | null): string {
  return (raw ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

function isAllowedContentType(normalized: string): boolean {
  return ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');

  if (!target || !isAllowedUrl(target)) {
    return NextResponse.json({ error: 'Invalid or disallowed URL' }, { status: 400 });
  }

  const maxBytes = getMaxBytes();
  const controller = new AbortController();
  const timeoutMs = getTimeoutMs();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    // Follow redirects MANUALLY, re-validating every hop against the allowlist so a
    // redirect chain from an allowed host cannot be bounced to an internal/metadata
    // address (SSRF).
    let currentUrl = target;
    let upstream: Response;
    const maxRedirects = getMaxRedirects();

    for (let hop = 0; ; hop += 1) {
      if (!isAllowedUrl(currentUrl)) {
        return NextResponse.json(
          { error: 'Redirect to a disallowed URL was blocked' },
          { status: 400 },
        );
      }

      upstream = await fetch(currentUrl, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });

      if (!REDIRECT_STATUSES.has(upstream.status)) {
        break;
      }

      if (hop >= maxRedirects) {
        return NextResponse.json({ error: 'Too many redirects' }, { status: 502 });
      }

      const location = upstream.headers.get('location');
      if (!location) {
        return NextResponse.json({ error: 'Redirect without a Location header' }, { status: 502 });
      }
      // Resolve relative redirects and drain the redirect response body.
      currentUrl = new URL(location, currentUrl).toString();
      await upstream.body?.cancel().catch(() => undefined);
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const normalizedType = normalizeContentType(upstream.headers.get('content-type'));
    if (!isAllowedContentType(normalizedType)) {
      await upstream.body?.cancel().catch(() => undefined);
      return NextResponse.json(
        { error: `Unsupported upstream content-type: ${normalizedType}` },
        { status: 415 },
      );
    }

    // Fast reject on an advertised oversized body (best-effort; header may lie or be absent).
    const contentLength = Number(upstream.headers.get('content-length'));
    if (maxBytes > 0 && Number.isFinite(contentLength) && contentLength > maxBytes) {
      await upstream.body?.cancel().catch(() => undefined);
      return NextResponse.json({ error: 'Upstream response too large' }, { status: 413 });
    }

    if (!upstream.body) {
      return new Response(null, {
        status: 200,
        headers: { 'Content-Type': normalizedType, 'X-Content-Type-Options': 'nosniff' },
      });
    }

    // Stream and count bytes so a body with no/false content-length cannot exhaust memory.
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (maxBytes > 0 && total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        controller.abort();
        return NextResponse.json({ error: 'Upstream response too large' }, { status: 413 });
      }
      chunks.push(value);
    }

    const body = Buffer.concat(chunks, total);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': normalizedType,
        'Content-Length': String(total),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream fetch timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch upstream URL' }, { status: 502 });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
