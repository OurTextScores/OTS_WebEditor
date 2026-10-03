// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTranscodaTool,
  type TranscodaToolContext,
} from '../../components/score-editor/ai-tools/useTranscodaTool';

const notify = vi.hoisted(() => ({ notifyWarning: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../components/shell/notices', () => notify);
const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../../components/score-editor/download-blob', () => download);
// jsdom's FileReader rejects Node's Blob, so the encoding step is replaced; it has its own module.
vi.mock('../../components/score-editor/file-base64', () => ({
  fileToBase64: vi.fn(async () => 'data:image/png;base64,AAAA'),
}));

const MUSICXML = (...measures: number[]) =>
  `<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">${measures
    .map((n) => `<measure number="${n}"><note><rest/></note></measure>`)
    .join('')}</part></score-partwise>`;

function context(over: Partial<TranscodaToolContext> = {}) {
  return {
    postScoreEditorJson: vi.fn(async () => ({})),
    emitEditorTelemetry: vi.fn(),
    score: null,
    setXmlLoading: vi.fn(),
    setXmlError: vi.fn(),
    handleFileUpload: vi.fn(async () => true),
    applyXmlToScore: vi.fn(async () => true),
    resolveXmlContext: vi.fn(async () => ''),
    revealScoreSource: vi.fn(),
    xmlLoading: false,
    ...over,
  } as unknown as TranscodaToolContext;
}

const pick = (file: File | null) =>
  ({ target: { files: file ? [file] : [] } }) as unknown as ChangeEvent<HTMLInputElement>;
const image = () => new window.File(['png'], 'page.png', { type: 'image/png' });

/** Picks an image and runs a transcription that returns `payload`. */
async function transcribed(ctx: TranscodaToolContext, payload: Record<string, unknown>) {
  vi.mocked(ctx.postScoreEditorJson).mockResolvedValue(payload);
  const hook = renderHook(() => useTranscodaTool(ctx));
  act(() => hook.result.current.panel.input.onImageUpload(pick(image())));
  await act(async () => hook.result.current.panel.actions.transcribe());
  return hook;
}

beforeEach(() => vi.clearAllMocks());

describe('useTranscodaTool: transcribe', () => {
  it('asks for an image first', async () => {
    const ctx = context();
    const { result } = renderHook(() => useTranscodaTool(ctx));
    await act(async () => result.current.panel.actions.transcribe());
    expect(notify.notifyWarning).toHaveBeenCalledWith(
      'Choose a page image before running Transcoda.',
    );
    expect(ctx.postScoreEditorJson).not.toHaveBeenCalled();
  });

  it('sends the image with the decoding options and shows kern and MusicXML', async () => {
    const ctx = context();
    const { result } = await transcribed(ctx, {
      content: { kern: '**kern', musicxml: MUSICXML(1) },
    });
    const [path, body] = vi.mocked(ctx.postScoreEditorJson).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe('/api/music/omr/transcribe');
    expect(body).toMatchObject({
      mimeType: 'image/png',
      decoding: 'greedy',
      maxLength: 2048,
      numBeams: 3,
      repetitionPenalty: 1.1,
      convertToMusicXml: true,
    });
    expect(body.imageDataUrl).toBe('data:image/png;base64,AAAA');
    expect(result.current.panel.result).toMatchObject({
      generatedKern: '**kern',
      generatedXml: MUSICXML(1),
    });
    expect(result.current.panel.status).toMatchObject({
      busy: false,
      phase: 'idle',
      error: null,
      warning: null,
    });
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({ channel: 'transcoda', outcome: 'success', image_name: 'page.png' }),
    );
  });

  it('uses the options the user chose', async () => {
    const ctx = context();
    vi.mocked(ctx.postScoreEditorJson).mockResolvedValue({});
    const { result } = renderHook(() => useTranscodaTool(ctx));
    act(() => result.current.panel.input.onImageUpload(pick(image())));
    act(() => {
      result.current.panel.decoding.setMode('beam');
      result.current.panel.decoding.setNumBeams(5);
    });
    await act(async () => result.current.panel.actions.transcribe());
    expect(vi.mocked(ctx.postScoreEditorJson).mock.calls[0][1]).toMatchObject({
      decoding: 'beam',
      numBeams: 5,
    });
  });

  it('goes through uploading and transcribing, then back to idle', async () => {
    const ctx = context();
    let finish: (value: Record<string, unknown>) => void = () => {};
    vi.mocked(ctx.postScoreEditorJson).mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    const { result } = renderHook(() => useTranscodaTool(ctx));
    act(() => result.current.panel.input.onImageUpload(pick(image())));
    act(() => result.current.panel.actions.transcribe());
    expect(result.current.panel.status.phase).toBe('uploading');
    await waitFor(() => expect(result.current.panel.status.phase).toBe('transcribing'));
    expect(result.current.panel.status.busy).toBe(true);
    await act(async () => finish({}));
    await waitFor(() =>
      expect(result.current.panel.status).toMatchObject({ phase: 'idle', busy: false }),
    );
  });

  it('warns when the kern converted to no MusicXML', async () => {
    const { result } = await transcribed(context(), {
      content: { kern: '**kern' },
      conversionError: { message: 'bad spine' },
    });
    expect(result.current.panel.status.warning).toBe(
      'Transcoda returned kern text, but MusicXML conversion failed: bad spine',
    );
  });

  it('shows a failed request as an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = context({
      postScoreEditorJson: vi.fn(async () => {
        throw new Error('space asleep');
      }),
    } as never);
    const hook = renderHook(() => useTranscodaTool(ctx));
    act(() => hook.result.current.panel.input.onImageUpload(pick(image())));
    await act(async () => hook.result.current.panel.actions.transcribe());
    expect(hook.result.current.panel.status.error).toBe('space asleep');
    expect(ctx.emitEditorTelemetry).toHaveBeenCalledWith(
      'score_editor_ai_request',
      expect.objectContaining({ outcome: 'failure', error: 'space asleep' }),
    );
  });

  it('clears the previous result when another image is chosen', async () => {
    const { result } = await transcribed(context(), { content: { musicxml: MUSICXML(1) } });
    expect(result.current.panel.result.generatedXml).not.toBe('');
    act(() => result.current.panel.input.onImageUpload(pick(null)));
    expect(result.current.panel.input.imageFile).toBeNull();
    expect(result.current.panel.result).toMatchObject({
      generatedXml: '',
      generatedKern: '',
      payload: null,
    });
  });
});

