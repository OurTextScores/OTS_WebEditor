// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useNotaGenTool,
  type NotaGenToolContext,
} from '../../components/score-editor/ai-tools/useNotaGenTool';
import {
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
  MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY,
} from '../../components/score-editor/music-specialists-constants';

const notify = vi.hoisted(() => ({ notifyWarning: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../components/shell/notices', () => notify);

const COMBINATIONS = {
  Baroque: { 'Bach, Johann Sebastian': ['Organ', 'Keyboard'], 'Handel, George Frideric': ['Harp'] },
  Romantic: { 'Chopin, Frederic': ['Keyboard'] },
};

function context(over: Partial<NotaGenToolContext> = {}) {
  const ctx = {
    postScoreEditorJson: vi.fn(async () => ({})),
    telemetryCountersRef: {
      current: { aiRequests: 0, aiFailures: 0 },
    } as unknown as NotaGenToolContext['telemetryCountersRef'],
    captureApiTraceContext: vi.fn(),
    emitEditorTelemetry: vi.fn(),
    setXmlLoading: vi.fn(),
    setXmlError: vi.fn(),
    score: null,
    handleFileUpload: vi.fn(async () => true),
    applyXmlToScore: vi.fn(async () => true),
    revealScoreSource: vi.fn(),
    aiEnabled: true,
    xmlSidebarTab: 'assistant',
    codeEditorTheme: 'light',
    ...over,
  } as unknown as NotaGenToolContext;
  return ctx;
}

const sse = (...events: Array<[string, unknown]>) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');

function streamResponse(text: string, init: ResponseInit = {}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    init,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useNotaGenTool: the space form', () => {
  it('starts from the defaults and restores what was saved', () => {
    const fresh = renderHook(() => useNotaGenTool(context()));
    expect(fresh.result.current.panel.space).toMatchObject({
      period: MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
      composer: MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
      instrumentation: MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
    });
    fresh.unmount();

    window.localStorage.setItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY, 'Baroque');
    const restored = renderHook(() => useNotaGenTool(context()));
    expect(restored.result.current.panel.space.period).toBe('Baroque');
  });

  it('saves a changed period for next time', async () => {
    const { result } = renderHook(() => useNotaGenTool(context()));
    act(() => result.current.panel.space.setPeriod('Romantic'));
    await waitFor(() =>
      expect(window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY)).toBe(
        'Romantic',
      ),
    );
  });

  it('loads the options when the tab opens and moves an unavailable choice to the first valid one', async () => {
    const postScoreEditorJson = vi.fn(async () => ({
      combinations: COMBINATIONS,
      periods: ['Baroque', 'Romantic'],
    }));
    const { result } = renderHook(() =>
      useNotaGenTool(context({ postScoreEditorJson, xmlSidebarTab: 'notagen' } as never)),
    );
    await waitFor(() => expect(result.current.panel.space.period).toBe('Baroque'));
    expect(postScoreEditorJson).toHaveBeenCalledWith('/api/music/notagen-space/options', {
      spaceId: 'ElectricAlexis/NotaGen',
    });
    // the default composer is not a Baroque composer, so the first one (sorted) is taken
    expect(result.current.panel.space.composer).toBe('Bach, Johann Sebastian');
    expect(result.current.panel.space.instrumentation).toBe('Keyboard');
    expect(result.current.panel.space.periods).toEqual(['Baroque', 'Romantic']);
    expect(result.current.panel.space.composers).toEqual([
      'Bach, Johann Sebastian',
      'Handel, George Frideric',
    ]);
    expect(result.current.panel.space.instrumentations).toEqual(['Keyboard', 'Organ']);
    // it asks once, not on every render
    expect(postScoreEditorJson).toHaveBeenCalledTimes(1);
  });

  it('does not load anything while the tab is closed or AI is off', async () => {
    const postScoreEditorJson = vi.fn(async () => ({}));
    renderHook(() => useNotaGenTool(context({ postScoreEditorJson })));
    renderHook(() =>
      useNotaGenTool(
        context({ postScoreEditorJson, xmlSidebarTab: 'notagen', aiEnabled: false } as never),
      ),
    );
    await Promise.resolve();
    expect(postScoreEditorJson).not.toHaveBeenCalled();
  });

  it('reports a failure to load options', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const postScoreEditorJson = vi.fn(async () => {
      throw new Error('space is down');
    });
    const { result } = renderHook(() =>
      useNotaGenTool(context({ postScoreEditorJson, xmlSidebarTab: 'notagen' } as never)),
    );
    await waitFor(() => expect(result.current.panel.space.optionsError).toBe('space is down'));
  });

  it('keeps the composer and instrumentation in step with the period and composer', async () => {
    const postScoreEditorJson = vi.fn(async () => ({
      combinations: COMBINATIONS,
      periods: ['Baroque', 'Romantic'],
    }));
    const { result } = renderHook(() =>
      useNotaGenTool(context({ postScoreEditorJson, xmlSidebarTab: 'notagen' } as never)),
    );
    await waitFor(() => expect(result.current.panel.space.period).toBe('Baroque'));

    act(() => result.current.panel.space.setPeriod('Romantic'));
    expect(result.current.panel.space.composer).toBe('Chopin, Frederic');
    expect(result.current.panel.space.instrumentation).toBe('Keyboard');

    act(() => result.current.panel.space.setPeriod('Baroque'));
    act(() => result.current.panel.space.setComposer('Handel, George Frideric'));
    expect(result.current.panel.space.instrumentation).toBe('Harp');
  });
});

