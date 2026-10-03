import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestAiPatch,
  type RequestAiPatchContext,
} from '../../components/score-editor/ai-patch-request';
import { AI_PROVIDER_LABELS } from '../../lib/ai-provider-adapters';

const notify = vi.hoisted(() => ({ notifyWarning: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../components/shell/notices', () => notify);

const PATCH = { format: 'musicxml-patch@1', ops: [{ op: 'setText', path: '/a', value: 'x' }] };
const OK = {
  verification: { level: 'patch_apply' },
  patch: PATCH,
  proposedXml: ' <proposed/> ',
  annotations: [],
  proposalSessionId: 'session-1',
  continuityToken: 'token',
};

function context(over: Partial<Record<keyof RequestAiPatchContext, unknown>> = {}) {
  const editRequest = { controller: new AbortController() };
  const ctx = {
    aiEnabled: true,
    aiBusy: false,
    aiDiffFeedbackBusy: false,
    aiApiKey: ' sk-test ',
    aiProvider: 'openai',
    aiPrompt: ' make it softer ',
    aiModel: ' gpt-test ',
    aiMaxTokensMode: 'auto',
    aiMaxTokens: 4096,
    beginAiEdit: vi.fn(() => editRequest),
    aiDeepEdit: false,
    setAiError: vi.fn(),
    setAiOutput: vi.fn(),
    setAiPatch: vi.fn(),
    setAiPatchError: vi.fn(),
    setAiPatchedXml: vi.fn(),
    clearAiProposal: vi.fn(),
    aiScoreBridge: {
      getLiveXml: vi.fn(async () => '<base/>'),
      getContextXml: vi.fn(async () => '<base/>'),
      getScorePdf: vi.fn(async () => null),
      getPageSvgContext: vi.fn(async () => ''),
      getSelectionContext: vi.fn(async () => ''),
      getPageImage: vi.fn(async () => null),
    },
    xmlText: '<sidebar/>',
    aiIncludeXml: true,
    aiIncludePdf: false,
    aiIncludePage: false,
    currentPageRef: { current: 0 },
    aiIncludeSelection: false,
    aiIncludeChat: false,
    aiChatMessages: [],
    aiIncludeRenderedImage: false,
    setAiBaseXml: vi.fn(),
    telemetryCountersRef: { current: { aiRequests: 0, aiFailures: 0 } },
    aiEditEffort: 'balanced',
    aiTemperatureMode: 'auto',
    aiTemperature: 1,
    captureApiTraceContext: vi.fn(),
    updateAiEditProgress: vi.fn(),
    setAiLastAnnotations: vi.fn(),
    openAiProposalCompare: vi.fn(() => true),
    mergeAiAnnotations: vi.fn(),
    setAiProposalSession: vi.fn(),
    setAiProposalAudit: vi.fn(),
    finishAiEdit: vi.fn(),
    emitEditorTelemetry: vi.fn(),
    ...over,
  };
  return { ctx: ctx as unknown as RequestAiPatchContext & typeof ctx, editRequest };
}

let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const sent = () =>
  JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock = vi.fn(async () => json(OK));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requestAiPatch: checks before sending', () => {
  const refuses = async (over: Parameters<typeof context>[0], message?: string) => {
    const { ctx } = context(over);
    await requestAiPatch(ctx);
    if (message) expect(notify.notifyWarning).toHaveBeenCalledWith(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.beginAiEdit).not.toHaveBeenCalled();
  };

  it('asks for each missing piece', async () => {
    await refuses({ aiEnabled: false }, 'AI features are disabled.');
    await refuses({ aiApiKey: ' ' }, `Enter your ${AI_PROVIDER_LABELS.openai} API key.`);
    await refuses({ aiPrompt: '' }, 'Enter an instruction for the assistant.');
    await refuses({ aiModel: ' ' }, 'Select a model.');
    await refuses({ aiMaxTokensMode: 'custom', aiMaxTokens: 0 }, 'Enter a max output token limit.');
  });

  it('does nothing while another AI request is running', async () => {
    notify.notifyWarning.mockClear();
    await refuses({ aiBusy: true });
    await refuses({ aiDiffFeedbackBusy: true });
    expect(notify.notifyWarning).not.toHaveBeenCalled();
  });
});

describe('requestAiPatch: a successful request', () => {
  it('clears the previous proposal, then sends the live MusicXML with the instruction', async () => {
    const { ctx } = context();
    await requestAiPatch(ctx);
    expect(ctx.beginAiEdit).toHaveBeenCalledWith('patch', 'Preparing patch request');
    expect(ctx.clearAiProposal).toHaveBeenCalled();
    expect(ctx.setAiOutput).toHaveBeenCalledWith('');
    expect(ctx.aiScoreBridge.getLiveXml).toHaveBeenCalledWith('<sidebar/>');
    expect(ctx.setAiBaseXml).toHaveBeenCalledWith('<base/>');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/music/patch');
    expect(url).not.toContain('/deep');
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
    expect(sent()).toMatchObject({
      content: '<base/>',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-test',
      editEffort: 'balanced',
      maxTokens: null,
      temperature: null,
    });
    expect(sent().promptText).toContain('make it softer');
    expect(sent().promptText).toContain('Current MusicXML text');
  });

  it('shows the patch and opens the proposal for review', async () => {
    const { ctx, editRequest } = context();
    await requestAiPatch(ctx);
    expect(JSON.parse(vi.mocked(ctx.setAiOutput).mock.calls.at(-1)![0])).toEqual(PATCH);
    expect(ctx.setAiPatch).toHaveBeenLastCalledWith(PATCH);
    expect(ctx.setAiPatchedXml).toHaveBeenLastCalledWith('<proposed/>');
    expect(ctx.openAiProposalCompare).toHaveBeenCalledWith('<base/>', '<proposed/>', undefined);
    expect(ctx.setAiProposalSession).toHaveBeenCalledWith(
      expect.objectContaining({ originalInstruction: 'make it softer' }),
    );
    expect(ctx.setAiProposalAudit).toHaveBeenCalledWith({
      cycle: 1,
      verification: { level: 'patch_apply' },
    });
    expect(ctx.finishAiEdit).toHaveBeenCalledWith(editRequest, 'success', '');
    expect(ctx.telemetryCountersRef.current).toEqual({ aiRequests: 1, aiFailures: 0 });
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({
        channel: 'assistant_patch',
        outcome: 'success',
        edit_effort: 'balanced',
      }),
    );
  });

  it('seeds annotations after the compare view is open, since opening it resets them', async () => {
    fetchMock.mockResolvedValue(json({ ...OK, annotations: [{ measure: 1, text: 'softer' }] }));
    const { ctx } = context();
    const order: string[] = [];
    vi.mocked(ctx.openAiProposalCompare).mockImplementation(() => (order.push('open'), true));
    vi.mocked(ctx.mergeAiAnnotations).mockImplementation(() => void order.push('merge'));
    await requestAiPatch(ctx);
    expect(order).toEqual(['open', 'merge']);
  });

  it('sends the custom limits and attachments only for a normal patch', async () => {
    const image = { mediaType: 'image/png', base64: 'IMG' };
    const { ctx } = context({
      aiMaxTokensMode: 'custom',
      aiMaxTokens: 300,
      aiTemperatureMode: 'custom',
      aiTemperature: 0.1,
      aiIncludeRenderedImage: true,
      aiScoreBridge: { ...context().ctx.aiScoreBridge, getPageImage: vi.fn(async () => image) },
    });
    await requestAiPatch(ctx);
    expect(sent()).toMatchObject({ maxTokens: 300, temperature: 0.1, image });
  });

  it('uses the Deep Edit endpoint without attachments or limits, and shows its rationale', async () => {
    fetchMock.mockResolvedValue(
      json({
        verification: { level: 'render' },
        proposedXml: '<deep/>',
        deepEdit: { finalizedCandidateId: 'c2', rationale: 'because' },
      }),
    );
    const { ctx } = context({ aiDeepEdit: true });
    await requestAiPatch(ctx);
    expect(ctx.beginAiEdit).toHaveBeenCalledWith('deep', 'Preparing Deep Edit');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('/api/music/patch/deep');
    expect(sent()).not.toHaveProperty('maxTokens');
    expect(sent()).not.toHaveProperty('image');
    expect(ctx.setAiPatch).toHaveBeenLastCalledWith(null);
    expect(JSON.parse(vi.mocked(ctx.setAiOutput).mock.calls.at(-1)![0])).toEqual({
      deepEdit: { finalizedCandidateId: 'c2', rationale: 'because' },
    });
    expect(ctx.finishAiEdit).toHaveBeenCalledWith(expect.anything(), 'success', '');
  });
});

