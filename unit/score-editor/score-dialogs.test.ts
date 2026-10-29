import { describe, expect, it, vi } from 'vitest';
import {
  measurePropertiesDialog,
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
    selectWithOptions: vi.fn(async () => true),
    realizeChordSymbols: vi.fn(async () => true),
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
