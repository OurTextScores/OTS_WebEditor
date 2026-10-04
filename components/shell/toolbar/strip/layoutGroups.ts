import {
  ArrowRightToLine,
  BetweenVerticalEnd,
  Clock,
  Eraser,
  File,
  KeyRound,
  ListX,
  Ruler,
  Scissors,
  WrapText,
} from 'lucide-react';
import {
  keySignatureButtonOptionsDefault,
  signatureOptionsDefault,
} from '../../../toolbar/constants';
import { scorePaletteItems } from '../../../toolbar/palette';
import type { StripGroup } from './toolbarLayout';

/**
 * The ribbon's Layout, Bars and Signatures sections (SHELL_REDESIGN_DESIGN §23): breaks, bars, time
 * and key signatures, and the bulk tools. Test ids are the ribbon's, except where the ribbon had
 * fields and a submit button but no opener (`btn-measures-open`, `btn-pickup-open`,
 * `btn-timesig-custom-open`); the ribbon's submit ids live in the form popover and dialog.
 */
export const LAYOUT_GROUPS: readonly StripGroup[] = [
  {
    id: 'layout-breaks',
    label: 'Breaks',
    controls: [
      {
        kind: 'command',
        testId: 'btn-new-line',
        label: 'New line',
        icon: WrapText,
        commandId: 'format.break.line',
      },
      {
        kind: 'command',
        testId: 'btn-new-page',
        label: 'New page',
        icon: File,
        commandId: 'format.break.page',
      },
    ],
  },
  {
    id: 'layout-bars',
    label: 'Bars',
    controls: [
      {
        kind: 'form',
        testId: 'btn-measures-open',
        label: 'Insert measures',
        icon: BetweenVerticalEnd,
        commandId: 'add.measures',
      },
      {
        kind: 'form',
        testId: 'btn-pickup-open',
        label: 'Add pickup',
        icon: ArrowRightToLine,
        commandId: 'add.pickup',
      },
      {
        kind: 'command',
        testId: 'btn-remove-containing-measures',
        label: 'Remove selected measures',
        icon: Eraser,
        commandId: 'tools.measures.removeSelected',
      },
      {
        kind: 'command',
        testId: 'btn-remove-trailing-empty',
        label: 'Remove empty trailing measures',
        icon: ListX,
        commandId: 'tools.measures.removeTrailingEmpty',
      },
    ],
  },
  {
    id: 'layout-signatures',
    label: 'Signatures',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-signature',
        label: 'Time signature',
        icon: Clock,
        commandId: 'add.timeSig',
        items: [
          ...signatureOptionsDefault.map((option) => ({
            testId: `btn-timesig-${option.numerator}-${option.denominator}`,
            label: option.label,
            arg: {
              numerator: option.numerator,
              denominator: option.denominator,
              timeSigType: option.timeSigType,
            },
          })),
          {
            testId: 'btn-timesig-custom-open',
            label: 'Custom…',
            commandId: 'add.timeSig.custom',
            opensForm: true,
          },
        ],
      },
      {
        kind: 'menu',
        testId: 'dropdown-key',
        label: 'Key signature',
        icon: KeyRound,
        commandId: 'add.keySig',
        columns: 5,
        items: keySignatureButtonOptionsDefault.map((option) => ({
          testId: `btn-keysig-${option.fifths}`,
          label: `${option.label} major`,
          arg: option.fifths,
          glyph: scorePaletteItems.find(
            (item) => item.kind === 'keysig' && item.subtype === option.fifths,
          )?.symbol,
        })),
      },
    ],
  },
  {
    id: 'layout-tools',
    label: 'Tools',
    controls: [
      {
        kind: 'command',
        testId: 'btn-add-ambitus',
        label: 'Add ambitus',
        icon: Ruler,
        commandId: 'add.ambitus',
      },
      {
        kind: 'menu',
        testId: 'dropdown-bulk-tools',
        label: 'Bulk tools',
        icon: Scissors,
        items: [
          { testId: 'btn-explode-selection', label: 'Explode', commandId: 'tools.explode' },
          { testId: 'btn-implode-selection', label: 'Implode', commandId: 'tools.implode' },
          { testId: 'btn-regroup-selection', label: 'Regroup rhythms', commandId: 'tools.regroup' },
          {
            testId: 'btn-resequence-rehearsal',
            label: 'Resequence rehearsal marks',
            commandId: 'tools.resequence',
          },
        ],
      },
    ],
  },
];