describe('requestAiPatch: failures', () => {
  const fails = async (
    response: Response | null,
    message: string,
    over: Parameters<typeof context>[0] = {},
  ) => {
    if (response) fetchMock.mockResolvedValue(response);
    const { ctx, editRequest } = context(over);
    await requestAiPatch(ctx);
    expect(ctx.setAiError).toHaveBeenLastCalledWith(message);
    expect(ctx.finishAiEdit).toHaveBeenCalledWith(editRequest, 'failure', message);
    expect(ctx.openAiProposalCompare).not.toHaveBeenCalled();
    return ctx;
  };

  it('stops when the live MusicXML cannot be read', async () => {
    const ctx = await fails(null, 'Unable to load MusicXML for patch verification.', {
      aiScoreBridge: { ...context().ctx.aiScoreBridge, getLiveXml: vi.fn(async () => '  ') },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.telemetryCountersRef.current.aiRequests).toBe(0);
    expect(ctx.emitEditorTelemetry).not.toHaveBeenCalled();
  });

  it('reports an error status with the server message, or the status', async () => {
    const ctx = await fails(json({ error: 'quota exceeded' }, 429), 'quota exceeded');
    expect(ctx.telemetryCountersRef.current).toEqual({ aiRequests: 1, aiFailures: 1 });
    await fails(json({}, 502), 'Patch request failed: 502');
  });

  it('refuses a proposal the service did not verify', async () => {
    await fails(
      json({ ...OK, verification: { level: 'none' } }),
      'Patch service returned an unverified proposal.',
    );
  });

  it('refuses an invalid patch, a missing patch, and empty proposed MusicXML', async () => {
    await fails(
      json({ ...OK, patch: { format: 'musicxml-patch@1', ops: [{ op: 'move', path: '/a' }] } }),
      'Patch op 1 has unsupported op "move".',
    );
    await fails(
      json({ ...OK, patch: undefined }),
      'Patch service returned an invalid patch payload.',
    );
    await fails(
      json({ ...OK, proposedXml: '  ' }),
      'Patch service returned empty proposed MusicXML.',
    );
  });

  it('reports a compare view that would not open, and does not record a session', async () => {
    const { ctx, editRequest } = context({ openAiProposalCompare: vi.fn(() => false) });
    await requestAiPatch(ctx);
    expect(ctx.setAiError).toHaveBeenLastCalledWith('Unable to open compare view for AI proposal.');
    expect(ctx.setAiProposalSession).not.toHaveBeenCalled();
    expect(ctx.finishAiEdit).toHaveBeenCalledWith(
      editRequest,
      'failure',
      'Unable to open compare view for AI proposal.',
    );
  });
});

describe('requestAiPatch: cancelling', () => {
  it('is not an error when the user cancels', async () => {
    const { ctx, editRequest } = context();
    fetchMock.mockImplementation(async () => {
      editRequest.controller.abort(new DOMException('cancelled', 'AbortError'));
      throw new DOMException('cancelled', 'AbortError');
    });
    await requestAiPatch(ctx);
    expect(ctx.setAiError).toHaveBeenLastCalledWith(null);
    expect(ctx.finishAiEdit).toHaveBeenCalledWith(editRequest, 'cancelled', 'Request cancelled.');
    expect(ctx.telemetryCountersRef.current.aiFailures).toBe(0);
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({ outcome: 'cancelled' }),
    );
  });

  it('says so when the request times out', async () => {
    const { ctx, editRequest } = context();
    fetchMock.mockImplementation(async () => {
      editRequest.controller.abort(new DOMException('slow', 'TimeoutError'));
      throw new DOMException('slow', 'TimeoutError');
    });
    await requestAiPatch(ctx);
    expect(ctx.setAiError).toHaveBeenLastCalledWith('AI edit request exceeded its client timeout.');
    expect(ctx.finishAiEdit).toHaveBeenCalledWith(
      editRequest,
      'failure',
      'AI edit request exceeded its client timeout.',
    );
  });

  it('does not send a request that was cancelled while the context was being gathered', async () => {
    const { ctx, editRequest } = context({ aiIncludeRenderedImage: true });
    vi.mocked(ctx.aiScoreBridge.getPageImage).mockImplementation(async () => {
      editRequest.controller.abort(new DOMException('cancelled', 'AbortError'));
      return null;
    });
    await requestAiPatch(ctx);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.finishAiEdit).toHaveBeenCalledWith(editRequest, 'cancelled', 'Request cancelled.');
    expect(ctx.telemetryCountersRef.current.aiRequests).toBe(0);
  });
});
