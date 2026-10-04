import { CornerUpLeft, MapPin, Music4, Piano, Repeat2 } from 'lucide-react';
import {
  barlineOptions,
  clefButtonOptionsDefault,
  jumpOptions,
  markerOptions,
  repeatCountOptions,
  voltaOptions,
} from '../../../toolbar/constants';
import { paletteFooter, paletteGlyph } from './paletteReferences';
import type { StripGroup } from './toolbarLayout';

/**
 * The ribbon's Score section: clefs, instruments, repeats and barlines, markers and jumps
 * (SHELL_REDESIGN_DESIGN §23). Test ids are the ribbon's, except `dropdown-jumps`: the ribbon's one
 * Markers / Jumps menu is two buttons here, so each has its own palette footer.
 */
export const SCORE_STRIP_GROUPS: readonly StripGroup[] = [
  {
    id: 'score-clefs',
    label: 'Clefs',
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
    ],
  },
  {
    id: 'score-instruments',
    label: 'Instruments',
    controls: [
      // The Instruments panel owns add, show/hide and remove (and their ids); this opens it.
      {
        kind: 'command',
        testId: 'dropdown-instruments',
        label: 'Instruments',
        icon: Piano,
        commandId: 'view.panel.instruments',
      },
    ],
  },
  {
    id: 'score-repeats',
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
  {
    id: 'score-navigation',
    label: 'Markers and jumps',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-navigation',
        contentTestId: 'navigation-menu',
        label: 'Markers',
        icon: MapPin,
        commandId: 'add.marker',
        items: markerOptions.map((option) => ({
          testId: `btn-marker-${option.value}`,
          label: option.label,
          arg: option.value,
          glyph: paletteGlyph('marker', option.value),
        })),
        footer: paletteFooter('btn-open-markers-palette', 'Markers'),
      },
      {
        kind: 'menu',
        testId: 'dropdown-jumps',
        label: 'Jumps',
        icon: CornerUpLeft,
        commandId: 'add.jump',
        items: jumpOptions.map((option) => ({
          testId: `btn-jump-${option.value}`,
          label: option.label,
          arg: option.value,
        })),
        footer: paletteFooter('btn-open-jumps-palette', 'Jumps'),
      },
    ],
  },
];
