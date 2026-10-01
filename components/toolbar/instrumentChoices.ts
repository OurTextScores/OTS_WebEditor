import type { InstrumentTemplate, InstrumentTemplateGroup } from '../Toolbar';

/** Instruments offered first in an add-instrument picker, by template id (first match wins). */
const COMMON_INSTRUMENT_PREFERENCES: readonly { ids: readonly string[]; label?: string }[] = [
  { ids: ['piano'] },
  { ids: ['violin'] },
  { ids: ['viola'] },
  { ids: ['violoncello', 'cello'] },
  { ids: ['double-bass', 'contrabass'], label: 'Double Bass' },
  { ids: ['flute'] },
  { ids: ['oboe'] },
  { ids: ['clarinet'], label: 'Clarinet' },
  { ids: ['bassoon'] },
  { ids: ['trumpet'], label: 'Trumpet' },
  { ids: ['horn'] },
  { ids: ['trombone'] },
  { ids: ['tuba'] },
  { ids: ['alto-saxophone'] },
  { ids: ['tenor-saxophone'] },
  { ids: ['bass-guitar'] },
  { ids: ['guitar-nylon', 'guitar-steel'] },
  { ids: ['voice'] },
  { ids: ['drumset'] },
];

/** Every instrument across the groups, each carrying its group's id and name. */
export function flattenInstrumentGroups(
  groups: readonly InstrumentTemplateGroup[],
): InstrumentTemplate[] {
  return groups.flatMap((group) =>
    group.instruments.map((instrument) => ({
      ...instrument,
      groupName: instrument.groupName ?? group.name,
      groupId: instrument.groupId ?? group.id,
    })),
  );
}

/** The common instruments that exist in `options`, in preference order, once each. */
export function pickCommonInstruments(
  options: readonly InstrumentTemplate[],
): { instrument: InstrumentTemplate; label: string }[] {
  const results: { instrument: InstrumentTemplate; label: string }[] = [];
  const used = new Set<string>();
  for (const preference of COMMON_INSTRUMENT_PREFERENCES) {
    const found = preference.ids
      .map((id) => options.find((instrument) => instrument.id === id))
      .find(Boolean);
    if (found && !used.has(found.id)) {
      used.add(found.id);
      results.push({ instrument: found, label: preference.label ?? found.name });
    }
  }
  return results;
}
