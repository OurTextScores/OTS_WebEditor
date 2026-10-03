// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANTHROPIC_EMBED_PROXY_ERROR } from '../../components/score-editor/ai-constants';
import {
  useAiModelList,
  type AiModelListContext,
} from '../../components/score-editor/ai-tools/useAiModelList';

const adapters = vi.hoisted(() => ({ loadAiModelDescriptorsDirect: vi.fn() }));
vi.mock('../../lib/ai-provider-adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/ai-provider-adapters')>()),
  loadAiModelDescriptorsDirect: adapters.loadAiModelDescriptorsDirect,
}));

const descriptor = (id: string) => ({ id, label: id, provider: 'openai' }) as never;

function setup(over: Partial<Record<keyof AiModelListContext, unknown>> = {}) {
  const ctx = {
    aiEnabled: true,
    setAiModels: vi.fn(),
    setAiModelDescriptors: vi.fn(),
    setAiModelsError: vi.fn(),
    setAiModelsLoading: vi.fn(),
    aiApiKey: ' sk-test ',
    useLlmProxy: true,
    proxyUrlFor: (path: string) => `https://proxy.test${path}`,
    aiProvider: 'openai',
    isEmbedBuild: false,
    llmProxyBase: '',
    setAiModel: vi.fn(),
  };
  Object.assign(ctx, over);
  const hook = renderHook(
    (props: typeof ctx) => useAiModelList(props as unknown as AiModelListContext),
    { initialProps: ctx },
  );
  return { ctx, ...hook };
}
const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      status === 200 ? Response.json(body) : new Response(String(body), { status }),
    ),
  );
const selectedFor = (ctx: { setAiModel: ReturnType<typeof vi.fn> }, previous: string) =>
  (ctx.setAiModel.mock.calls.at(-1)![0] as (prev: string) => string)(previous);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  adapters.loadAiModelDescriptorsDirect.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('useAiModelList', () => {
  it('clears the list without asking anyone when AI is off or there is no key', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const over of [{ aiEnabled: false }, { aiApiKey: '   ' }]) {
      const { ctx } = setup(over);
      expect(ctx.setAiModels).toHaveBeenCalledWith([]);
      expect(ctx.setAiModelDescriptors).toHaveBeenCalledWith([]);
      expect(ctx.setAiModelsError).toHaveBeenCalledWith(null);
      expect(ctx.setAiModelsLoading).toHaveBeenCalledWith(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the proxy for the models with the trimmed key and shows them sorted, once each', async () => {
    respond(200, { models: ['gpt-b', 'gpt-a', 'gpt-a', 7], modelDescriptors: [] });
    const { ctx } = setup();
    await waitFor(() => expect(ctx.setAiModels).toHaveBeenCalledWith(['gpt-a', 'gpt-b']));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proxy.test/api/llm/openai/models');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ apiKey: 'sk-test' });
    expect(ctx.setAiModelsLoading.mock.calls).toEqual([[true], [false]]);
    expect(ctx.setAiModelsError).toHaveBeenLastCalledWith(null);
    const descriptors = ctx.setAiModelDescriptors.mock.calls.at(-1)![0] as Array<{ id: string }>;
    expect(descriptors.map((d) => d.id)).toEqual(['gpt-a', 'gpt-b']);
  });

  it('keeps only chat models for OpenAI, but everything if none match', async () => {
    respond(200, { models: ['whisper-1', 'gpt-4', 'o3', 'dall-e'] });
    const filtered = setup();
    await waitFor(() => expect(filtered.ctx.setAiModels).toHaveBeenCalledWith(['gpt-4', 'o3']));
    respond(200, { models: ['whisper-1', 'dall-e'] });
    const all = setup();
    await waitFor(() => expect(all.ctx.setAiModels).toHaveBeenCalledWith(['dall-e', 'whisper-1']));
  });

  it('keeps the current model if it is still offered, else the provider default, else the first', async () => {
    respond(200, { models: ['gpt-a', 'gpt-b'] });
    const { ctx } = setup();
    await waitFor(() => expect(ctx.setAiModel).toHaveBeenCalled());
    expect(selectedFor(ctx, 'gpt-b')).toBe('gpt-b');
    expect(selectedFor(ctx, 'retired-model')).toBe('gpt-a');
    expect(selectedFor(ctx, '')).toBe('gpt-a');
  });

  it('asks the provider directly when the proxy is not in use', async () => {
    adapters.loadAiModelDescriptorsDirect.mockResolvedValue([
      descriptor('gpt-z'),
      descriptor('gpt-y'),
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ctx } = setup({ useLlmProxy: false });
    await waitFor(() => expect(ctx.setAiModels).toHaveBeenCalledWith(['gpt-y', 'gpt-z']));
    expect(adapters.loadAiModelDescriptorsDirect).toHaveBeenCalledWith({
      provider: 'openai',
      apiKey: 'sk-test',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the proxy’s own error text, or a generic one', async () => {
    respond(500, 'quota exceeded');
    const text = setup();
    await waitFor(() =>
      expect(text.ctx.setAiModelsError).toHaveBeenLastCalledWith('quota exceeded'),
    );
    expect(text.ctx.setAiModels).toHaveBeenLastCalledWith([]);
    respond(500, '');
    const generic = setup();
    await waitFor(() =>
      expect(generic.ctx.setAiModelsError).toHaveBeenLastCalledWith('Failed to load models.'),
    );
    expect(generic.ctx.setAiModelsLoading).toHaveBeenLastCalledWith(false);
  });

  it('explains that Claude needs a proxy in an embed without one', async () => {
    respond(404, 'not found');
    const { ctx } = setup({ aiProvider: 'anthropic', isEmbedBuild: true });
    await waitFor(() =>
      expect(ctx.setAiModelsError).toHaveBeenLastCalledWith(ANTHROPIC_EMBED_PROXY_ERROR),
    );
  });

  it('in an embed without a proxy, goes to the provider directly for the other providers', async () => {
    respond(404, 'not found');
    adapters.loadAiModelDescriptorsDirect.mockResolvedValue([descriptor('gpt-a')]);
    const { ctx } = setup({ isEmbedBuild: true });
    await waitFor(() => expect(ctx.setAiModels).toHaveBeenCalledWith(['gpt-a']));
    expect(adapters.loadAiModelDescriptorsDirect).toHaveBeenCalled();
  });

  it('ignores an answer that arrives after the key changed', async () => {
    let finish: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    const { ctx, rerender } = setup();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    rerender({ ...ctx, aiApiKey: '' });
    ctx.setAiModels.mockClear();
    ctx.setAiModelsLoading.mockClear();
    finish(Response.json({ models: ['gpt-late'] }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.setAiModels).not.toHaveBeenCalledWith(['gpt-late']);
    expect(ctx.setAiModel).not.toHaveBeenCalled();
    expect(ctx.setAiModelsLoading).not.toHaveBeenCalled();
  });
});
