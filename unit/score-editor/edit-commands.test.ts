// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as exports_ from '../../components/score-editor/commands/export';
import * as marks from '../../components/score-editor/commands/marks-and-lines';
import * as measures from '../../components/score-editor/commands/measures';
import * as pitch from '../../components/score-editor/commands/pitch-and-duration';
import * as text from '../../components/score-editor/commands/text-annotations';
import type { EditorCore } from '../../components/score-editor/core';

const notices = vi.hoisted(() => ({
  notifyWarning: vi.fn(),
  notifyError: vi.fn(),
  notify: vi.fn(),
  promptDialog: vi.fn(async () => 'typed' as string | null),
}));
vi.mock('../../components/shell/notices', () => notices);
vi.mock('../../components/score-editor/download-blob', () => ({ downloadBlob: vi.fn() }));

/**
 * What each editor command does, recorded when the handlers left ScoreEditor (W4 S5): the label it
 * hands performMutation, the options it sets, whether it syncs the selection into the engine
 * first, and the engine call it makes. `incrementalLayout` marks the edits whose incremental layout
 * the layout oracle verified (W7.1); the ones without it still pay for a full relayout.
 */
const MODULES = { pitch, measures, marks, text, exports: exports_ } as Record<
  string,
  Record<string, (...args: never[]) => unknown>
>;

type Recorded = { label?: string; options?: unknown; ensured: number; engine: unknown[] };

function recordingCore(over: Partial<EditorCore> = {}) {
  const rec: Recorded = { ensured: 0, engine: [] };
  const method =
    (name: string) =>
    (...args: unknown[]) => {
      rec.engine.push([name, ...args]);
      return true;
    };
  const score = new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === 'string' ? method(prop) : undefined) },
  );
  const core = {
    score,
    selectedElement: null,
    selectedPoint: null,
    selectionBoxes: [],
    noteInputActiveRef: { current: false },
    scoreRef: { current: score },
    ensureSelectionInWasm: async () => {
      rec.ensured += 1;
    },
    requireMutation: (name: string) => method(`require:${name}`),
    performMutation: async (label: string, action?: () => unknown, options?: unknown) => {
      rec.label = label;
      rec.options = options;
      return action?.();
    },
    runSerializedScoreOperation: async (operation: () => unknown) => operation(),
    ...over,
  } as unknown as EditorCore;
  return { core, rec };
}

