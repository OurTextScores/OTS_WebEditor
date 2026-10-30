import { describe, expect, it, vi } from 'vitest';
import type { StyleValue } from '../../lib/webmscore-loader';
import type { TextStyleEntry } from '../../lib/webmscore-score-settings-types';
import {
  changeInstrumentDialog,
  harpPedalsDialog,
  timeSigPropertiesDialog,
  staffTextPropertiesDialog,
  systemTextPropertiesDialog,
  measurePropertiesDialog,
  staffPropertiesDialog,
  pageSettingsDialog,
  realizeHarmonyDialog,
  selectMoreDialog,
  STYLE_PAGES,
  styleDialog,
  textFontFor,
  type DialogEngine,
} from '../../components/score-editor/score-dialogs';

function engine(
  style: Record<string, StyleValue> = {},
  defaults: Record<string, StyleValue> = {},
): DialogEngine & {
  [K in keyof DialogEngine]: ReturnType<typeof vi.fn>;
} {
  return {
    getStyleValues: vi.fn(async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in style).map((k) => [k, style[k]]))),
    setStyleValues: vi.fn(async () => true),
    getTextStyleCatalog: vi.fn(async (): Promise<TextStyleEntry[]> => []),
    getStyleDefaults: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => k in defaults).map((k) => [k, defaults[k]])),
    ),
    getMeasureProperties: vi.fn(async () => ({
      index: 1,
      actual: [4, 4] as [number, number],
      nominal: [4, 4] as [number, number],
      irregular: false,
      repeatCount: 2,
      breakMmr: false,
      stretch: 1,
      numberMode: 0,
      numberOffset: 0,
      staves: [{ name: 'Piano', visible: true, stemless: false }],
    })),
    setMeasureProperties: vi.fn(async () => true),
    getHarpPedalState: vi.fn(async () => ({ pedals: ['natural', 'natural', 'natural', 'natural', 'natural', 'natural', 'natural'], isDiagram: true })),
    setHarpPedalState: vi.fn(async () => true),
    getTimeSigProperties: vi.fn(async () => ({
      type: 'normal' as const,
      numerator: 4,
      denominator: 4,
      numeratorText: '',
      denominatorText: '',
      showCourtesy: true,
      groups: { eighth: '10001000', sixteenth: '1000100010001000', thirtySecond: '10001000100010001000100010001000' },
      defaultGroups: { eighth: '10001000', sixteenth: '1000100010001000', thirtySecond: '10001000100010001000100010001000' },
    })),
    setTimeSigProperties: vi.fn(async () => true),
    getStaffTextSwing: vi.fn(async () => ({ system: false, swing: false, unit: 'eighth' as const, ratio: 60 })),
    setStaffTextSwing: vi.fn(async () => true),
    selectWithOptions: vi.fn(async () => true),
    realizeChordSymbols: vi.fn(async () => true),
    getStaffProperties: vi.fn(async () => ({
      partName: 'Piano',
      longName: 'Piano',
      shortName: 'Pno.',
      visible: true,
      small: false,
      lines: 5,
      invisibleLines: false,
      cutaway: false,
      hideWhenEmpty: 0,
    })),
    setStaffProperties: vi.fn(async () => true),
    changeInstrumentAt: vi.fn(async () => true),
    selectedStaffIdx: vi.fn(async () => 1),
  };
}

describe('Page Settings', () => {
  const a4 = {
    pageWidth: 8.27,
    pageHeight: 11.69,
    pageOddTopMargin: 0.5,
    pageOddBottomMargin: 0.5,
    pageOddLeftMargin: 0.59,
    pageEvenTopMargin: 0.5,
    pageEvenBottomMargin: 0.5,
    pageEvenLeftMargin: 0.59,
    pageTwosided: true,
    spatium: 82.67716535433071,
  };

  it('shows the engine’s inches and spatium units in mm', async () => {
    const { values } = await pageSettingsDialog.load(engine(a4), {});
    expect(values).toMatchObject({ pageWidth: 210.06, pageHeight: 296.93, pageTwosided: true, spatium: 1.75 });
  });

  it('writes mm back as the engine’s units, in one edit', async () => {
    const e = engine(a4);
    const { values } = await pageSettingsDialog.load(e, {});
    expect(await pageSettingsDialog.apply(e, { ...values, pageWidth: 254, spatium: 2 }, {})).toBe(true);
    expect(e.setStyleValues).toHaveBeenCalledOnce();
    const written = e.setStyleValues.mock.calls[0][0] as Record<string, number>;
    expect(written.pageWidth).toBeCloseTo(10);
    expect(written.spatium).toBeCloseTo(2 * (1200 / 25.4));
  });
});

