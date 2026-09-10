import { NextResponse } from 'next/server';
import { applyTraceHeaders, type TraceContext } from './trace-http';

type GuardOptions = {
  request: Request;
  trace?: TraceContext;
  route: string;
  allowUnauthenticatedEnvVar?: string;
  limit?: number;
  windowMs?: number;
};

type GuardSuccess = {
  ok: true;
};

type GuardFailure = {
  ok: false;
  response: NextResponse;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_RATE_LIMIT_KEYS = 10_000;
const rateLimits = new Map<string, RateLimitEntry>();

const truthy = (value: string | undefined) => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const getConfiguredToken = () =>
  (
    process.env.OTS_API_AUTH_TOKEN ||
    process.env.MUSIC_API_AUTH_TOKEN ||
    process.env.API_AUTH_TOKEN ||
    ''
  ).trim();

const readBearerToken = (authorization: string) => {
  const trimmed = authorization.trim();
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed.slice(7).trim() : '';
};

const getPresentedToken = (request: Request) =>
  request.headers.get('x-ots-api-token')?.trim() ||
  request.headers.get('x-music-api-token')?.trim() ||
  readBearerToken(request.headers.get('authorization') || '');

export const isConfiguredAppApiToken = (token: string) => {
  const configuredToken = getConfiguredToken();
  return Boolean(configuredToken && token && token === configuredToken);
};

const getClientId = (request: Request) => {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const firstForwardedIp = forwardedFor.split(',')[0]?.trim();
  return (
    firstForwardedIp ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
};

const json = (body: unknown, init: ResponseInit, trace?: TraceContext) => {
  const response = NextResponse.json(body, init);
  if (trace) {
    applyTraceHeaders(response.headers, trace);
  }
  return response;
};

const pruneRateLimits = (now: number) => {
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt <= now) {
      rateLimits.delete(key);
    }
  }
  while (rateLimits.size > MAX_RATE_LIMIT_KEYS) {
    const oldestKey = rateLimits.keys().next().value;
    if (!oldestKey) {
      break;
    }
    rateLimits.delete(oldestKey);
  }
};

export const allowServerCredentialFallback = () => truthy(process.env.ALLOW_SERVER_LLM_KEYS);

export function requireServerCredentialAccess(
  options: Omit<GuardOptions, 'allowUnauthenticatedEnvVar'>,
): GuardSuccess | GuardFailure {
  if (!allowServerCredentialFallback()) {
    return {
      ok: false,
      response: json(
        {
          error: 'Server-side AI credentials are disabled for this route.',
          code: 'server_credentials_disabled',
        },
        { status: 403 },
        options.trace,
      ),
    };
  }
  return requireSensitiveApiAccess(options);
}

export function requireSensitiveApiAccess(options: GuardOptions): GuardSuccess | GuardFailure {
  const {
    request,
    trace,
    route,
    allowUnauthenticatedEnvVar,
    limit = DEFAULT_RATE_LIMIT,
    windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
  } = options;

  const allowUnauthenticated = allowUnauthenticatedEnvVar
    ? truthy(process.env[allowUnauthenticatedEnvVar])
    : false;
  const configuredToken = getConfiguredToken();
  const presentedToken = getPresentedToken(request);

  if (!allowUnauthenticated) {
    if (!configuredToken) {
      return {
        ok: false,
        response: json(
          {
            error: 'This API route is disabled until an app API token is configured.',
            code: 'api_auth_not_configured',
          },
          { status: 403 },
          trace,
        ),
      };
    }
    if (!presentedToken || presentedToken !== configuredToken) {
      return {
        ok: false,
        response: json(
          {
            error: 'Missing or invalid app API token.',
            code: 'api_auth_required',
          },
          { status: 401 },
          trace,
        ),
      };
    }
  }

  const now = Date.now();
  if (rateLimits.size > MAX_RATE_LIMIT_KEYS || rateLimits.size % 100 === 0) {
    pruneRateLimits(now);
  }
  const clientId = getClientId(request);
  const key = `${route}:${clientId}`;
  const current = rateLimits.get(key);
  const entry = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  entry.count += 1;
  rateLimits.set(key, entry);

  if (entry.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      ok: false,
      response: json(
        {
          error: 'Rate limit exceeded.',
          code: 'rate_limited',
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        },
        trace,
      ),
    };
  }

  return { ok: true };
}
