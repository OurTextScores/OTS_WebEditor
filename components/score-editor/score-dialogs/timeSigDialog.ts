import type { BeamGroupRows, TimeSigProperties } from '../../../lib/webmscore-score-settings-types';
import type { DialogField, DialogSpec, FieldValue } from './dialogSpecs';

/** What `setTimeSigProperties` takes: the dialog's values, groups as rows or 'default' for MuseScore's defaults. */
export type TimeSigUpdate = Partial<Omit<TimeSigProperties, 'groups' | 'defaultGroups'>> & {
  groups?: BeamGroupRows | 'default';
};

const TYPES: { value: TimeSigProperties['type']; label: string }[] = [
  { value: 'normal', label: 'Numbers' },
  { value: 'common', label: 'Common time (𝄴)' },
  { value: 'cut', label: 'Cut time (𝄵)' },
  { value: 'cutBach', label: 'Cut time (Bach)' },
  { value: 'cutTriple', label: 'Cut triple time (9/8)' },
];

const ROWS: { key: keyof BeamGroupRows; label: string; maxState: 1 | 2 | 3 }[] = [
  { key: 'eighth', label: 'Eighth notes', maxState: 1 },
  { key: 'sixteenth', label: '16th notes', maxState: 2 },
  { key: 'thirtySecond', label: '32nd notes', maxState: 3 },
];

const rowsOf = (values: Record<string, FieldValue>): BeamGroupRows => ({
  eighth: String(values.eighth ?? ''),
  sixteenth: String(values.sixteenth ?? ''),
  thirtySecond: String(values.thirtySecond ?? ''),
});

const sameRows = (a: BeamGroupRows, b: BeamGroupRows) =>
  a.eighth === b.eighth && a.sixteenth === b.sixteenth && a.thirtySecond === b.thirtySecond;

/**
 * MuseScore's Time Signature Properties (TimeSigPropertiesDialog): appearance, custom numerator and denominator
 * text, courtesy, and the beam groups, for the selected time signature and its partners on the other staves.
 * Changing the signature's value stays with the palette and Add ▸ Time Signature, as everywhere else in OTS.
 */
export const timeSigPropertiesDialog: DialogSpec = {
  title: 'Time Signature Properties',
  submitLabel: 'Apply',
  async load(engine) {
    const p = await engine.getTimeSigProperties();
    if (!p.groups || !p.defaultGroups) throw new Error('Select a time signature first.');
    const defaults = p.defaultGroups;
    const fields: DialogField[] = [
      { kind: 'heading', key: 'appearance', label: `Appearance (${p.numerator}/${p.denominator})` },
      { kind: 'select', key: 'type', label: 'Shown as', options: TYPES },
      { kind: 'text', key: 'numeratorText', label: 'Numerator text' },
      { kind: 'text', key: 'denominatorText', label: 'Denominator text' },
      { kind: 'boolean', key: 'showCourtesy', label: 'Show courtesy time signature' },
      { kind: 'heading', key: 'beams', label: 'Beam groups' },
      // A row with fewer than two notes (an eighth row in 1/8) has nothing to group.
      ...ROWS.filter((row) => p.groups![row.key].length > 1).map(
        (row): DialogField => ({ kind: 'beamGroups', key: row.key, label: row.label, maxState: row.maxState }),
      ),
      { kind: 'boolean', key: 'resetGroups', label: 'Reset beam groups to the defaults' },
    ];
    return {
      fields,
      values: {
        type: p.type ?? 'normal',
        numeratorText: p.numeratorText ?? '',
        denominatorText: p.denominatorText ?? '',
        showCourtesy: Boolean(p.showCourtesy),
        ...p.groups,
        resetGroups: false,
        // Kept for apply: groups equal to the defaults are written as 'default', so an untouched dialog adds none.
        defaultEighth: defaults.eighth,
        defaultSixteenth: defaults.sixteenth,
        defaultThirtySecond: defaults.thirtySecond,
      },
    };
  },
  async apply(engine, values) {
    const rows = rowsOf(values);
    const defaults: BeamGroupRows = {
      eighth: String(values.defaultEighth ?? ''),
      sixteenth: String(values.defaultSixteenth ?? ''),
      thirtySecond: String(values.defaultThirtySecond ?? ''),
    };
    const type = TYPES.find((t) => t.value === values.type)?.value ?? 'normal';
    return Boolean(
      await engine.setTimeSigProperties({
        type,
        numeratorText: String(values.numeratorText ?? ''),
        denominatorText: String(values.denominatorText ?? ''),
        showCourtesy: Boolean(values.showCourtesy),
        groups: values.resetGroups || sameRows(rows, defaults) ? 'default' : rows,
      }),
    );
  },
};