describe('Style', () => {
  it('offers only the keys this engine knows', async () => {
    const { fields } = await styleDialog.load(engine({ staffDistance: 6.5, musicalSymbolFont: 'Leland' }), {});
    const keys = fields.filter((f) => f.kind !== 'heading' && f.kind !== 'page').map((f) => f.key);
    expect(keys).toEqual(['musicalSymbolFont', 'staffDistance']);
    // One page each, in MuseScore's order: Score, then Spacing.
    expect(fields.filter((f) => f.kind === 'page').map((f) => f.label)).toEqual(['Score', 'Spacing']);
  });

  it('switches the text font with the music font, as MuseScore pairs them', async () => {
    const e = engine({ musicalSymbolFont: 'Leland' });
    await styleDialog.apply(e, { musicalSymbolFont: 'Emmentaler' }, {});
    expect(e.setStyleValues).toHaveBeenCalledWith({ musicalSymbolFont: 'Emmentaler', musicalTextFont: 'MScore Text' });
    expect(textFontFor('Petaluma')).toBe('Petaluma Text');
  });
});

describe('Style: MuseScore’s pages (E08)', () => {
  it('is generated from MuseScore’s Style dialog, page by page in its order', () => {
    const codes = STYLE_PAGES.map((p) => p.code);
    expect(codes.slice(0, 3)).toEqual(['score', 'spacing', 'sizes']);
    expect(codes.indexOf('measure-number')).toBeLessThan(codes.indexOf('system'));
    expect(STYLE_PAGES.reduce((n, p) => n + p.fields.length, 0)).toBeGreaterThan(200);
    // Concert pitch is a command in MuseScore (it transposes), not a plain style value.
    expect(STYLE_PAGES.flatMap((p) => p.fields).some((f) => f.key === 'concertPitch')).toBe(false);
  });

  it('shows percentages and returns fractions, and gives each setting its default for reset', async () => {
    const e = engine({ swingRatio: 60, lyricsDashMaxLength: 0.8 }, { lyricsDashMaxLength: 0.8 });
    const percentKey = STYLE_PAGES.flatMap((p) => p.fields).find((f) => f.percent)!.key;
    const e2 = engine({ [percentKey]: 0.5 }, { [percentKey]: 1 });
    const loaded = await styleDialog.load(e2, {});
    expect(loaded.values[percentKey]).toBe(50);
    expect(loaded.defaults?.[percentKey]).toBe(100);
    await styleDialog.apply(e2, { ...loaded.values, [percentKey]: 75 }, {});
    expect(e2.setStyleValues).toHaveBeenCalledWith({ [percentKey]: 0.75 });
    expect((await styleDialog.load(e, {})).defaults).toEqual({ lyricsDashMaxLength: 0.8 });
  });

  it('heads a group once, but not the page’s own box nor a box that is itself a checkbox', async () => {
    const e = engine({ musicalSymbolFont: 'Leland', hideEmptyStaves: true, dontHideStavesInFirstSystem: false, hideInstrumentNameIfOneInstrument: true });
    const { fields } = await styleDialog.load(e, {});
    const headings = fields.filter((f) => f.kind === 'heading').map((f) => f.label);
    expect(headings).toEqual(['Instrument names']);
  });

  it('shows an offset as two number fields, and writes back both axes, keeping the one not edited', async () => {
    const e = engine({ hairpinPosAbove: [0, -1.75] }, { hairpinPosAbove: [0, -2] });
    const loaded = await styleDialog.load(e, {});
    const keys = loaded.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['hairpinPosAbove:x', 'hairpinPosAbove:y']));
    expect(loaded.values['hairpinPosAbove:y']).toBe(-1.75);
    expect(loaded.defaults?.['hairpinPosAbove:y']).toBe(-2);
    await styleDialog.apply(e, { ...loaded.values, 'hairpinPosAbove:y': -3 }, {});
    expect(e.setStyleValues).toHaveBeenCalledWith({ hairpinPosAbove: [0, -3] });
  });

  it('edits only the y of a point MuseScore shows as one number (volta position)', async () => {
    const e = engine({ voltaPosAbove: [0, -3] });
    const loaded = await styleDialog.load(e, {});
    expect(loaded.values.voltaPosAbove).toBe(-3);
    await styleDialog.apply(e, { ...loaded.values, voltaPosAbove: -2.5 }, {});
    expect(e.setStyleValues).toHaveBeenCalledWith({ voltaPosAbove: [0, -2.5] });
  });

  it('writes a two-way choice (MuseScore’s radio pairs) as a boolean', async () => {
    const e = engine({ frenchStyleBeams: false });
    const loaded = await styleDialog.load(e, {});
    expect(loaded.fields.find((f) => f.key === 'frenchStyleBeams')).toMatchObject({ kind: 'select' });
    await styleDialog.apply(e, { ...loaded.values, frenchStyleBeams: 'true' }, {});
    expect(e.setStyleValues).toHaveBeenCalledWith({ frenchStyleBeams: true });
  });

  it('sends only the settings that changed, with choices as the engine’s numbers', async () => {
    const e = engine({ tupletBracketType: 0, hideEmptyStaves: false, staffDistance: 6.5 });
    const loaded = await styleDialog.load(e, {});
    const tuplet = loaded.fields.find((f) => f.key === 'tupletBracketType');
    expect(tuplet).toMatchObject({ kind: 'select' });
    await styleDialog.apply(e, { ...loaded.values, tupletBracketType: '2' }, {});
    expect(e.setStyleValues).toHaveBeenCalledWith({ tupletBracketType: 2 });
    e.setStyleValues.mockClear();
    await styleDialog.apply(e, loaded.values, {});
    expect(e.setStyleValues).not.toHaveBeenCalled();
  });
});

