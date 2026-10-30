import type { DialogSpec } from './dialogSpecs';

const UNITS = [
  { value: 'off', label: 'Off' },
  { value: 'eighth', label: 'Eighth' },
  { value: 'sixteenth', label: 'Sixteenth' },
];

/**
 * MuseScore 4.7's Staff Text / System Text Properties (StaffTextPropertiesDialog): its one tab, swing settings.
 * The text starts swing (eighth or sixteenth, at a ratio) or ends it ("Off") for playback from that point.
 */
function staffTextPropertiesSpec(title: string): DialogSpec {
  return {
    title,
    submitLabel: 'Apply',
    description: 'Swing for playback, from this text on.',
    async load(engine) {
      const p = await engine.getStaffTextSwing();
      if (p.system === undefined) throw new Error('Select a staff or system text first.');
      return {
        fields: [
          { kind: 'boolean', key: 'swing', label: 'Set swing' },
          { kind: 'select', key: 'unit', label: 'Swing', options: UNITS },
          { kind: 'number', key: 'ratio', label: 'Swing ratio', min: 25, max: 99, step: 1, unit: '%' },
        ],
        values: { swing: Boolean(p.swing), unit: p.unit ?? 'off', ratio: p.ratio ?? 60 },
      };
    },
    async apply(engine, values) {
      const unit = UNITS.find((u) => u.value === values.unit)?.value ?? 'off';
      const ratio = Math.round(Math.min(99, Math.max(25, Number(values.ratio) || 60)));
      return Boolean(
        await engine.setStaffTextSwing({ swing: Boolean(values.swing), unit: unit as 'off' | 'eighth' | 'sixteenth', ratio }),
      );
    },
  };
}

export const staffTextPropertiesDialog = staffTextPropertiesSpec('Staff Text Properties');
export const systemTextPropertiesDialog = staffTextPropertiesSpec('System Text Properties');
