import { describe, expect, it, vi } from 'vitest';
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
  styleDialog,
  textFontFor,
  type DialogEngine,
} from '../../components/score-editor/score-dialogs';

function engine(style: Record<string, number | boolean | string> = {}): DialogEngine & {
  [K in keyof DialogEngine]: ReturnType<typeof vi.fn>;
} {
  return {
    getStyleValues: vi.fn(async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in style).map((k) => [k, style[k]]))),
    setStyleValues: vi.fn(async () => true),
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
    const keys = fields.filter((f) => f.kind !== 'heading').map((f) => f.key);
    expect(keys).toEqual(['musicalSymbolFont', 'staffDistance']);
  });

  it('switches the text font with the music font, as MuseScore pairs them', async () => {
    const e = engine({ musicalSymbolFont: 'Leland' });
    await styleDialog.apply(e, { musicalSymbolFont: 'Emmentaler' }, {});
    expect(e.setStyleValues).toHaveBeenCalledWith({ musicalSymbolFont: 'Emmentaler', musicalTextFont: 'MScore Text' });
    expect(textFontFor('Petaluma')).toBe('Petaluma Text');
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
      expect.arrayContaining(['measureNumbers', 'showMeasureNumber', 'measureNumberInterval', 'measureNumberSystem']),
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
      expect.arrayContaining(['chordSymbols', 'verticallyStackModifiers', 'chordModifierMag', 'lowerCaseMinorChords']),
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