describe('Measure Properties', () => {
  it('reads the bar into fields, one visible/stemless pair per staff', async () => {
    const { fields, values } = await measurePropertiesDialog.load(engine(), {});
    expect(values).toMatchObject({ actualNumerator: 4, actualDenominator: '4', staff0Visible: true, staff0Stemless: false });
    expect(fields.map((f) => f.key)).toContain('staff0Stemless');
  });

  it('writes the bar back, clamping counts', async () => {
    const e = engine();
    const { values } = await measurePropertiesDialog.load(e, {});
    await measurePropertiesDialog.apply(e, { ...values, actualNumerator: 3, repeatCount: 0, staff0Visible: false }, {});
    expect(e.setMeasureProperties).toHaveBeenCalledWith(
      expect.objectContaining({ actual: [3, 4], repeatCount: 2, staves: [{ name: '', visible: false, stemless: false }] }),
    );
  });

  it('says to select a bar when there is none', async () => {
    const e = engine();
    e.getMeasureProperties.mockResolvedValueOnce({});
    await expect(measurePropertiesDialog.load(e, {})).rejects.toThrow('Select a bar first.');
  });
});

describe('Select ▸ More…', () => {
  it('adds the note filters for a note, as MuseScore’s Select Note dialog', async () => {
    const element = (await selectMoreDialog.load(engine(), {})).fields.map((f) => f.key);
    const note = (await selectMoreDialog.load(engine(), { note: true })).fields.map((f) => f.key);
    expect(element).not.toContain('samePitch');
    expect(note).toContain('samePitch');
  });

  it('sends only the ticked filters, patterned on the right-clicked point', async () => {
    const e = engine();
    const { values } = await selectMoreDialog.load(e, {});
    await selectMoreDialog.apply(e, { ...values, sameStaff: true, mode: 'add' }, { at: { page: 0, x: 3, y: 4 } });
    expect(e.selectWithOptions).toHaveBeenCalledWith(0, 3, 4, { mode: 'add', sameStaff: true });
  });
});

describe('Realize Chord Symbols', () => {
  it('passes literal, voicing and duration as the engine numbers them', async () => {
    const e = engine();
    await realizeHarmonyDialog.apply(e, { literal: false, voicing: '2', duration: '1' }, {});
    expect(e.realizeChordSymbols).toHaveBeenCalledWith(false, 2, 1);
  });
});

describe('Staff/Part Properties', () => {
  it('edits the right-clicked staff, else the selection’s', async () => {
    const e = engine();
    await staffPropertiesDialog.load(e, { staffIdx: 3 });
    expect(e.getStaffProperties).toHaveBeenCalledWith(3);
    const { values } = await staffPropertiesDialog.load(e, {});
    expect(e.getStaffProperties).toHaveBeenLastCalledWith(1);
    await staffPropertiesDialog.apply(e, { ...values, shortName: 'Pf.', lines: 40, small: true }, {});
    expect(e.setStaffProperties).toHaveBeenCalledWith(1, expect.objectContaining({ shortName: 'Pf.', lines: 14, small: true }));
  });

  it('says to select a staff when nothing is on one', async () => {
    const e = engine();
    e.selectedStaffIdx.mockResolvedValueOnce(null);
    await expect(staffPropertiesDialog.load(e, {})).rejects.toThrow('Select something on a staff first.');
  });
});

