import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestAiTextImpl,
  type RequestAiTextContext,
} from '../../components/score-editor/ai-text-request';
import {
  AI_PATCH_SYSTEM_PROMPT,
  ANTHROPIC_EMBED_PROXY_ERROR,
} from '../../components/score-editor/ai-constants';
import { requestAiTextDirect } from '../../lib/ai-provider-adapters';

vi.mock('../../lib/ai-provider-adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/ai-provider-adapters')>()),
  requestAiTextDirect: vi.fn(async () => 'direct text'),
}));

function context(over: Partial<Record<keyof RequestAiTextContext, unknown>> = {}) {
  return {
    aiUnsupportedParametersRef: { current: new Map() },
    setAiTemperatureMode: vi.fn(),
    setAiMaxTokensMode: vi.fn(),
    aiModelDescriptors: [],
    useLlmProxy: true,
    activeLaunchContext: null,
    proxyUrlFor: (path: string) => `https://app.test${path}`,
    captureApiTraceContext: vi.fn(),
    isEmbedBuild: false,
    llmProxyBase: '',
    ...over,
  } as unknown as RequestAiTextContext;
}

const payload = (over: Record<string, unknown> = {}) =>
  ({
    provider: 'openai',
    apiKey: 'sk-test',
    model: 'gpt-test',
    promptText: '',
    prompt: 'make it louder',
    xml: '<score/>',
    maxTokens: 1000,
    temperature: 0.5,
    ...over,
  }) as Parameters<typeof requestAiTextImpl>[1];

const json = (body: unknown, status = 200) => Response.json(body, { status });
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call = 0) =>
  JSON.parse(String((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => json({ text: 'proxy text' }));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(requestAiTextDirect).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requestAiTextImpl: through the proxy', () => {
  it('posts the request to the provider route and returns the text', async () => {
    const ctx = context();
    const result = await requestAiTextImpl(ctx, payload());
    expect(result).toEqual({ text: 'proxy text', sourceRag: null });
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://app.test/api/llm/openai');
    expect(sentBody(fetchMock)).toMatchObject({
      apiKey: 'sk-test',
      model: 'gpt-test',
      systemPrompt: AI_PATCH_SYSTEM_PROMPT,
      maxTokens: 1000,
      temperature: 0.5,
      imageBase64: '',
    });
    expect(ctx.captureApiTraceContext).toHaveBeenCalled();
  });

  it('builds the prompt from the request and the current MusicXML, unless one is supplied', async () => {
    await requestAiTextImpl(context(), payload());
    expect(sentBody(fetchMock).promptText).toContain('make it louder');
    expect(sentBody(fetchMock).promptText).toContain('Current MusicXML');
    expect(sentBody(fetchMock).promptText).toContain('<score/>');

    await requestAiTextImpl(
      context(),
      payload({ promptText: 'use this', systemPrompt: ' custom ' }),
    );
    expect(sentBody(fetchMock, 1)).toMatchObject({
      promptText: 'use this',
      systemPrompt: 'custom',
    });
  });

  it('sends attachments and the launch context', async () => {
    const launch = { source: 'ots' };
    await requestAiTextImpl(
      context({ activeLaunchContext: launch }),
      payload({
        image: { mediaType: 'image/png', base64: 'AAA' },
        pdf: { mediaType: 'application/pdf', base64: 'BBB', filename: 'p.pdf' },
        enableSourceRag: true,
      }),
    );
    expect(sentBody(fetchMock)).toMatchObject({
      imageBase64: 'AAA',
      imageMediaType: 'image/png',
      pdfBase64: 'BBB',
      pdfFilename: 'p.pdf',
      enableSourceRag: true,
      sourceContext: launch,
    });
  });

  it('returns the source-rag info when the server sends it, and an empty string for a non-string text', async () => {
    fetchMock.mockResolvedValueOnce(json({ text: 7, sourceRag: { used: true } }));
    expect(await requestAiTextImpl(context(), payload())).toEqual({
      text: '',
      sourceRag: { used: true },
    });
  });

  it('throws the server message when the request fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }));
    await expect(requestAiTextImpl(context(), payload())).rejects.toThrow('quota exceeded');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(requestAiTextImpl(context(), payload())).rejects.toThrow('Request failed.');
  });

  it('retries without a parameter the model rejects, and remembers that for next time', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = context();
    fetchMock
      .mockResolvedValueOnce(
        new Response('temperature is not supported by this model', { status: 400 }),
      )
      .mockResolvedValueOnce(json({ text: 'ok' }));
    expect((await requestAiTextImpl(ctx, payload())).text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchMock, 1)).not.toHaveProperty('temperature');
    expect(sentBody(fetchMock, 1)).toHaveProperty('maxTokens', 1000);
    expect(ctx.setAiTemperatureMode).toHaveBeenCalledWith('auto');

    // the next request does not send it at all
    await requestAiTextImpl(ctx, payload());
    expect(sentBody(fetchMock, 2)).not.toHaveProperty('temperature');
  });

  it('does not retry a rejection of a parameter it did not send', async () => {
    fetchMock.mockResolvedValue(new Response('temperature is not supported', { status: 400 }));
    await expect(requestAiTextImpl(context(), payload({ temperature: null }))).rejects.toThrow(
      'temperature is not supported',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries without max tokens the same way', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = context();
    fetchMock
      .mockResolvedValueOnce(new Response('max_tokens is not supported', { status: 400 }))
      .mockResolvedValueOnce(json({ text: 'ok' }));
    await requestAiTextImpl(ctx, payload());
    expect(sentBody(fetchMock, 1)).not.toHaveProperty('maxTokens');
    expect(ctx.setAiMaxTokensMode).toHaveBeenCalledWith('auto');
  });
});

