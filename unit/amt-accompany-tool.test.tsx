import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseMidi, writeMidi, type MidiEvent } from 'midi-file';
import {
  readAccompanySource,
  sliceAccompanySource,
} from '../components/score-editor/ai-tools/amtAccompanySource';
import { useAmtAccompanyTool } from '../components/score-editor/ai-tools/useAmtAccompanyTool';
import type { Score } from '../lib/webmscore-loader';

const midiToMusicXml = vi.hoisted(() => vi.fn());
vi.mock('../components/score-editor/ai-tools/midiToMusicXml', () => ({ midiToMusicXml }));

const PER_BEAT = 480;
const BAR = 4 * PER_BEAT;

/** A score export: conductor + one melody track playing one whole note per bar, from bar 1. */
function scoreMidi(bars: number, pickupTicks = 0): Uint8Array {
  const melody: MidiEvent[] = [{ deltaTime: 0, type: 'trackName', meta: true, text: 'Flute' }];
  let gap = pickupTicks;
  for (let i = 0; i < bars; i += 1) {
    melody.push({ deltaTime: gap, type: 'noteOn', channel: 0, noteNumber: 60 + i, velocity: 80 });
    melody.push({ deltaTime: BAR, type: 'noteOff', channel: 0, noteNumber: 60 + i, velocity: 0 });
    gap = 0;
  }
  melody.push({ deltaTime: 0, type: 'endOfTrack', meta: true });
  return Uint8Array.from(
    writeMidi({
      header: { format: 1, numTracks: 2, ticksPerBeat: PER_BEAT },
      tracks: [
        [
          { deltaTime: 0, type: 'setTempo', meta: true, microsecondsPerBeat: 500_000 },
          { deltaTime: 0, type: 'endOfTrack', meta: true },
        ],
        melody,
      ],
    }),
  );
}

function fakeScore(opts: {
  bars: number;
  pickup?: boolean;
  selection?: { startMeasureIndex: number; endMeasureIndex: number } | null;
}): Score {
  const count = opts.bars + (opts.pickup ? 1 : 0);
  return {
    saveMidi: vi.fn(async () => scoreMidi(opts.bars, opts.pickup ? PER_BEAT : 0)),
    measureSignatures: vi.fn(async () => Array.from({ length: count }, () => '4/4|0|1|x')),
    irregularMeasures: vi.fn(async () =>
      opts.pickup
        ? [{ index: 0, number: '0', pickup: true, actual: '1/4', nominal: '4/4', irregular: true }]
        : [],
    ),
    selectionMeasureRange: vi.fn(async () => opts.selection ?? null),
  } as unknown as Score;
}

const notesOf = (bytes: Uint8Array) => {
  let tick = 0;
  return parseMidi(bytes).tracks[1].flatMap((e) => {
    tick += e.deltaTime;
    return e.type === 'noteOn' ? [[tick, e.noteNumber]] : [];
  });
};

describe('readAccompanySource', () => {
  it('reads the whole score when nothing is selected', async () => {
    const source = await readAccompanySource(fakeScore({ bars: 4 }));
    expect(source.range).toEqual({ start: 0, end: 3 });
    expect(source.tracks).toEqual([{ index: 1, name: 'Flute', noteCount: 4, channels: [0] }]);
    expect(source.warnings).toEqual([]);
  });

  it('cuts the MIDI to the selected bars', async () => {
    const source = await readAccompanySource(
      fakeScore({ bars: 6, selection: { startMeasureIndex: 2, endMeasureIndex: 3 } }),
    );
    expect(notesOf(sliceAccompanySource(source))).toEqual([
      [0, 62],
      [BAR, 63],
    ]);
  });

  it('starts after a pickup and counts bars from its actual length', async () => {
    const source = await readAccompanySource(fakeScore({ bars: 3, pickup: true }));
    expect(source.range).toEqual({ start: 1, end: 3 });
    expect(source.warnings.join(' ')).toMatch(/pickup bar is left out/);
    expect(notesOf(sliceAccompanySource(source))[0]).toEqual([0, 60]);
  });

  it('exports MIDI without expanding repeats, so ticks follow the bars', async () => {
    const score = fakeScore({ bars: 2 });
    await readAccompanySource(score);
    expect(score.saveMidi).toHaveBeenCalledWith(false, true);
  });
});

const GENERATED_XML = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar, Generated Acoustic Guitar (nylon)</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice></note></measure>
  </part>
</score-partwise>`;

const scoreXml = (bars: number) => `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
  <part id="P1">${Array.from(
    { length: bars },
    (_, i) =>
      `<measure number="${i + 1}"><note><rest/><duration>4</duration><voice>1</voice></note></measure>`,
  ).join('')}</part>