type Row = [
  keyof typeof MODULES,
  string,
  unknown[],
  { label?: string | null; options?: unknown; ensured: number; engine: unknown[] },
];
const TABLE: Row[] = [
  [
    'pitch',
    'transpose',
    [2],
    {
      label: 'transpose 2 semitones',
      options: { skipWasmReselect: true, playSelectionPreview: true, incrementalLayout: true },
      ensured: 0,
      engine: [['require:transpose', 1, 0, 0, 4, true, true, true]],
    },
  ],
  [
    'pitch',
    'setAccidental',
    [1],
    {
      label: 'set accidental 1',
      options: { playSelectionPreview: true, incrementalLayout: true },
      ensured: 1,
      engine: [['require:setAccidental', 1]],
    },
  ],
  [
    'pitch',
    'durationLonger',
    [],
    {
      label: 'lengthen duration',
      options: { playSelectionPreview: true },
      ensured: 1,
      engine: [['require:doubleDuration']],
    },
  ],
  [
    'pitch',
    'durationShorter',
    [],
    {
      label: 'shorten duration',
      options: { playSelectionPreview: true },
      ensured: 1,
      engine: [['require:halfDuration']],
    },
  ],
  [
    'pitch',
    'toggleDot',
    [],
    {
      label: 'toggle dot',
      options: { playSelectionPreview: true },
      ensured: 1,
      engine: [['require:toggleDot']],
    },
  ],
  [
    'pitch',
    'toggleDoubleDot',
    [],
    {
      label: 'toggle double dot',
      options: { playSelectionPreview: true },
      ensured: 1,
      engine: [['require:toggleDoubleDot']],
    },
  ],
  [
    'pitch',
    'setDurationType',
    [5],
    {
      label: 'set duration',
      options: { playSelectionPreview: true },
      ensured: 1,
      engine: [['require:setDurationType', 5]],
    },
  ],
  [
    'pitch',
    'addPitchByStep',
    [3, true],
    {
      label: 'add pitch',
      options: {
        skipWasmReselect: true,
        skipSelectionFallback: false,
        advanceSelection: false,
        playSelectionPreview: true,
      },
      ensured: 1,
      engine: [['require:addPitchByStep', 3, true, false]],
    },
  ],
  [
    'pitch',
    'enterRest',
    [],
    {
      label: 'enter rest',
      options: { skipWasmReselect: true, skipSelectionFallback: true, advanceSelection: true },
      ensured: 1,
      engine: [['require:enterRest']],
    },
  ],
  [
    'pitch',
    'setInputDuration',
    [4],
    { label: null, options: null, ensured: 0, engine: [['setInputDurationType', 4]] },
  ],
  [
    'pitch',
    'toggleInputDotState',
    [],
    { label: null, options: null, ensured: 0, engine: [['toggleInputDot']] },
  ],
  [
    'pitch',
    'setInputAccidental',
    [2],
    { label: null, options: null, ensured: 0, engine: [['setInputAccidentalType', 2]] },
  ],
  [
    'pitch',
    'addNoteFromRest',
    [],
    {
      label: 'add note',
      options: { playSelectionPreview: true },
      ensured: 1,
      engine: [['require:addNoteFromRest']],
    },
  ],
  [
    'pitch',
    'addTuplet',
    [3],
    { label: 'add tuplet 3', options: null, ensured: 1, engine: [['require:addTuplet', 3]] },
  ],
  [
    'pitch',
    'addGraceNote',
    [1],
    {
      label: 'add grace note 1',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addGraceNote', 1]],
    },
  ],
  [
    'pitch',
    'setNoteheadGroup',
    [1],
    {
      label: 'set notehead group',
      options: null,
      ensured: 1,
      engine: [['require:setNoteheadGroup', 1]],
    },
  ],
  [
    'pitch',
    'setBeamMode',
    [2],
    { label: 'set beam mode', options: null, ensured: 1, engine: [['require:setBeamMode', 2]] },
  ],
  [
    'pitch',
    'flipStem',
    [],
    {
      label: 'flip stem',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:flipStem']],
    },
  ],
  [
    'pitch',
    'addTie',
    [],
    {
      label: 'add tie',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addTie']],
    },
  ],
  [
    'pitch',
    'addSlur',
    [],
    {
      label: 'add slur',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addSlur']],
    },
  ],
  [
    'measures',
    'deleteSelection',
    [],
    {
      label: 'delete selection',
      options: { clearSelection: true },
      ensured: 1,
      engine: [['require:deleteSelection']],
    },
  ],
  [
    'measures',
    'insertMeasures',
    [3, 'end'],
    {
      label: 'insert measures',
      options: null,
      ensured: 1,
      engine: [['require:insertMeasures', 3, 3]],
    },
  ],
  [
    'measures',
    'addPickup',
    [1, 4],
    {
      label: 'add pickup measure',
      options: null,
      ensured: 0,
      engine: [['require:addPickupMeasure', 1, 4]],
    },
  ],
  [
    'measures',
    'removeContainingMeasures',
    [],
    {
      label: 'remove containing measures',
      options: { clearSelection: true, skipWasmReselect: true },
      ensured: 1,
      engine: [['require:removeSelectedMeasures']],
    },
  ],
  [
    'measures',
    'removeTrailingEmptyMeasures',
    [],
    {
      label: 'remove trailing empty measures',
      options: { clearSelection: true, skipWasmReselect: true },
      ensured: 0,
      engine: [['require:removeTrailingEmptyMeasures']],
    },
  ],
  [
    'measures',
    'toggleLineBreak',
    [],
    {
      label: 'toggle line break',
      options: { skipWasmReselect: true },
      ensured: 1,
      engine: [['require:toggleLineBreak']],
    },
  ],
  [
    'measures',
    'togglePageBreak',
    [],
    {
      label: 'toggle page break',
      options: { skipWasmReselect: true },
      ensured: 1,
      engine: [['require:togglePageBreak']],
    },
  ],
  [
    'measures',
    'toggleRepeatStart',
    [],
    {
      label: 'toggle repeat start',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:toggleRepeatStart']],
    },
  ],
  [
    'measures',
    'toggleRepeatEnd',
    [],
    {
      label: 'toggle repeat end',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:toggleRepeatEnd']],
    },
  ],
  [
    'measures',
    'setRepeatCount',
    [2],
    {
      label: 'set repeat count 2',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:setRepeatCount', 2]],
    },
  ],
  [
    'measures',
    'setBarLineType',
    [1],
    {
      label: 'set barline type 1',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:setBarLineType', 1]],
    },
  ],
  [
    'measures',
    'addVolta',
    [2],
    { label: 'add volta 2', options: null, ensured: 1, engine: [['require:addVolta', 2]] },
  ],
  [
    'measures',
    'addMarker',
    [1],
    {
      label: 'add navigation marker',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addMarker', 1]],
    },
  ],
  [
    'measures',
    'addJump',
    [1],
    {
      label: 'add playback jump',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addJump', 1]],
    },
  ],
  [
    'measures',
    'addMeasureRepeat',
    [2],
    {
      label: 'add measure repeat',
      options: { skipWasmReselect: true, skipSelectionFallback: true },
      ensured: 1,
      engine: [['require:addMeasureRepeat', 2]],
    },
  ],
  [
    'marks',
    'addDynamic',
    [3],
    {
      label: 'add dynamic',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addDynamic', 3]],
    },
  ],
  [
    'marks',
    'addHairpin',
    [1],
    {
      label: 'add hairpin',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addHairpin', 1]],
    },
  ],
  [
    'marks',
    'addFermata',
    [1],
    {
      label: 'add fermata',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addFermata', 1]],
    },
  ],
  [
    'marks',
    'addBreath',
    [1],
    {
      label: 'add breath or caesura',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addBreath', 1]],
    },
  ],
  [
    'marks',
    'addArpeggio',
    [1],
    {
      label: 'add arpeggio',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addArpeggio', 1]],
    },
  ],
  [
    'marks',
    'addTremolo',
    [1],
    {
      label: 'add tremolo',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addTremolo', 1]],
    },
  ],
  [
    'marks',
    'addOttava',
    [1],
    {
      label: 'add ottava',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addOttava', 1]],
    },
  ],
  [
    'marks',
    'addTrill',
    [1],
    {
      label: 'add trill line',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addTrill', 1]],
    },
  ],
  [
    'marks',
    'addGlissando',
    [1],
    { label: 'add glissando', options: null, ensured: 1, engine: [['require:addGlissando', 1]] },
  ],
  [
    'marks',
    'addPedal',
    [1],
    {
      label: 'add pedal',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addPedal', 1]],
    },
  ],
  [
    'marks',
    'addSostenutoPedal',
    [],
    {
      label: 'add sostenuto pedal',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addSostenutoPedal']],
    },
  ],
  [
    'marks',
    'addUnaCorda',
    [],
    {
      label: 'add una corda',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addUnaCorda']],
    },
  ],
  [
    'marks',
    'splitPedal',
    [],
    { label: 'split pedal', options: null, ensured: 1, engine: [['require:splitPedal']] },
  ],
  [
    'marks',
    'addTempoText',
    [120],
    {
      label: 'add tempo text',
      options: { clearSelection: true, incrementalLayout: true },
      ensured: 0,
      engine: [['require:addTempoText', 120]],
    },
  ],
  [
    'marks',
    'addArticulation',
    ['articStaccatoAbove'],
    {
      label: 'add articulation articStaccatoAbove',
      options: { incrementalLayout: true },
      ensured: 1,
      engine: [['require:addArticulation', 'articStaccatoAbove']],
    },
  ],
  [
    'marks',
    'addAmbitus',
    [],
    {
      label: 'add ambitus',
      options: { skipWasmReselect: true, skipSelectionFallback: true, incrementalLayout: true },
      ensured: 1,
      engine: [['require:addAmbitus']],
    },
  ],
  [
    'marks',
    'runRangeToolOnSelection',
    ['explode', 'explodeSelection'],
    { label: 'explode', options: null, ensured: 1, engine: [['require:explodeSelection']] },
  ],
  [
    'text',
    'addStaffText',
    [],
    {
      label: 'add staff text',
      options: null,
      ensured: 1,
      engine: [['require:addStaffText', 'typed']],
    },
  ],
  [
    'text',
    'addSystemText',
    [],
    {
      label: 'add system text',
      options: null,
      ensured: 1,
      engine: [['require:addSystemText', 'typed']],
    },
  ],
  [
    'text',
    'addExpressionText',
    [],
    {
      label: 'add expression text',
      options: null,
      ensured: 1,
      engine: [['require:addExpressionText', 'typed']],
    },
  ],
  [
    'text',
    'addLyricText',
    [],
    {
      label: 'add lyric text',
      options: null,
      ensured: 1,
      engine: [['require:addLyricText', 'typed']],
    },
  ],
  [
    'text',
    'addFingeringText',
    [],
    {
      label: 'add fingering text',
      options: null,
      ensured: 1,
      engine: [['require:addFingeringText', 'typed']],
    },
  ],
  [
    'text',
    'addLeftHandGuitarFingeringText',
    [],
    {
      label: 'add left-hand guitar fingering text',
      options: null,
      ensured: 1,
      engine: [['require:addLeftHandGuitarFingeringText', 'typed']],
    },
  ],
  [
    'text',
    'addRightHandGuitarFingeringText',
    [],
    {
      label: 'add right-hand guitar fingering text',
      options: null,
      ensured: 1,
      engine: [['require:addRightHandGuitarFingeringText', 'typed']],
    },
  ],
  [
    'text',
    'addStringNumberText',
    [],
    {
      label: 'add string number text',
      options: null,
      ensured: 1,
      engine: [['require:addStringNumberText', 'typed']],
    },
  ],
  [
    'text',
    'addInstrumentChangeText',
    [],
    {
      label: 'add instrument change text',
      options: null,
      ensured: 1,
      engine: [['require:addInstrumentChangeText', 'typed']],
    },
  ],
  [
    'text',
    'addStickingText',
    [],
    {
      label: 'add sticking text',
      options: null,
      ensured: 1,
      engine: [['require:addStickingText', 'typed']],
    },
  ],
  [
    'text',
    'addFiguredBassText',
    [],
    {
      label: 'add figured bass text',
      options: null,
      ensured: 1,
      engine: [['require:addFiguredBassText', 'typed']],
    },
  ],
  [
    'text',
    'applySelectedText',
    ['hello'],
    {
      label: 'set selected text',
      options: null,
      ensured: 1,
      engine: [['require:setSelectedText', 'hello']],
    },
  ],
  [
    'exports',
    'exportSvg',
    [],
    { label: null, options: null, ensured: 0, engine: [['saveSvg', 0, true]] },
  ],
  ['exports', 'exportPdf', [], { label: null, options: null, ensured: 0, engine: [['savePdf']] }],
  ['exports', 'exportMxl', [], { label: null, options: null, ensured: 0, engine: [['saveMxl']] }],
  [
    'exports',
    'exportMscz',
    [],
    { label: null, options: null, ensured: 0, engine: [['saveMsc', 'mscz']] },
  ],
  [
    'exports',
    'exportMscx',
    [],
    { label: null, options: null, ensured: 0, engine: [['saveMsc', 'mscx']] },
  ],
  [
    'exports',
    'exportMusicXml',
    [],
    { label: null, options: null, ensured: 0, engine: [['saveXml']] },
  ],
  [
    'exports',
    'exportMidi',
    [],
    { label: null, options: null, ensured: 0, engine: [['saveMidi', true, true]] },
  ],
];