describe('Select Instrument…', () => {
  it('offers the loaded instruments and changes to the chosen one', async () => {
    const e = engine();
    const context = { instruments: [{ id: 'flute', name: 'Flute', group: 'Woodwinds' }] };
    const { fields, values } = await changeInstrumentDialog.load(e, context);
    expect(fields[0]).toMatchObject({ options: [{ value: 'flute', label: 'Woodwinds: Flute' }] });
    await changeInstrumentDialog.apply(e, values, context);
    expect(e.changeInstrumentAt).toHaveBeenCalledWith('flute');
  });
});

describe('Style: measure numbers and multimeasure rests (E16)', () => {
  it('offers the measure-number keys the engine knows, and writes whole numbers back', async () => {
    const e = engine({ showMeasureNumber: true, measureNumberInterval: 5, measureNumberSystem: true });
    const { fields } = await styleDialog.load(e, {});
    expect(fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(['measure-number', 'showMeasureNumber', 'measureNumberInterval', 'measureNumberSystem']),
    );
    await styleDialog.apply(e, { measureNumberInterval: 4, measureNumberSystem: false }, {});
    expect(e.setStyleValues).toHaveBeenCalledWith({ measureNumberInterval: 4, measureNumberSystem: false });
  });
});

describe('Style: chord symbols (E13)', () => {
  it('offers the chord-symbol presentation keys the engine knows', async () => {
    const e = engine({ verticallyStackModifiers: false, chordModifierMag: 1, lowerCaseMinorChords: false });
    const keys = (await styleDialog.load(e, {})).fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(['chord-symbols', 'verticallyStackModifiers', 'chordModifierMag', 'lowerCaseMinorChords']),
    );
    expect(keys).not.toContain('chordBassNoteStagger');
  });
});

describe('Harp Pedals (E21)', () => {
  it('reads the pedals in MuseScore’s D C B | E F G A order and writes them back with the form', async () => {
    const e = engine();
    e.getHarpPedalState.mockResolvedValue({
      pedals: ['flat', 'natural', 'sharp', 'natural', 'natural', 'natural', 'flat'],
      isDiagram: true,
    });
    const { fields, values } = await harpPedalsDialog.load(e, {});
    expect(fields.filter((f) => f.kind === 'select').map((f) => f.label)).toEqual(['D', 'C', 'B', 'E', 'F', 'G', 'A']);
    expect(values).toMatchObject({ pedalD: 'flat', pedalB: 'sharp', pedalA: 'flat', isDiagram: true });
    await harpPedalsDialog.apply(e, { ...values, pedalC: 'sharp', isDiagram: false }, {});
    expect(e.setHarpPedalState).toHaveBeenCalledWith({
      pedals: ['flat', 'sharp', 'sharp', 'natural', 'natural', 'natural', 'flat'],
      isDiagram: false,
    });
  });

  it('says to select a diagram when none is selected', async () => {
    const e = engine();
    e.getHarpPedalState.mockResolvedValue({});
    await expect(harpPedalsDialog.load(e, {})).rejects.toThrow(/harp pedal diagram/);
  });
});

describe('Time Signature Properties', () => {
  it('shows the appearance, courtesy and a beam-group row per note value', async () => {
    const e = engine();
    const { fields, values } = await timeSigPropertiesDialog.load(e, {});
    expect(fields.filter((f) => f.kind === 'beamGroups').map((f) => f.key)).toEqual(['eighth', 'sixteenth', 'thirtySecond']);
    expect(values).toMatchObject({ type: 'normal', showCourtesy: true, eighth: '10001000', resetGroups: false });
  });

  it('writes untouched groups as the defaults, so applying adds no explicit grouping', async () => {
    const e = engine();
    const { values } = await timeSigPropertiesDialog.load(e, {});
    await timeSigPropertiesDialog.apply(e, { ...values, type: 'common' }, {});
    expect(e.setTimeSigProperties).toHaveBeenCalledWith(expect.objectContaining({ type: 'common', groups: 'default' }));
  });

  it('writes edited groups as rows, and Reset as the defaults', async () => {
    const e = engine();
    const { values } = await timeSigPropertiesDialog.load(e, {});
    await timeSigPropertiesDialog.apply(e, { ...values, eighth: '10101010' }, {});
    expect(e.setTimeSigProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({ groups: expect.objectContaining({ eighth: '10101010' }) }),
    );
    await timeSigPropertiesDialog.apply(e, { ...values, eighth: '10101010', resetGroups: true }, {});
    expect(e.setTimeSigProperties).toHaveBeenLastCalledWith(expect.objectContaining({ groups: 'default' }));
  });

  it('says to select a time signature when none is selected', async () => {
    const e = engine();
    e.getTimeSigProperties.mockResolvedValue({});
    await expect(timeSigPropertiesDialog.load(e, {})).rejects.toThrow(/time signature/);
  });
});

