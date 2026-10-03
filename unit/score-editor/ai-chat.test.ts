import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendAiChatMessage, type SendAiChatContext } from '../../components/score-editor/ai-chat';
import { AI_CHAT_SYSTEM_PROMPT } from '../../components/score-editor/ai-constants';
import { AI_PROVIDER_LABELS } from '../../lib/ai-provider-adapters';

const notify = vi.hoisted(() => ({ notifyWarning: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../components/shell/notices', () => notify);

function context(over: Partial<Record<keyof SendAiChatContext, unknown>> = {}) {
  const ctx = {
    aiEnabled: true,
    aiApiKey: 'sk-test',
    aiProvider: 'openai',
    aiModel: 'gpt-test',
    aiChatInput: '  Make bar 3 louder  ',
    aiMaxTokensMode: 'auto',
    aiMaxTokens: 4096,
    aiChatMessages: [],
    setAiChatBusy: vi.fn(),
    setAiError: vi.fn(),
    aiIncludeXml: false,
    aiScoreBridge: {
      getContextXml: vi.fn(async () => '<score/>'),
      getScorePdf: vi.fn(async () => ({
        filename: 'score.pdf',
        base64: 'PDF',
        mediaType: 'application/pdf',
      })),
      getPageSvgContext: vi.fn(async () => '<svg/>'),
      getSelectionContext: vi.fn(async () => 'bar 3'),
      getPageImage: vi.fn(async () => ({ mediaType: 'image/png', base64: 'IMG' })),
    },
    aiIncludePdf: false,
    aiIncludePage: false,
    currentPageRef: { current: 1 },
    aiIncludeSelection: false,
    aiIncludeChat: false,
    aiIncludeRenderedImage: false,
    setAiChatInput: vi.fn(),
    setAiChatMessages: vi.fn(),
    telemetryCountersRef: { current: { aiRequests: 0, aiFailures: 0 } },
    requestAiText: vi.fn(async () => ({ text: ' Done. ', sourceRag: null })),
    aiTemperatureMode: 'auto',
    aiTemperature: 1,
    emitEditorTelemetry: vi.fn(),
    ...over,
  };
  return ctx as unknown as SendAiChatContext & typeof ctx;
}

beforeEach(() => vi.clearAllMocks());

describe('sendAiChatMessage: checks before sending', () => {
  const refuses = async (over: Parameters<typeof context>[0], message: string) => {
    const ctx = context(over);
    await sendAiChatMessage(ctx);
    expect(notify.notifyWarning).toHaveBeenCalledWith(message);
    expect(ctx.requestAiText).not.toHaveBeenCalled();
    expect(ctx.setAiChatBusy).not.toHaveBeenCalled();
  };

  it('asks for each missing piece, in order', async () => {
    await refuses({ aiEnabled: false }, 'AI features are disabled.');
    await refuses({ aiApiKey: ' ' }, `Enter your ${AI_PROVIDER_LABELS.openai} API key.`);
    await refuses({ aiModel: '' }, 'Select a model.');
    await refuses({ aiChatInput: '   ' }, 'Enter a chat message.');
    await refuses({ aiMaxTokensMode: 'custom', aiMaxTokens: 0 }, 'Enter a max output token limit.');
  });
});

describe('sendAiChatMessage: a request', () => {
  it('sends the trimmed message, adds both turns to the chat and clears the input', async () => {
    const ctx = context();
    await sendAiChatMessage(ctx);
    expect(ctx.requestAiText).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'sk-test',
        systemPrompt: AI_CHAT_SYSTEM_PROMPT,
        prompt: 'Make bar 3 louder',
        maxTokens: null,
        temperature: null,
        xml: '',
        image: null,
        pdf: null,
      }),
    );
    expect(vi.mocked(ctx.requestAiText).mock.calls[0][0].promptText).toContain(
      'Latest user message:\nMake bar 3 louder',
    );
    expect(ctx.setAiChatInput).toHaveBeenCalledWith('');
    expect(ctx.setAiChatMessages).toHaveBeenNthCalledWith(1, [
      { role: 'user', text: 'Make bar 3 louder' },
    ]);
    // the reply is appended with the functional form, to what is there now
    const append = vi.mocked(ctx.setAiChatMessages).mock.calls[1][0] as unknown as (
      prev: unknown[],
    ) => unknown[];
    expect(append([{ role: 'user', text: 'x' }])).toEqual([
      { role: 'user', text: 'x' },
      { role: 'assistant', text: 'Done.', sourceRag: null },
    ]);
    expect(vi.mocked(ctx.setAiChatBusy).mock.calls).toEqual([[true], [false]]);
    expect(ctx.telemetryCountersRef.current).toEqual({ aiRequests: 1, aiFailures: 0 });
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({
        channel: 'assistant_chat',
        provider: 'openai',
        outcome: 'success',
      }),
    );
  });

  it('uses the custom limits when they are on', async () => {
    const ctx = context({
      aiMaxTokensMode: 'custom',
      aiMaxTokens: 512,
      aiTemperatureMode: 'custom',
      aiTemperature: 0.2,
    });
    await sendAiChatMessage(ctx);
    expect(ctx.requestAiText).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 512, temperature: 0.2 }),
    );
  });

  it('adds only the context the user switched on', async () => {
    const ctx = context({
      aiIncludeXml: true,
      aiIncludePdf: true,
      aiIncludePage: true,
      aiIncludeSelection: true,
      aiIncludeChat: true,
      aiIncludeRenderedImage: true,
      aiChatMessages: [{ role: 'user', text: 'earlier' }],
    });
    await sendAiChatMessage(ctx);
    const sent = vi.mocked(ctx.requestAiText).mock.calls[0][0];
    for (const section of [
      'Current MusicXML text',
      'Attached as score.pdf.',
      'Current rendered page SVG (page 2)',
      'Current selection context',
      'Assistant chat history',
    ]) {
      expect(sent.promptText).toContain(section);
    }
    expect(sent.xml).toBe('<score/>');
    expect(sent.image).toEqual({ mediaType: 'image/png', base64: 'IMG' });
    expect(sent.pdf).toMatchObject({ filename: 'score.pdf' });
    expect(sent.promptText).toContain('earlier');

    const bare = context();
    await sendAiChatMessage(bare);
    expect(bare.aiScoreBridge.getContextXml).not.toHaveBeenCalled();
    expect(bare.aiScoreBridge.getPageImage).not.toHaveBeenCalled();
  });

  it('says so when a context source is unavailable', async () => {
    const ctx = context({
      aiIncludePdf: true,
      aiIncludePage: true,
      aiIncludeSelection: true,
      aiScoreBridge: {
        getScorePdf: vi.fn(async () => null),
        getPageSvgContext: vi.fn(async () => ' '),
        getSelectionContext: vi.fn(async () => ''),
      },
    });
    await sendAiChatMessage(ctx);
    const text = vi.mocked(ctx.requestAiText).mock.calls[0][0].promptText;
    expect(text).toContain('PDF attachment unavailable');
    expect(text).toContain('Page SVG context is unavailable.');
    expect(text).toContain('No active selection.');
  });

  it('stops, without a request, when the MusicXML cannot be loaded', async () => {
    const ctx = context({
      aiIncludeXml: true,
      aiScoreBridge: { getContextXml: vi.fn(async () => '  ') },
    });
    await sendAiChatMessage(ctx);
    expect(notify.notifyError).toHaveBeenCalledWith('Unable to load MusicXML for context.');
    expect(ctx.requestAiText).not.toHaveBeenCalled();
    expect(ctx.setAiChatInput).not.toHaveBeenCalled();
    expect(ctx.telemetryCountersRef.current.aiRequests).toBe(0);
    expect(ctx.emitEditorTelemetry).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.setAiChatBusy).mock.calls.at(-1)).toEqual([false]);
  });
});

describe('sendAiChatMessage: failures', () => {
  it('reports an empty reply as a failure', async () => {
    const ctx = context({ requestAiText: vi.fn(async () => ({ text: '   ', sourceRag: null })) });
    await sendAiChatMessage(ctx);
    expect(ctx.setAiError).toHaveBeenLastCalledWith('No response was returned by the model.');
    expect(ctx.telemetryCountersRef.current.aiFailures).toBe(1);
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({
        outcome: 'failure',
        error: 'No response was returned by the model.',
      }),
    );
    // the user's message stays in the chat; only the reply is missing
    expect(ctx.setAiChatMessages).toHaveBeenCalledTimes(1);
  });

  it('reports a request error and still clears busy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = context({
      requestAiText: vi.fn(async () => {
        throw new Error('rate limited');
      }),
    });
    await sendAiChatMessage(ctx);
    expect(ctx.setAiError).toHaveBeenLastCalledWith('rate limited');
    expect(vi.mocked(ctx.setAiChatBusy).mock.calls.at(-1)).toEqual([false]);
    expect(ctx.telemetryCountersRef.current).toEqual({ aiRequests: 1, aiFailures: 1 });
  });
});