describe('editor commands', () => {
  it.each(TABLE)('%s.%s', async (module, name, args, expected) => {
    const { core, rec } = recordingCore();
    await (MODULES[module][name] as (...a: unknown[]) => unknown)(core, ...args);
    expect({
      label: rec.label ?? null,
      options: rec.options ?? null,
      ensured: rec.ensured,
      engine: rec.engine,
    }).toEqual({
      label: expected.label ?? null,
      options: expected.options ?? null,
      ensured: expected.ensured,
      engine: expected.engine,
    });
  });

  it('covers every exported command', () => {
    const covered = new Set(TABLE.map(([module, name]) => `${module}.${name}`));
    const special = new Set(['pitch.transposeEx', 'pitch.setVoice']);
    const exported = Object.entries(MODULES).flatMap(([module, fns]) =>
      Object.keys(fns).map((name) => `${module}.${name}`),
    );
    expect(exported.filter((key) => !covered.has(key) && !special.has(key))).toEqual([]);
  });
});

describe('commands that do more than forward one call', () => {
  it('transposeEx forwards all seven arguments to the engine', async () => {
    const { core, rec } = recordingCore();
    await pitch.transposeEx(core, 1, 2, 3, 4, true, false, true);
    expect(rec.label).toBe('transpose');
    expect(rec.options).toEqual({ skipWasmReselect: true, playSelectionPreview: true });
    expect(rec.engine).toEqual([['require:transpose', 1, 2, 3, 4, true, false, true]]);
  });

  it('setVoice needs a selection, then moves it to the chosen voice (1-based in the label)', async () => {
    const none = recordingCore();
    await pitch.setVoice(none.core, 1);
    expect(notices.notifyWarning).toHaveBeenCalledWith(
      'Select notes or rests to move them to another voice.',
    );
    expect(none.rec.label).toBeUndefined();

    for (const selection of [
      { selectedElement: { x: 1, y: 1, w: 1, h: 1 } },
      { selectionBoxes: [{}] },
    ]) {
      const { core, rec } = recordingCore(selection as never);
      await pitch.setVoice(core, 2);
      expect(rec.label).toBe('change voice 3');
      expect(rec.engine).toEqual([['require:changeSelectedElementsVoice', 2]]);
    }
  });

  it('a text command asks for the text first and does nothing if the prompt is cancelled', async () => {
    notices.promptDialog.mockResolvedValueOnce(null);
    const { core, rec } = recordingCore();
    await text.addStaffText(core);
    expect(rec.label).toBeUndefined();
    expect(notices.promptDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Staff text' }),
    );
  });

  it('insertMeasures never inserts less than one, and rounds down', async () => {
    const { core, rec } = recordingCore();
    await measures.insertMeasures(core, 0.4, 'end');
    expect(rec.engine).toEqual([['require:insertMeasures', 1, 3]]);
    const second = recordingCore();
    await measures.insertMeasures(second.core, 2.9, 'end');
    expect(second.rec.engine).toEqual([['require:insertMeasures', 2, 3]]);
  });

  it('an unavailable engine binding makes the edit a no-op or an undefined result, as before', async () => {
    const missing = {
      score: {},
      ensureSelectionInWasm: async () => {},
      requireMutation: () => null,
      performMutation: async (_l: string, action?: () => unknown) => action?.(),
    } as unknown as EditorCore;
    // these report "no change" (false) so performMutation stops
    expect(await measures.insertMeasures(missing, 1, 'end')).toBe(false);
    expect(await text.applySelectedText(missing, 'x')).toBe(false);
    expect(await marks.runRangeToolOnSelection(missing, 'explode', 'explodeSelection')).toBe(false);
    // these return nothing; performMutation treats that as a change (it only stops on false)
    expect(await marks.addDynamic(missing, 1)).toBeUndefined();
  });
});