describe('Staff/System Text Properties: swing', () => {
  it('reads a text without swing as unset, at MuseScore’s 60%', async () => {
    const e = engine();
    const { fields, values } = await staffTextPropertiesDialog.load(e, {});
    expect(fields.map((f) => f.key)).toEqual(['swing', 'unit', 'ratio']);
    expect(values).toEqual({ swing: false, unit: 'eighth', ratio: 60 });
  });

  it('writes eighth swing, clamping the ratio to the dialog’s 25–99%', async () => {
    const e = engine();
    await systemTextPropertiesDialog.apply(e, { swing: true, unit: 'eighth', ratio: 120 }, {});
    expect(e.setStaffTextSwing).toHaveBeenCalledWith({ swing: true, unit: 'eighth', ratio: 99 });
    await systemTextPropertiesDialog.apply(e, { swing: true, unit: 'sixteenth', ratio: 10 }, {});
    expect(e.setStaffTextSwing).toHaveBeenLastCalledWith({ swing: true, unit: 'sixteenth', ratio: 25 });
  });

  it('titles the dialog by the text’s kind, as MuseScore does', () => {
    expect(staffTextPropertiesDialog.title).toBe('Staff Text Properties');
    expect(systemTextPropertiesDialog.title).toBe('System Text Properties');
  });

  it('says to select a staff or system text when none is selected', async () => {
    const e = engine();
    e.getStaffTextSwing.mockResolvedValue({});
    await expect(staffTextPropertiesDialog.load(e, {})).rejects.toThrow(/staff or system text/);
  });
});

describe('Style: text styles (E08)', () => {
  const TITLE: TextStyleEntry = {
    name: 'Title',
    keys: {
      fontFace: 'titleFontFace',
      fontSize: 'titleFontSize',
      fontStyle: 'titleFontStyle',
      align: 'titleAlign',
      offset: 'titleOffset',
      color: 'titleColor',
      frameType: 'titleFrameType',
    },
  };
  const TITLE_VALUES: Record<string, StyleValue> = {
    titleFontFace: 'Edwin',
    titleFontSize: 22,
    titleFontStyle: 1,
    titleAlign: [2, 0],
    titleOffset: [0, 0],
    titleColor: '#000000FF',
    titleFrameType: 0,
  };

  it('adds a sub-page per text style, with MuseScore’s controls for each part', async () => {
    const e = engine(TITLE_VALUES, { ...TITLE_VALUES, titleFontStyle: 0 });
    e.getTextStyleCatalog.mockResolvedValue([TITLE]);
    const loaded = await styleDialog.load(e, {});
    expect(loaded.fields.find((f) => f.kind === 'page' && f.label === 'Title')).toMatchObject({ level: 1 });
    expect(loaded.values).toMatchObject({
      titleFontFace: 'Edwin',
      titleFontSize: 22,
      'titleFontStyle:bold': true,
      'titleFontStyle:italic': false,
      'titleAlign:h': '2',
      'titleAlign:v': '0',
      titleColor: '#000000FF',
      titleFrameType: '0',
    });
    expect(loaded.defaults?.['titleFontStyle:bold']).toBe(false);
  });

  it('writes parts back into their style keys, typed as the engine stores them', async () => {
    const e = engine(TITLE_VALUES);
    e.getTextStyleCatalog.mockResolvedValue([TITLE]);
    const loaded = await styleDialog.load(e, {});
    await styleDialog.apply(
      e,
      {
        ...loaded.values,
        'titleFontStyle:italic': true,
        'titleAlign:v': '3',
        titleFontSize: 24,
        titleColor: '#FF0000FF',
        titleFrameType: '1',
      },
      {},
    );
    expect(e.setStyleValues).toHaveBeenCalledWith({
      titleFontStyle: 3,
      titleAlign: [2, 3],
      titleFontSize: 24,
      titleColor: '#FF0000FF',
      titleFrameType: 1,
    });
  });
});