describe('useTranscodaTool: apply', () => {
  const XML = MUSICXML(1, 2);

  it('warns when there is no MusicXML or nothing to append to', async () => {
    const ctx = context();
    const { result } = renderHook(() => useTranscodaTool(ctx));
    await act(async () => result.current.panel.actions.applyOutput('overwrite'));
    expect(notify.notifyWarning).toHaveBeenCalledWith('No Transcoda MusicXML is available yet.');

    const hook = await transcribed(context(), { content: { musicxml: XML } });
    await act(async () => hook.result.current.panel.actions.applyOutput('append'));
    expect(notify.notifyWarning).toHaveBeenCalledWith(
      'Load a target score before appending Transcoda output.',
    );
  });

  it('opens a new file when no score is loaded', async () => {
    const ctx = context();
    const { result } = await transcribed(ctx, { content: { musicxml: XML } });
    await act(async () => result.current.panel.actions.applyOutput('overwrite'));
    const [file, options] = vi.mocked(ctx.handleFileUpload).mock.calls[0];
    expect(file.name).toBe('transcoda-output.musicxml');
    expect(options).toMatchObject({ telemetrySource: 'transcoda_output' });
    expect(ctx.revealScoreSource).toHaveBeenCalled();
  });

  it('overwrites the open score', async () => {
    const ctx = context({ score: {} } as never);
    const { result } = await transcribed(ctx, { content: { musicxml: XML } });
    await act(async () => result.current.panel.actions.applyOutput('overwrite'));
    expect(ctx.applyXmlToScore).toHaveBeenCalledWith(XML, {
      telemetrySource: 'transcoda_output_overwrite',
    });
  });

  it('appends the transcribed measures to the open score', async () => {
    const ctx = context({ score: {}, resolveXmlContext: vi.fn(async () => MUSICXML(1)) } as never);
    const { result } = await transcribed(ctx, { content: { musicxml: MUSICXML(1, 2) } });
    await act(async () => result.current.panel.actions.applyOutput('append'));
    const [xml, options] = vi.mocked(ctx.applyXmlToScore).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(options).toEqual({
      telemetrySource: 'transcoda_output_append',
      inputFormat: 'musicxml',
    });
    expect(
      new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('measure'),
    ).toHaveLength(3);
  });

  it('reports an append that cannot happen and still clears the loading state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = context({ score: {}, resolveXmlContext: vi.fn(async () => '  ') } as never);
    const { result } = await transcribed(ctx, { content: { musicxml: XML } });
    await act(async () => result.current.panel.actions.applyOutput('append'));
    expect(ctx.applyXmlToScore).not.toHaveBeenCalled();
    expect(notify.notifyError).toHaveBeenCalledWith(
      'Failed to apply Transcoda MusicXML. See console for details.',
    );
    expect(vi.mocked(ctx.setXmlLoading).mock.calls.at(-1)).toEqual([false]);
  });

  it('downloads the MusicXML', async () => {
    const { result } = await transcribed(context(), { content: { musicxml: XML } });
    act(() => result.current.panel.actions.downloadXml());
    expect(download.downloadBlob).toHaveBeenCalledWith(
      XML,
      'transcoda-output.musicxml',
      'application/vnd.recordare.musicxml+xml',
    );
  });

  it('exposes whether append is possible and whether the score is loading', () => {
    const open = renderHook(() =>
      useTranscodaTool(context({ score: {}, xmlLoading: true } as never)),
    );
    expect(open.result.current.panel.apply).toEqual({ busy: true, canAppend: true });
    const closed = renderHook(() => useTranscodaTool(context()));
    expect(closed.result.current.panel.apply).toEqual({ busy: false, canAppend: false });
  });
});
