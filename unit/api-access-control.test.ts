import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  allowServerCredentialFallback,
  isConfiguredAppApiToken,
  requireSensitiveApiAccess,
  requireServerCredentialAccess,
} from '../lib/api-access-control';

const ENV_KEYS = [
  'OTS_API_AUTH_TOKEN',
  'MUSIC_API_AUTH_TOKEN',
  'API_AUTH_TOKEN',
  'ALLOW_SERVER_LLM_KEYS',
  'ALLOW_UNAUTHENTICATED_LLM_PROXY',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const priorEnv: Partial<Record<EnvKey, string | undefined>> = {};

// Each test uses a unique client IP so the module-global rate-limit map never
// bleeds counts between cases.
let clientCounter = 0;
const uniqueClientId = () => `10.0.0.${(clientCounter += 1)}`;

const makeRequest = (headers: Record<string, string> = {}, clientId = uniqueClientId()) =>
  new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'x-forwarded-for': clientId, ...headers },
  });

beforeEach(() => {
  for (const key of ENV_KEYS) {
    priorEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (priorEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = priorEnv[key];
    }
  }
});

describe('requireSensitiveApiAccess', () => {
  it('blocks with 403 api_auth_not_configured when no token is configured and no public opt-in', async () => {
    const result = requireSensitiveApiAccess({ request: makeRequest(), route: '/api/llm/openai' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      code: 'api_auth_not_configured',
    });
  });

  it('returns 401 api_auth_required when a token is configured but the caller presents none', async () => {
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireSensitiveApiAccess({ request: makeRequest(), route: '/api/llm/openai' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toMatchObject({ code: 'api_auth_required' });
  });

  it('returns 401 when the presented token does not match', () => {
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireSensitiveApiAccess({
      request: makeRequest({ 'x-ots-api-token': 'wrong' }),
      route: '/api/llm/openai',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it('accepts a matching token via x-ots-api-token', () => {
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireSensitiveApiAccess({
      request: makeRequest({ 'x-ots-api-token': 'secret-token' }),
      route: '/api/llm/openai',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a matching token via x-music-api-token', () => {
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireSensitiveApiAccess({
      request: makeRequest({ 'x-music-api-token': 'secret-token' }),
      route: '/api/llm/openai',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a matching token via Authorization Bearer header (case-insensitive scheme)', () => {
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireSensitiveApiAccess({
      request: makeRequest({ authorization: 'BEARER secret-token' }),
      route: '/api/llm/openai',
    });
    expect(result.ok).toBe(true);
  });

  it('honors alternate token env vars (MUSIC_API_AUTH_TOKEN)', () => {
    process.env.MUSIC_API_AUTH_TOKEN = 'music-secret';
    const result = requireSensitiveApiAccess({
      request: makeRequest({ 'x-ots-api-token': 'music-secret' }),
      route: '/api/llm/openai',
    });
    expect(result.ok).toBe(true);
  });

  it('allows unauthenticated access when the public opt-in env var is truthy', () => {
    process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = '1';
    const result = requireSensitiveApiAccess({
      request: makeRequest(),
      route: '/api/llm/openai',
      allowUnauthenticatedEnvVar: 'ALLOW_UNAUTHENTICATED_LLM_PROXY',
    });
    expect(result.ok).toBe(true);
  });

  it('does not treat a falsey opt-in value as enabling public access', async () => {
    process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = 'false';
    const result = requireSensitiveApiAccess({
      request: makeRequest(),
      route: '/api/llm/openai',
      allowUnauthenticatedEnvVar: 'ALLOW_UNAUTHENTICATED_LLM_PROXY',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });

  it('enforces per-client rate limits with a 429 and Retry-After header', async () => {
    process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = '1';
    const clientId = uniqueClientId();
    const call = () =>
      requireSensitiveApiAccess({
        request: makeRequest({}, clientId),
        route: '/api/llm/ratelimited',
        allowUnauthenticatedEnvVar: 'ALLOW_UNAUTHENTICATED_LLM_PROXY',
        limit: 2,
        windowMs: 60_000,
      });

    expect(call().ok).toBe(true);
    expect(call().ok).toBe(true);
    const blocked = call();
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.response.status).toBe(429);
    expect(blocked.response.headers.get('Retry-After')).toBeTruthy();
    await expect(blocked.response.json()).resolves.toMatchObject({ code: 'rate_limited' });
  });

  it('scopes rate-limit counters per client id', () => {
    process.env.ALLOW_UNAUTHENTICATED_LLM_PROXY = '1';
    const opts = {
      route: '/api/llm/perclient',
      allowUnauthenticatedEnvVar: 'ALLOW_UNAUTHENTICATED_LLM_PROXY' as const,
      limit: 1,
      windowMs: 60_000,
    };
    const clientA = uniqueClientId();
    const clientB = uniqueClientId();
    expect(requireSensitiveApiAccess({ request: makeRequest({}, clientA), ...opts }).ok).toBe(true);
    // Different client is unaffected by clientA's exhausted budget.
    expect(requireSensitiveApiAccess({ request: makeRequest({}, clientB), ...opts }).ok).toBe(true);
    // clientA is now over budget.
    expect(requireSensitiveApiAccess({ request: makeRequest({}, clientA), ...opts }).ok).toBe(
      false,
    );
  });
});

describe('requireServerCredentialAccess', () => {
  it('blocks with 403 server_credentials_disabled when ALLOW_SERVER_LLM_KEYS is unset', async () => {
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireServerCredentialAccess({
      request: makeRequest({ 'x-ots-api-token': 'secret-token' }),
      route: '/api/music/agent',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      code: 'server_credentials_disabled',
    });
  });

  it('still requires an app token even when server-key fallback is enabled', async () => {
    process.env.ALLOW_SERVER_LLM_KEYS = '1';
    const result = requireServerCredentialAccess({
      request: makeRequest(),
      route: '/api/music/agent',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // No token configured at all -> not configured (there is no public opt-in
    // escape hatch for server-credential routes).
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      code: 'api_auth_not_configured',
    });
  });

  it('returns 401 when server keys are enabled and a token is configured but not presented', () => {
    process.env.ALLOW_SERVER_LLM_KEYS = '1';
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireServerCredentialAccess({
      request: makeRequest(),
      route: '/api/music/agent',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it('succeeds when server keys are enabled, a token is configured, and it is presented', () => {
    process.env.ALLOW_SERVER_LLM_KEYS = '1';
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    const result = requireServerCredentialAccess({
      request: makeRequest({ 'x-ots-api-token': 'secret-token' }),
      route: '/api/music/agent',
    });
    expect(result.ok).toBe(true);
  });
});

describe('allowServerCredentialFallback', () => {
  it('is false by default and true only for truthy ALLOW_SERVER_LLM_KEYS values', () => {
    expect(allowServerCredentialFallback()).toBe(false);
    for (const truthy of ['1', 'true', 'YES', 'on']) {
      process.env.ALLOW_SERVER_LLM_KEYS = truthy;
      expect(allowServerCredentialFallback()).toBe(true);
    }
    process.env.ALLOW_SERVER_LLM_KEYS = '0';
    expect(allowServerCredentialFallback()).toBe(false);
  });
});

describe('isConfiguredAppApiToken', () => {
  it('matches the configured token and rejects everything else', () => {
    expect(isConfiguredAppApiToken('anything')).toBe(false); // none configured
    process.env.OTS_API_AUTH_TOKEN = 'secret-token';
    expect(isConfiguredAppApiToken('secret-token')).toBe(true);
    expect(isConfiguredAppApiToken('other')).toBe(false);
    expect(isConfiguredAppApiToken('')).toBe(false);
  });
});
