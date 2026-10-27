import { CornerUpLeft, MapPin, Piano } from 'lucide-react';
import {
  jumpOptions,
  markerOptions,
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
