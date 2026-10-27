import { Activity, Clock, Dot, KeyRound, Music4, Repeat2, Volume2 } from 'lucide-react';
import {
  articulationOptions,
  barlineOptions,
  clefButtonOptionsDefault,
  dynamicOptions,
  hairpinOptions,
  keySignatureButtonOptionsDefault,
  signatureOptionsDefault,
  repeatCountOptions,
  voltaOptions,
} from '../../../toolbar/constants';
import { scorePaletteItems } from '../../../toolbar/palette';
import { paletteFooter, paletteGlyph } from './paletteReferences';
import type { StripMenu } from './toolbarLayout';

/**
 * The strip controls the Write quick row shows, after its own note-entry controls: the marks put on a note while
 * entering it, and the clef, key and time signature. They stay when the tools are hidden, so the collapsed toolbar
 * is still a complete note-entry row. Each control is on screen once: these are not in `STRIP_GROUPS`.
 */
export const QUICK_ROW_GROUPS: readonly {
  id: string;
  label: string;
  controls: readonly StripMenu[];
}[] = [
  {
    id: 'quick-marks',
    label: 'Dynamics, hairpins and articulations',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-markings',
        contentTestId: 'markings-menu',
        label: 'Dynamics',
        icon: Volume2,
        split: true,
        columns: 6,
        items: dynamicOptions.map((option) => ({
          testId: `btn-dynamic-${option.value}`,
          label: option.label,
          commandId: 'add.mark.dynamic',
          arg: option.value,
          glyph: paletteGlyph('dynamic', option.value),
        })),
        footer: paletteFooter('btn-open-dynamics-palette', 'Dynamics'),
      },
      {
        kind: 'menu',
        testId: 'dropdown-hairpins',
        label: 'Hairpins',
        icon: Activity,
        split: true,
        items: hairpinOptions.map((option) => ({
          testId: option.testId,
          label: option.label,
          commandId: 'add.line.hairpin',
          arg: option.value,
          glyph: paletteGlyph('hairpin', option.value),
        })),
      },
      {
        kind: 'menu',
        testId: 'dropdown-articulations',
        contentTestId: 'articulations-menu',
        label: 'Articulations',
        icon: Dot,
        split: true,
        columns: 5,
        // The face starts on the accent; the grid keeps the palette's order. Bowings are in the grid too.
        initial: 'btn-artic-articAccentAbove',
        items: articulationOptions.map((option, index) => ({
          testId: `btn-artic-${option.symbol}`,
          label: option.label,
          commandId: 'add.mark.articulation',
          arg: option.symbol,
          glyph: paletteGlyph('articulation', index),
        })),
      },
    ],
  },
  {
    id: 'quick-signatures',
    label: 'Clef, key and time signature',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-clef',
        contentTestId: 'clef-menu',
        label: 'Clefs',
        icon: Music4,
        split: true,
        columns: 6,
        items: clefButtonOptionsDefault.map((option) => ({
          testId: `btn-clef-${option.value}`,
          label: option.label,
          commandId: 'add.clef',
          arg: option.value,
          glyph: paletteGlyph('clef', option.value),
        })),
        footer: paletteFooter('btn-open-clef-palette', 'Clefs'),
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
    ],
  },
  {
    id: 'quick-repeats',
    label: 'Repeats and barlines',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-repeats',
        contentTestId: 'repeats-menu',
        label: 'Repeats and barlines',
        icon: Repeat2,
        items: [
          {
            testId: 'btn-repeat-start',
            label: 'Start repeat',
            commandId: 'add.repeat.start',
            section: 'Repeat',
          },
          { testId: 'btn-repeat-end', label: 'End repeat', commandId: 'add.repeat.end' },
          ...repeatCountOptions.map((option, index) => ({
            testId: `btn-repeat-count-${option.count}`,
            label: `Repeat ${option.label}`,
            commandId: 'add.repeat.count' as const,
            arg: option.count,
            ...(index === 0 ? { section: 'Repeat count' } : {}),
          })),
          ...barlineOptions.map((option, index) => ({
            testId: `btn-barline-${option.value}`,
            label: option.label,
            commandId: 'add.barline' as const,
            arg: option.value,
            glyph: paletteGlyph('barline', option.value),
            ...(index === 0 ? { section: 'Barlines' } : {}),
          })),
          ...voltaOptions.map((option, index) => ({
            testId: `btn-volta-${option.ending}`,
            label: option.label,
            commandId: 'add.volta' as const,
            arg: option.ending,
            ...(index === 0 ? { section: 'Voltas' } : {}),
          })),
        ],
      },
    ],
  },
];
