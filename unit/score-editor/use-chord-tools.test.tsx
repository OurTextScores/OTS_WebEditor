// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useChordTools,
  type ChordToolsContext,
} from '../../components/score-editor/ai-tools/useChordTools';
import {
  MMA_BLUES_DEMO_TEMPLATE,
  MMA_TEMPLATE_MAX_MEASURES,
} from '../../components/score-editor/ai-constants';

const notify = vi.hoisted(() => ({ notifyWarning: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../components/shell/notices', () => notify);
const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../../components/score-editor/download-blob', () => download);

const XML = (parts = 1, measures = 2) =>
  `<score-partwise><part-list>${Array.from({ length: parts }, (_, p) => `<score-part id="P${p + 1}"><part-name>Part ${p + 1}</part-name></score-part>`).join('')}</part-list>${Array.from(
    { length: parts },
    (_, p) =>
      `<part id="P${p + 1}">${Array.from({ length: measures }, (_, m) => `<measure number="${m + 1}"><note><rest/></note></measure>`).join('')}</part>`,
  ).join('')}</score-partwise>`;

function context(over: Partial<Record<keyof ChordToolsContext, unknown>> = {}) {
  return {
    postScoreEditorJson: vi.fn(async () => ({})),
    setXmlSidebarTab: vi.fn(),
    resolveXmlContext: vi.fn(async () => XML()),
    setXmlLoading: vi.fn(),
    setXmlError: vi.fn(),
    score: null,
    scoreTitle: '',
    handleFileUpload: vi.fn(async () => true),
    applyXmlToScore: vi.fn(async () => true),
    revealScoreSource: vi.fn(),
    codeEditorTheme: 'light',
    ...over,
  } as unknown as ChordToolsContext;
}
const mount = (over?: Parameters<typeof context>[0]) => {
  const ctx = context(over);
  return { ctx, ...renderHook(() => useChordTools(ctx)) };
};
const posted = (ctx: ChordToolsContext, index = 0) =>
  vi.mocked(ctx.postScoreEditorJson).mock.calls[index] as unknown as [
    string,
    Record<string, unknown>,
  ];

beforeEach(() => vi.clearAllMocks());

describe('MMA: starter and template', () => {
  it('fills the script from the chosen starter and clears it for a blank one', () => {
    const { result } = mount();
    act(() => result.current.mmaPanel.config.setStarterPreset('blues'));
    expect(result.current.mmaPanel.config.script).toBe(MMA_BLUES_DEMO_TEMPLATE);
    act(() => result.current.mmaPanel.config.setStarterPreset('blank'));
    expect(result.current.mmaPanel.config.script).toBe('');
    expect(result.current.mmaPanel.config.starterPreset).toBe('blank');
  });

  it('asks the server for a template sized to the score and shows the script and warnings', async () => {
    const { ctx, result } = mount({
      resolveXmlContext: vi.fn(async () => XML(1, 8)),
      postScoreEditorJson: vi.fn(async () => ({
        template: 'Tempo 90\n1 C',
        warnings: ['a', '', 7, 'b'],
      })),
    });
    await act(async () => result.current.mmaPanel.actions.generateTemplate());
    const [path, body] = posted(ctx);
    expect(path).toBe('/api/music/mma/template');
    expect(body).toMatchObject({
      content: XML(1, 8),
      maxMeasures: 8,
      arrangementPreset: 'full-groove',
    });
    expect(result.current.mmaPanel.config.script).toBe('Tempo 90\n1 C');
    expect(result.current.mmaPanel.config.starterPreset).toBe('lead-sheet');
    expect(result.current.mmaPanel.result.warnings).toEqual(['a', 'b']);
    expect(result.current.mmaPanel.status).toMatchObject({ busy: false, error: null });
  });

  it('caps the measure count at the server limit and treats an unreadable score as the limit', async () => {
    const huge = `<part id="P1">${'<measure number="1"/>'.repeat(MMA_TEMPLATE_MAX_MEASURES + 5)}</part>`;
    const { ctx, result } = mount({
      resolveXmlContext: vi.fn(async () => huge),
      postScoreEditorJson: vi.fn(async () => ({ template: 'x' })),
    });
    await act(async () => result.current.mmaPanel.actions.generateTemplate());
    expect(posted(ctx)[1].maxMeasures).toBe(MMA_TEMPLATE_MAX_MEASURES);
  });

  it('warns when no score is loaded, and shows an error when the reply has no script', async () => {
    const none = mount({ resolveXmlContext: vi.fn(async () => '  ') });
    await act(async () => none.result.current.mmaPanel.actions.generateTemplate());
    expect(notify.notifyWarning).toHaveBeenCalledWith(
      'Load a score before generating an MMA starter from MusicXML.',
    );
    expect(none.ctx.postScoreEditorJson).not.toHaveBeenCalled();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const empty = mount({ postScoreEditorJson: vi.fn(async () => ({ template: ' ' })) });
    await act(async () => empty.result.current.mmaPanel.actions.generateTemplate());
    expect(empty.result.current.mmaPanel.status.error).toBe(
      'MMA template response did not include a script.',
    );
  });
});

describe('MMA: render, download and apply', () => {
  const withScript = (over?: Parameters<typeof context>[0]) => {
    const hook = mount(over);
    act(() => hook.result.current.mmaPanel.config.setScript('Groove Swing\n1 C'));
    return hook;
  };

  it('needs a script to render', async () => {
    const { ctx, result } = mount();
    await act(async () => result.current.mmaPanel.actions.render(false));
    expect(notify.notifyWarning).toHaveBeenCalledWith('Enter an MMA script before rendering.');
    expect(ctx.postScoreEditorJson).not.toHaveBeenCalled();
  });

  it('renders to MIDI, and to MusicXML only when asked', async () => {
    const reply = {
      midiBase64: 'TVRoZA==',
      musicxml: '<score-partwise/>',
      warnings: ['w'],
      provenance: { stderr: 'mma: ok' },
    };
    const { ctx, result } = withScript({ postScoreEditorJson: vi.fn(async () => reply) });
    await act(async () => result.current.mmaPanel.actions.render(false));
    expect(posted(ctx)).toEqual([
      '/api/music/mma/render',
      {
        script: 'Groove Swing\n1 C',
        includeMidi: true,
        includeMusicXml: false,
        persistArtifacts: true,
      },
    ]);
    expect(result.current.mmaPanel.result).toMatchObject({
      midiBase64: 'TVRoZA==',
      generatedXml: '',
      warnings: ['w'],
      sanitizedStderr: 'mma: ok',
    });
    await act(async () => result.current.mmaPanel.actions.render(true));
    expect(result.current.mmaPanel.result.generatedXml).toBe('<score-partwise/>');
  });

  it('shows a failed render', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = withScript({
      postScoreEditorJson: vi.fn(async () => {
        throw new Error('mma crashed');
      }),
    });
    await act(async () => result.current.mmaPanel.actions.render(false));
    expect(result.current.mmaPanel.status).toMatchObject({ error: 'mma crashed', busy: false });
  });

  it('downloads each format, or says what is missing', () => {
    const { result } = mount();
    act(() => result.current.mmaPanel.actions.download('mma'));
    expect(notify.notifyWarning).toHaveBeenLastCalledWith(
      'No MMA script is available to download.',
    );
    act(() => result.current.mmaPanel.actions.download('midi'));
    expect(notify.notifyWarning).toHaveBeenLastCalledWith(
      'No rendered MIDI output is available yet.',
    );
    act(() => result.current.mmaPanel.actions.download('musicxml'));
    expect(notify.notifyWarning).toHaveBeenLastCalledWith(
      'No generated MusicXML is available to download.',
    );

    act(() => {
      result.current.mmaPanel.config.setScript('1 C\n\n');
      result.current.mmaPanel.result.setGeneratedXml('<x/>');
    });
    act(() => result.current.mmaPanel.actions.download('mma'));
    expect(download.downloadBlob).toHaveBeenLastCalledWith(
      '1 C\n',
      'accompaniment.mma',
      'text/plain;charset=utf-8',
    );
    act(() => result.current.mmaPanel.actions.download('musicxml'));
    expect(download.downloadBlob).toHaveBeenLastCalledWith(
      '<x/>',
      'accompaniment.musicxml',
      'application/vnd.recordare.musicxml+xml',
    );
  });

  it('downloads rendered MIDI as bytes, and reports bytes that cannot be decoded', async () => {
    const { result } = withScript({
      postScoreEditorJson: vi.fn(async () => ({ midiBase64: 'TVRoZA==' })),
    });
    await act(async () => result.current.mmaPanel.actions.render(false));
    act(() => result.current.mmaPanel.actions.download('midi'));
    const [bytes, name, mime] = download.downloadBlob.mock.calls.at(-1)!;
    expect(Array.from(bytes as Uint8Array)).toEqual([0x4d, 0x54, 0x68, 0x64]); // "MThd"
    expect([name, mime]).toEqual(['accompaniment.mid', 'audio/midi']);
  });

  it('opens the generated MusicXML as a new file named for the score when none is loaded', async () => {
    const ctx = context({ scoreTitle: 'My: Song' });
    const { result } = renderHook(() => useChordTools(ctx));
    act(() => result.current.mmaPanel.result.setGeneratedXml(XML()));
    await act(async () => result.current.mmaPanel.actions.applyOutput());
    const [file, options] = vi.mocked(ctx.handleFileUpload).mock.calls[0];
    expect(file.name).toBe('mma-My_ Song.musicxml');
    expect(options).toMatchObject({ telemetrySource: 'mma_output' });
  });

  it('appends the generated parts to the open score and says how many', async () => {
    const ctx = context({ score: {}, resolveXmlContext: vi.fn(async () => XML(1)) });
    const { result } = renderHook(() => useChordTools(ctx));
    act(() => result.current.mmaPanel.result.setGeneratedXml(XML(2)));
    await act(async () => result.current.mmaPanel.actions.applyOutput());
    const [xml, options] = vi.mocked(ctx.applyXmlToScore).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(options).toEqual({ telemetrySource: 'mma_output_append', inputFormat: 'musicxml' });
    expect(
      new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('part').length,
    ).toBeGreaterThan(1);
    expect(result.current.mmaPanel.result.warnings[0]).toMatch(
      /^Appended \d+ part\(s\) into the current score\.$/,
    );
    expect(ctx.revealScoreSource).toHaveBeenCalled();
  });

  it('warns when there is nothing to apply', async () => {
    const { ctx, result } = mount();
    await act(async () => result.current.mmaPanel.actions.applyOutput());
    expect(notify.notifyWarning).toHaveBeenCalledWith('No generated MusicXML is available yet.');
    expect(ctx.applyXmlToScore).not.toHaveBeenCalled();
  });
});

describe('Chordify (harmony analysis)', () => {
  const tagged = { content: { musicxml: '<tagged/>' }, warnings: ['one'] };

  it('analyses the score and shows the tagged MusicXML', async () => {
    const { ctx, result } = mount({ postScoreEditorJson: vi.fn(async () => tagged) });
    await act(async () => result.current.harmonyPanel.actions.analyze());
    const [path, body] = posted(ctx);
    expect(path).toBe('/api/music/harmony/analyze');
    expect(body).toMatchObject({
      insertHarmony: true,
      persistArtifacts: true,
      existingHarmonyMode: 'fill-missing',
      maxChangesPerMeasure: 2,
    });
    expect(result.current.harmonyPanel.result).toMatchObject({
      generatedXml: '<tagged/>',
      warnings: ['one'],
    });
    expect(result.current.harmonyPanel.status).toMatchObject({ busy: false, error: null });
    expect(ctx.applyXmlToScore).not.toHaveBeenCalled();
  });

  it('keeps changes per measure between 1 and 8', async () => {
    const { ctx, result } = mount({ postScoreEditorJson: vi.fn(async () => tagged) });
    act(() => result.current.harmonyPanel.config.setMaxChangesPerMeasure(99));
    await act(async () => result.current.harmonyPanel.actions.analyze());
    expect(posted(ctx)[1].maxChangesPerMeasure).toBe(8);
    act(() => result.current.harmonyPanel.config.setMaxChangesPerMeasure(0));
    await act(async () => result.current.harmonyPanel.actions.analyze());
    expect(posted(ctx, 1)[1].maxChangesPerMeasure).toBe(1);
  });

  it('can apply the result straight away', async () => {
    const { ctx, result } = mount({ postScoreEditorJson: vi.fn(async () => tagged) });
    await act(async () => result.current.harmonyPanel.actions.analyzeAndApply());
    expect(ctx.applyXmlToScore).toHaveBeenCalledWith('<tagged/>', {
      telemetrySource: 'harmony_analysis_apply',
      inputFormat: 'musicxml',
      enforceJazzHarmonyStyle: true,
    });
    expect(ctx.revealScoreSource).toHaveBeenCalled();
  });

  it('can go on to make an MMA template and switch to that tab', async () => {
    const postScoreEditorJson = vi.fn(async (path: string) =>
      path.includes('harmony') ? tagged : { template: 'Groove x' },
    );
    const { ctx, result } = mount({ postScoreEditorJson });
    await act(async () => result.current.harmonyPanel.actions.analyzeAndGenerateMma());
    expect(vi.mocked(ctx.postScoreEditorJson).mock.calls.map((call) => call[0])).toEqual([
      '/api/music/harmony/analyze',
      '/api/music/mma/template',
    ]);
    expect(posted(ctx, 1)[1].content).toBe('<tagged/>');
    expect(result.current.mmaPanel.config.script).toBe('Groove x');
    expect(ctx.setXmlSidebarTab).toHaveBeenCalledWith('mma');
    expect(result.current.harmonyPanel.status).toMatchObject({ busy: false, mmaBusy: false });
  });

  it('is started from the MMA panel too, and the MMA panel can open this tab', async () => {
    const postScoreEditorJson = vi.fn(async (path: string) =>
      path.includes('harmony') ? tagged : { template: 't' },
    );
    const { ctx, result } = mount({ postScoreEditorJson });
    await act(async () => result.current.mmaPanel.actions.chordifyAndGenerate());
    expect(result.current.mmaPanel.config.script).toBe('t');
    act(() => result.current.mmaPanel.actions.openChordify());
    expect(ctx.setXmlSidebarTab).toHaveBeenLastCalledWith('harmony');
  });

  it('warns for no score, and errors when the reply has no MusicXML', async () => {
    const none = mount({ resolveXmlContext: vi.fn(async () => '') });
    await act(async () => none.result.current.harmonyPanel.actions.analyze());
    expect(notify.notifyWarning).toHaveBeenCalledWith(
      'Load a score before running harmony analysis.',
    );

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const empty = mount({ postScoreEditorJson: vi.fn(async () => ({ content: {} })) });
    await act(async () => empty.result.current.harmonyPanel.actions.analyze());
    expect(empty.result.current.harmonyPanel.status.error).toBe(
      'Harmony analysis did not return tagged MusicXML.',
    );
  });

  it('applies and downloads the tagged MusicXML', async () => {
    const { ctx, result } = mount({
      scoreTitle: 'Etude',
      postScoreEditorJson: vi.fn(async () => tagged),
    });
    await act(async () => result.current.harmonyPanel.actions.applyOutput());
    expect(notify.notifyWarning).toHaveBeenCalledWith('No tagged MusicXML is available yet.');
    await act(async () => result.current.harmonyPanel.actions.analyze());
    act(() => result.current.harmonyPanel.actions.downloadXml());
    expect(download.downloadBlob).toHaveBeenCalledWith(
      '<tagged/>',
      'harmony-Etude.musicxml',
      'application/vnd.recordare.musicxml+xml',
    );
    await act(async () => result.current.harmonyPanel.actions.applyOutput());
    expect(ctx.applyXmlToScore).toHaveBeenCalledWith(
      '<tagged/>',
      expect.objectContaining({ enforceJazzHarmonyStyle: true }),
    );
  });
});

describe('functional harmony', () => {
  const reply = {
    warnings: ['w', ''],
    segments: [{ roman: 'I' }, 'junk', { roman: 'V' }],
    annotatedXml: '<annotated/>',
    exports: { json: '{"a":1}', rntxt: 'm1 I' },
  };

  it('analyses the score into segments and exports', async () => {
    const { ctx, result } = mount({ postScoreEditorJson: vi.fn(async () => reply) });
    await act(async () => result.current.functionalHarmonyPanel.actions.analyze());
    expect(posted(ctx)[0]).toBe('/api/music/functional-harmony/analyze');
    expect(result.current.functionalHarmonyPanel.result).toMatchObject({
      warnings: ['w'],
      segments: [{ roman: 'I' }, { roman: 'V' }],
      annotatedXml: '<annotated/>',
      jsonExport: '{"a":1}',
      rntxtExport: 'm1 I',
    });
  });

  it('downloads each export under a name from the score title, or says what is missing', async () => {
    const { result } = mount({
      scoreTitle: 'Etude',
      postScoreEditorJson: vi.fn(async () => reply),
    });
    act(() => result.current.functionalHarmonyPanel.actions.download('json'));
    expect(notify.notifyWarning).toHaveBeenLastCalledWith(
      'No harmony JSON export is available yet.',
    );
    act(() => result.current.functionalHarmonyPanel.actions.downloadXml());
    expect(notify.notifyWarning).toHaveBeenLastCalledWith(
      'No annotated harmony MusicXML is available yet.',
    );

    await act(async () => result.current.functionalHarmonyPanel.actions.analyze());
    act(() => result.current.functionalHarmonyPanel.actions.download('json'));
    expect(download.downloadBlob).toHaveBeenLastCalledWith(
      '{"a":1}',
      'functional-harmony-Etude.json',
      'application/json',
    );
    act(() => result.current.functionalHarmonyPanel.actions.download('rntxt'));
    expect(download.downloadBlob).toHaveBeenLastCalledWith(
      'm1 I',
      'functional-harmony-Etude.rntxt',
      'text/plain;charset=utf-8',
    );
    act(() => result.current.functionalHarmonyPanel.actions.downloadXml());
    expect(download.downloadBlob).toHaveBeenLastCalledWith(
      '<annotated/>',
      'functional-harmony-Etude.musicxml',
      'application/vnd.recordare.musicxml+xml',
    );
  });

  it('applies the annotated MusicXML', async () => {
    const { ctx, result } = mount({ postScoreEditorJson: vi.fn(async () => reply) });
    await act(async () => result.current.functionalHarmonyPanel.actions.applyOutput());
    expect(notify.notifyWarning).toHaveBeenCalledWith(
      'No annotated harmony MusicXML is available yet.',
    );
    await act(async () => result.current.functionalHarmonyPanel.actions.analyze());
    await act(async () => result.current.functionalHarmonyPanel.actions.applyOutput());
    expect(ctx.applyXmlToScore).toHaveBeenCalledWith('<annotated/>', {
      telemetrySource: 'functional_harmony_apply',
      inputFormat: 'musicxml',
    });
  });

  it('shows a failed analysis', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount({
      postScoreEditorJson: vi.fn(async () => {
        throw new Error('music21 missing');
      }),
    });
    await act(async () => result.current.functionalHarmonyPanel.actions.analyze());
    expect(result.current.functionalHarmonyPanel.status).toMatchObject({
      error: 'music21 missing',
      busy: false,
    });
  });
});