</score-partwise>`;

describe('useAmtAccompanyTool', () => {
  function setup() {
    const postScoreEditorJson = vi.fn(async () => ({
      ok: true,
      warnings: ['sent as Flute'],
      generatedParts: [{ instrument: 'Acoustic Guitar (nylon)', noteCount: 1 }],
      content: { musicxml: GENERATED_XML, accompanimentMidiBase64: 'TVRoZA==' },
    }));
    const applyXmlToScore = vi.fn(async () => true);
    const ctx = {
      postScoreEditorJson,
      score: fakeScore({ bars: 3, selection: { startMeasureIndex: 1, endMeasureIndex: 1 } }),
      resolveXmlContext: vi.fn(async () => scoreXml(3)),
      applyXmlToScore,
      setXmlLoading: vi.fn(),
      revealScoreSource: vi.fn(),
    };
    const hook = renderHook(() => useAmtAccompanyTool(ctx));
    return { hook, postScoreEditorJson, applyXmlToScore };
  }

  it('sends the selected bars with the melody track and adds the parts at those bars', async () => {
    const { hook, postScoreEditorJson, applyXmlToScore } = setup();

    await act(async () => hook.result.current.panel.source.readSelection());
    expect(hook.result.current.panel.source.range).toEqual({ start: 2, end: 2 });
    expect(hook.result.current.panel.settings.melodyTrack).toBe(1);

    await act(async () => hook.result.current.panel.actions.generate());
    const [path, body] = postScoreEditorJson.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe('/api/music/infill');
    expect(body).toMatchObject({
      mode: 'accompany',
      melodyTrack: 1,
      model: 'medium-800k',
      historySeconds: 5,
    });
    const sent = Uint8Array.from(Buffer.from(String(body.inputMidiBase64), 'base64'));
    expect(notesOf(sent)).toEqual([[0, 61]]);
    expect(hook.result.current.panel.result?.parts).toEqual([
      { instrument: 'Acoustic Guitar (nylon)', noteCount: 1 },
    ]);
    expect(hook.result.current.panel.status.warnings).toContain('sent as Flute');

    await act(async () => hook.result.current.panel.actions.addToScore());
    const [applied, options] = applyXmlToScore.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(options).toMatchObject({ telemetrySource: 'amt_accompany_apply' });
    const doc = new DOMParser().parseFromString(applied, 'application/xml');
    const parts = Array.from(doc.querySelectorAll('score-partwise > part'));
    expect(parts.map((p) => p.getAttribute('id'))).toEqual(['P1', 'P2']);
    const added = Array.from(parts[1].querySelectorAll(':scope > measure'));
    expect(added).toHaveLength(3);
    expect(added[0].querySelector('rest')).not.toBeNull();
    expect(added[1].querySelector('pitch step')?.textContent).toBe('C');
    expect(added[2].querySelector('rest')).not.toBeNull();
    expect(doc.querySelector('score-part#P2 part-name')?.textContent).toBe(
      'Acoustic Guitar (nylon)',
    );
  });

  it('converts in the browser when the server returned MIDI without MusicXML', async () => {
    const { hook, postScoreEditorJson } = setup();
    postScoreEditorJson.mockResolvedValueOnce({
      ok: true,
      warnings: ['AMT produced MIDI, but the OTS API could not convert it to MusicXML.'],
      conversionError: { message: 'musescore4: not found' },
      generatedParts: [{ instrument: 'Whistle', noteCount: 28 }],
      content: { musicxml: '', accompanimentMidiBase64: 'TVRoZA==' },
    } as never);
    midiToMusicXml.mockResolvedValueOnce(GENERATED_XML);

    await act(async () => hook.result.current.panel.actions.generate());

    expect(midiToMusicXml).toHaveBeenCalledWith(Uint8Array.from([0x4d, 0x54, 0x68, 0x64]));
    expect(hook.result.current.panel.result).toMatchObject({ canAdd: true, canDownload: true });
    expect(hook.result.current.panel.status.warnings).toEqual([]);
  });

  it('reports the server conversion error when the browser cannot convert either', async () => {
    const { hook, postScoreEditorJson } = setup();
    postScoreEditorJson.mockResolvedValueOnce({
      ok: true,
      conversionError: { message: 'musescore4: not found' },
      generatedParts: [],
      content: { musicxml: '', accompanimentMidiBase64: 'TVRoZA==' },
    } as never);
    midiToMusicXml.mockRejectedValueOnce(new Error('no engine'));

    await act(async () => hook.result.current.panel.actions.generate());

    expect(hook.result.current.panel.result).toMatchObject({ canAdd: false, canDownload: true });
    expect(hook.result.current.panel.status.warnings).toContain(
      'MusicXML conversion failed: musescore4: not found',
    );
  });

  it('shows the service error and keeps no result', async () => {
    const { hook, postScoreEditorJson } = setup();
    postScoreEditorJson.mockRejectedValueOnce(new Error('AMT Space generation failed: boom'));
    await act(async () => hook.result.current.panel.actions.generate());
    expect(hook.result.current.panel.status.error).toMatch(/boom/);
    expect(hook.result.current.panel.result).toBeNull();
  });
});