describe('useNotaGenTool: apply', () => {
  const withXml = async (ctx: NotaGenToolContext) => {
    const hook = renderHook(() => useNotaGenTool(ctx));
    act(() => hook.result.current.panel.result.setGeneratedXml('<score-partwise/>'));
    return hook;
  };

  it('warns when there is nothing to apply', async () => {
    const ctx = context();
    const { result } = renderHook(() => useNotaGenTool(ctx));
    await act(async () => result.current.panel.actions.applyOutput());
    expect(notify.notifyWarning).toHaveBeenCalledWith('No generated MusicXML is available yet.');
    expect(ctx.applyXmlToScore).not.toHaveBeenCalled();
  });

  it('applies the XML to the open score and shows the source', async () => {
    const ctx = context({ score: {} } as never);
    const { result } = await withXml(ctx);
    await act(async () => result.current.panel.actions.applyOutput());
    expect(ctx.applyXmlToScore).toHaveBeenCalledWith('<score-partwise/>', {
      telemetrySource: 'notagen_output',
    });
    expect(ctx.revealScoreSource).toHaveBeenCalled();
    expect(vi.mocked(ctx.setXmlLoading).mock.calls).toEqual([[true], [false]]);
  });

  it('opens it as a new file when no score is loaded', async () => {
    const ctx = context();
    const { result } = await withXml(ctx);
    await act(async () => result.current.panel.actions.applyOutput());
    expect(ctx.applyXmlToScore).not.toHaveBeenCalled();
    const [file, options] = vi.mocked(ctx.handleFileUpload).mock.calls[0];
    // the composer is the file name, with characters a file name cannot hold replaced
    expect(file.name).toBe('notagen-Mozart, Wolfgang Amadeus.musicxml');
    expect(options).toEqual({
      preserveScoreId: false,
      updateUrl: false,
      telemetrySource: 'notagen_output',
    });
  });

  it('reports a failure and still clears the loading state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = context({
      score: {},
      applyXmlToScore: vi.fn(async () => {
        throw new Error('bad xml');
      }),
    } as never);
    const { result } = await withXml(ctx);
    await act(async () => result.current.panel.actions.applyOutput());
    expect(notify.notifyError).toHaveBeenCalledWith(
      'Failed to apply generated MusicXML. See console for details.',
    );
    expect(vi.mocked(ctx.setXmlLoading).mock.calls.at(-1)).toEqual([false]);
  });
});

describe('useNotaGenTool: run', () => {
  const run = async (ctx: NotaGenToolContext) => {
    const hook = renderHook(() => useNotaGenTool(ctx));
    await act(async () => hook.result.current.panel.actions.run());
    return hook;
  };

  it('streams status, progress and the final result into the panel', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse(
        sse(
          ['status', { stage: 'queued', message: 'waiting' }],
          ['log', { message: 'step 1' }],
          ['progress', { abc: 'X:1' }],
          ['result', { abc: 'X:final', content: { musicxml: '<score-partwise/>' } }],
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ctx = context();
    const { result } = await run(ctx);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/music/generate/stream');
    expect(JSON.parse(String(init.body))).toMatchObject({
      backend: 'huggingface-space',
      period: MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
      composer: MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
      includeContent: true,
    });
    expect(result.current.panel.status).toMatchObject({
      busy: false,
      error: null,
      statusText: 'queued: waiting',
      progressLog: 'step 1',
    });
    expect(result.current.panel.result.generatedXml).toBe('<score-partwise/>');
    expect(result.current.panel.result.generatedAbc).toBe('X:final');
    expect(ctx.telemetryCountersRef.current).toMatchObject({ aiRequests: 1, aiFailures: 0 });
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({ channel: 'notagen', outcome: 'success' }),
    );
  });

  it('shows the error of a stream that fails and counts the failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamResponse(sse(['error', { error: 'quota exceeded' }]))),
    );
    const ctx = context();
    const { result } = await run(ctx);
    expect(result.current.panel.status.error).toBe('quota exceeded');
    expect(result.current.panel.status.busy).toBe(false);
    expect(ctx.telemetryCountersRef.current).toMatchObject({ aiRequests: 1, aiFailures: 1 });
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({ outcome: 'failure', error: 'quota exceeded' }),
    );
  });

  it('reports a rejected request and a stream that ends with no result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'bad key' }, { status: 401 })),
    );
    expect((await run(context())).result.current.panel.status.error).toBe('bad key');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamResponse(sse(['log', { message: 'only a log' }]))),
    );
    expect((await run(context())).result.current.panel.status.error).toBe(
      'NotaGen Space stream ended without a final result.',
    );
  });

  it('refuses to run with an empty field, without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY, '');
    await run(context());
    expect(notify.notifyWarning).toHaveBeenCalledWith(
      'Enter a period, composer, and instrumentation for the NotaGen Space.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
