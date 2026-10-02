import type { CommandId } from '../../lib/commands/types';

/**
 * Commands whose arguments a user has to supply, and the small form that asks for them.
 *
 * The ribbon kept these as inline inputs (bar count, tempo, pickup, custom time signature).
 * A menu item or palette row has no room for an input, so selecting one of these opens a
 * form; the command itself still takes plain arguments, which is what tests and any
 * future caller pass directly. The fields and the submit button keep the ribbon inputs' test
 * ids (`input-measure-count`, `btn-insert-measures`, ...), which moved here with the ribbon.
 */
export type FormField =
  | {
      readonly name: string;
      readonly label: string;
      readonly type: 'number';
      readonly min: number;
      readonly defaultValue: number;
      readonly testId: string;
    }
  | {
      readonly name: string;
      readonly label: string;
      readonly type: 'select';
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly defaultValue: string;
      readonly testId: string;
    };

export interface CommandForm {
  readonly title: string;
  readonly submitLabel: string;
  readonly submitTestId: string;
  readonly fields: readonly FormField[];
  /** Turns the entered values into the command's argument. */
  readonly toArgs: (values: Readonly<Record<string, string>>) => unknown;
}

/** A whole number of at least one; an empty or unparseable field is the default, not zero. */
const whole = (value: string | undefined, fallback: number) => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
};

export const COMMAND_FORMS: Readonly<Record<CommandId, CommandForm>> = {
  'add.text.tempo': {
    title: 'Tempo',
    submitLabel: 'Apply',
    submitTestId: 'btn-tempo-apply',
    fields: [
      {
        name: 'bpm',
        label: 'Beats per minute',
        type: 'number',
        min: 1,
        defaultValue: 120,
        testId: 'input-tempo-bpm',
      },
    ],
    toArgs: (values) => ({ bpm: whole(values.bpm, 120) }),
  },
  'add.measures': {
    title: 'Insert Measures',
    submitLabel: 'Insert',
    submitTestId: 'btn-insert-measures',
    fields: [
      {
        name: 'count',
        label: 'Number of bars',
        type: 'number',
        min: 1,
        defaultValue: 1,
        testId: 'input-measure-count',
      },
      {
        name: 'target',
        label: 'Where',
        type: 'select',
        defaultValue: 'after-selection',
        options: [
          { value: 'beginning', label: 'Beginning' },
          { value: 'after-selection', label: 'After Selection' },
          { value: 'end', label: 'End' },
        ],
        testId: 'select-measure-target',
      },
    ],
    toArgs: (values) => ({ count: whole(values.count, 1), target: values.target }),
  },
  'add.pickup': {
    title: 'Add Pickup',
    submitLabel: 'Add',
    submitTestId: 'btn-add-pickup',
    fields: [
      {
        name: 'numerator',
        label: 'Beats',
        type: 'number',
        min: 1,
        defaultValue: 1,
        testId: 'input-pickup-numerator',
      },
      {
        name: 'denominator',
        label: 'Note value',
        type: 'select',
        defaultValue: '4',
        options: ['1', '2', '4', '8', '16', '32'].map((value) => ({ value, label: value })),
        testId: 'select-pickup-denominator',
      },
    ],
    toArgs: (values) => ({
      numerator: whole(values.numerator, 1),
      denominator: whole(values.denominator, 4),
    }),
  },
  'add.timeSig.custom': {
    title: 'Custom Time Signature',
    submitLabel: 'Apply',
    submitTestId: 'btn-timesig-custom',
    fields: [
      {
        name: 'numerator',
        label: 'Beats per bar',
        type: 'number',
        min: 1,
        defaultValue: 4,
        testId: 'input-timesig-numerator',
      },
      {
        name: 'denominator',
        label: 'Beat unit',
        type: 'number',
        min: 1,
        defaultValue: 4,
        testId: 'input-timesig-denominator',
      },
    ],
    toArgs: (values) => ({
      numerator: whole(values.numerator, 4),
      denominator: whole(values.denominator, 4),
    }),
  },
};