describe('requestAiTextImpl: embed builds with no proxy', () => {
  const embed = { isEmbedBuild: true, llmProxyBase: '' };

  it('explains that Anthropic needs a proxy', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    await expect(
      requestAiTextImpl(context(embed), payload({ provider: 'anthropic' })),
    ).rejects.toThrow(ANTHROPIC_EMBED_PROXY_ERROR);
    expect(requestAiTextDirect).not.toHaveBeenCalled();
  });

  it('falls back to a direct call for other providers when the proxy is missing', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    expect(await requestAiTextImpl(context(embed), payload())).toEqual({
      text: 'direct text',
      sourceRag: null,
    });
    expect(requestAiTextDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-test',
        maxTokens: 1000,
        temperature: 0.5,
      }),
    );
  });

  it('does not fall back when the proxy answered with another error', async () => {
    fetchMock.mockResolvedValue(new Response('server error', { status: 500 }));
    await expect(requestAiTextImpl(context(embed), payload())).rejects.toThrow('server error');
    expect(requestAiTextDirect).not.toHaveBeenCalled();
  });
});

describe('requestAiTextImpl: direct', () => {
  it('calls the provider directly when the proxy is off', async () => {
    const result = await requestAiTextImpl(context({ useLlmProxy: false }), payload());
    expect(result).toEqual({ text: 'direct text', sourceRag: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(requestAiTextDirect).mock.calls[0][0]).toMatchObject({
      systemPrompt: AI_PATCH_SYSTEM_PROMPT,
      modelDescriptor: expect.objectContaining({ provider: 'openai' }),
    });
  });

  it('retries once without a parameter the provider rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(requestAiTextDirect)
      .mockRejectedValueOnce(new Error('Unsupported parameter: temperature'))
      .mockResolvedValueOnce('second try');
    const result = await requestAiTextImpl(context({ useLlmProxy: false }), payload());
    expect(result.text).toBe('second try');
    expect(vi.mocked(requestAiTextDirect).mock.calls[1][0].temperature).toBeNull();
  });

  it('rethrows any other error', async () => {
    vi.mocked(requestAiTextDirect).mockRejectedValueOnce(new Error('network down'));
    await expect(requestAiTextImpl(context({ useLlmProxy: false }), payload())).rejects.toThrow(
      'network down',
    );
  });
});
