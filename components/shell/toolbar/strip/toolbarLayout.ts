import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Activity,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  Dot,
  Download,
  FilePlus,
  FlipVertical2,
  Footprints,
  FolderOpen,
  GitCompare,
  Guitar,
  LayoutPanelLeft,
  Layers,
  Link2,
  ListFilter,
  Music2,
  Metronome,
  Pause,
  Volume2,
  Wind,
  PanelsTopLeft,
  CircleQuestionMark,
  Rows3,
  Sparkles,
  Waypoints,
  SquareDashedMousePointer,
  Trash2,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { CommandId } from '../../../../lib/commands/types';
import { scorePaletteItems } from '../../../toolbar/palette';
import {
  arpeggioOptions,
  beamOptions,
  fretDiagramOptions,
  glissandoOptions,
  graceNoteOptions,
  articulationOptions,
  breathOptions,
  dynamicOptions,
  fermataOptions,
  hairpinOptions,
  ottavaOptions,
  pedalOptions,
  selectionFilterOptions,
  tremoloOptions,
  trillOptions,
} from '../../../toolbar/constants';
import { LAYOUT_GROUPS } from './layoutGroups';

/**
 * What the tool strip shows, as data (SHELL_REDESIGN_DESIGN §23). A control names the command it
 * runs; the renderer takes its label's shortcut, availability, pressed state and the reason it is
 * unavailable from the registry, so a strip button cannot disagree with the menu item for the same
 * command. Test ids are the ribbon's (`ribbonMigration.ts`).
 */
export interface StripItem {
  readonly testId: string;
  readonly label: string;
  /** Defaults to the menu's command. */
  readonly commandId?: CommandId;
  readonly arg?: unknown;
  /** A heading shown above this item when it starts a new section of the menu. */
  readonly section?: string;
  /** A SMuFL notation glyph shown beside the label. */
  readonly glyph?: string;
  /** The command needs arguments and the menu has no form: running it opens its form dialog (`commandForms.ts`). */
  readonly opensForm?: boolean;
}

interface StripBase {
  readonly testId: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** One action. A toggle (the command has a pressed state) shows it with `aria-pressed`. */
export interface StripCommand extends StripBase {
  readonly kind: 'command';
  readonly commandId: CommandId;
  readonly arg?: unknown;
}

/** A button that opens a list of items; each item runs a command. */
export interface StripMenu extends StripBase {
  readonly kind: 'menu';
  /** The command every item runs, unless the item names its own. */
  readonly commandId?: CommandId;
  readonly items: readonly StripItem[];
  /** Items are on/off (the selection filter); the menu stays open while they are toggled. */
  readonly checkable?: boolean;
  /** The ribbon gave the open menu its own test id. */
  readonly contentTestId?: string;
  /** The icon runs the variant used last (the first until one is), and the chevron opens the menu. */
  readonly split?: boolean;
  /** Lay the items out as a grid of this many columns (notation glyphs) rather than a list. */
  readonly columns?: number;
  /** An action under the items, such as opening the matching palette. */
  readonly footer?: StripItem;
}

/** A command that needs arguments: a button that opens a popover with the command's form (`commandForms.ts`). */
export interface StripForm extends StripBase {
  readonly kind: 'form';
  readonly commandId: CommandId;
}

export type StripControl = StripCommand | StripMenu | StripForm;

export interface StripGroup {
  readonly id: string;
  readonly label: string;
  readonly controls: readonly StripControl[];
}

const exportItem = (suffix: string, label: string, testId: string): StripItem => ({
  testId,
  label,
  commandId: `file.export.${suffix}`,
});

const paletteGlyph = (kind: string, subtype: number): string | undefined =>
  scorePaletteItems.find((item) => item.kind === kind && item.subtype === subtype)?.symbol;

/** The open-the-palette footer the ribbon's menus ended with. */
const paletteFooter = (testId: string, category: string): StripItem => ({
  testId,
  label: `Open ${category.toLowerCase()} palette`,
  commandId: 'view.palette.open',
  arg: category,
});

/** Items for a family built from an option table; the test id pattern is the ribbon's. */
const familyItems = <Option extends { label: string; value: number; symbol?: string }>(
  options: readonly Option[],
  commandId: CommandId,
  testId: (option: Option) => string,
  section?: string,
): StripItem[] =>
  options.map((option, index) => ({
    testId: testId(option),
    label: option.label,
    commandId,
    arg: option.value,
    ...(section && index === 0 ? { section } : {}),
    ...(option.symbol ? { glyph: option.symbol } : {}),
  }));

/**
 * In the order the ribbon had them. Only controls with no button elsewhere on screen are listed: the
 * quick row, the header transport, the status bar and the instruments panel already own theirs, and
 * a test id must be on screen once.
 */
export const STRIP_GROUPS: readonly StripGroup[] = [
  {
    id: 'file',
    label: 'File',
    controls: [
      {
        kind: 'command',
        testId: 'btn-open-score',
        label: 'Open score',
        icon: FolderOpen,
        commandId: 'file.open',
      },
      {
        kind: 'command',
        testId: 'btn-new-score',
        label: 'New score',
        icon: FilePlus,
        commandId: 'file.new',
      },
      {
        kind: 'command',
        testId: 'btn-load-soundfont',
        label: 'Load SoundFont',
        icon: Music2,
        commandId: 'playback.soundfont',
      },
      {
        kind: 'command',
        testId: 'btn-load-scores-to-compare',
        label: 'Compare scores',
        icon: GitCompare,
        commandId: 'compare.load',
      },
      {
        kind: 'command',
        testId: 'btn-create-share-link',
        label: 'Create share link',
        icon: Link2,
        commandId: 'file.shareLink',
      },
    ],
  },
  {
    id: 'export',
    label: 'Export',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-export',
        label: 'Export',
        icon: Download,
        items: [
          exportItem('mscz', 'MuseScore (.mscz)', 'btn-export-mscz'),
          exportItem('pdf', 'PDF', 'btn-export-pdf'),
          exportItem('svg', 'SVG', 'btn-export-svg'),
          exportItem('png', 'PNG…', 'btn-export-png'),
          exportItem('mscx', 'MuseScore uncompressed (.mscx)', 'btn-export-mscx'),
          exportItem('musicxml', 'MusicXML', 'btn-export-musicxml'),
          exportItem('mxl', 'Compressed MusicXML (.mxl)', 'btn-export-mxl'),
          exportItem('abc', 'ABC', 'btn-export-abc'),
          exportItem('midi', 'MIDI', 'btn-export-midi'),
          exportItem('audio', 'Audio (WAV)', 'btn-export-audio'),
          exportItem('pageAudio', 'Current page audio', 'btn-export-current-page-audio'),
          {
            testId: 'btn-export-google-drive',
            label: 'Upload to Google Drive…',
            commandId: 'file.drive.upload',
          },
        ],
      },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    controls: [
      {
        kind: 'command',
        testId: 'btn-select-all',
        label: 'Select all',
        icon: SquareDashedMousePointer,
        commandId: 'edit.selectAll',
      },
      {
        kind: 'menu',
        testId: 'dropdown-selection-filter',
        contentTestId: 'selection-filter-menu',
        label: 'Selection filter',
        icon: ListFilter,
        commandId: 'edit.selectionFilter',
        checkable: true,
        items: selectionFilterOptions.map((option) => ({
          testId: `selection-filter-${option.bit}`,
          label: option.label,
          arg: option.bit,
        })),
      },
      {
        kind: 'command',
        testId: 'btn-delete',
        label: 'Delete',
        icon: Trash2,
        commandId: 'edit.delete',
      },
    ],
  },
  {
    id: 'view',
    label: 'View',
    controls: [
      {
        kind: 'command',
        testId: 'btn-toggle-palettes',
        label: 'Palettes',
        icon: LayoutPanelLeft,
        commandId: 'view.panel.palettes',
      },
      {
        kind: 'command',
        testId: 'btn-toggle-panels',
        label: 'Toggle all panels',
        icon: PanelsTopLeft,
        commandId: 'view.panels.toggle',
      },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    controls: [
      {
        kind: 'command',
        testId: 'link-help',
        label: 'Editor help',
        icon: CircleQuestionMark,
        commandId: 'help.open',
      },
    ],
  },
  {
    id: 'notes-entry',
    label: 'Note entry',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-fretboards',
        contentTestId: 'fretboards-menu',
        label: 'Fretboard diagrams',
        icon: Guitar,
        items: fretDiagramOptions.map((option) => ({
          testId: `btn-fretboard-${option.label.toLowerCase()}`,
          label: option.label,
          commandId: 'add.mark.fretboard',
          arg: option.pattern,
        })),
      },
      {
        kind: 'menu',
        testId: 'dropdown-beams',
        label: 'Beams',
        icon: Rows3,
        items: familyItems(beamOptions, 'format.beam', (option) => `btn-beam-${option.value}`),
      },
      {
        kind: 'menu',
        testId: 'dropdown-grace-notes',
        label: 'Grace notes',
        icon: Sparkles,
        items: graceNoteOptions.map((option) => ({
          testId: option.testId,
          label: option.label,
          commandId: 'add.grace',
          arg: option.value,
        })),
      },
    ],
  },
  {
    id: 'notes-connect',
    label: 'Connect and decorate',
    controls: [
      {
        kind: 'command',
        testId: 'btn-flip-stem',
        label: 'Flip direction',
        icon: FlipVertical2,
        commandId: 'format.flip',
      },
      {
        kind: 'menu',
        testId: 'dropdown-lines',
        contentTestId: 'lines-menu',
        label: 'Lines',
        icon: Waypoints,
        items: [
          ...familyItems(
            ottavaOptions,
            'add.line.ottava',
            (option) => `btn-ottava-${option.value}`,
            'Ottava',
          ),
          ...familyItems(
            trillOptions,
            'add.line.trill',
            (option) => `btn-trill-${option.value}`,
            'Trill lines',
          ),
          ...familyItems(
            glissandoOptions,
            'add.line.glissando',
            (option) => `btn-glissando-${option.value}`,
            'Glissando',
          ),
        ],
      },
      {
        kind: 'menu',
        testId: 'dropdown-chord',
        contentTestId: 'chord-menu',
        label: 'Arpeggios and tremolos',
        icon: Layers,
        items: [
          ...familyItems(
            arpeggioOptions,
            'add.mark.arpeggio',
            (option) => `btn-arpeggio-${option.value}`,
            'Arpeggio',
          ),
          ...familyItems(
            tremoloOptions,
            'add.mark.tremolo',
            (option) => `btn-tremolo-${option.value}`,
            'Tremolo',
          ),
        ],
      },
    ],
  },
  {
    id: 'notes-rhythm',
    label: 'Duration',
    controls: [
      {
        kind: 'command',
        testId: 'btn-duration-shorter',
        label: 'Shorter',
        icon: ChevronsLeft,
        commandId: 'edit.duration.shorter',
      },
      {
        kind: 'command',
        testId: 'btn-duration-longer',
        label: 'Longer',
        icon: ChevronsRight,
        commandId: 'edit.duration.longer',
      },
    ],
  },
  {
    id: 'notes-pitch',
    label: 'Pitch',
    controls: [
      {
        kind: 'command',
        testId: 'btn-pitch-up',
        label: 'Pitch up',
        icon: ArrowUp,
        commandId: 'edit.pitch.up',
      },
      {
        kind: 'command',
        testId: 'btn-pitch-down',
        label: 'Pitch down',
        icon: ArrowDown,
        commandId: 'edit.pitch.down',
      },
      {
        kind: 'command',
        testId: 'btn-transpose-12',
        label: 'Up an octave',
        icon: ChevronsUp,
        commandId: 'edit.pitch.octaveUp',
      },
      {
        kind: 'command',
        testId: 'btn-transpose--12',
        label: 'Down an octave',
        icon: ChevronsDown,
        commandId: 'edit.pitch.octaveDown',
      },
      {
        kind: 'command',
        testId: 'btn-transpose-dialog',
        label: 'Transpose…',
        icon: ArrowUpDown,
        commandId: 'tools.transpose',
      },
    ],
  },
  {
    id: 'marks-dynamics',
    label: 'Dynamics',
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
    ],
  },
  {
    id: 'marks-spanners',
    label: 'Hairpins and pedal',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-hairpins',
        label: 'Hairpins',
        icon: Activity,
        items: hairpinOptions.map((option) => ({
          testId: option.testId,
          label: option.label,
          commandId: 'add.line.hairpin',
          arg: option.value,
        })),
      },
      {
        kind: 'menu',
        testId: 'dropdown-pedal',
        label: 'Pedal',
        icon: Footprints,
        items: [
          ...pedalOptions.map((option) => ({
            testId: option.testId,
            label: option.label,
            commandId: 'add.line.pedal',
            arg: option.value,
          })),
          {
            testId: 'btn-pedal-sostenuto',
            label: 'Sostenuto pedal',
            commandId: 'add.line.pedal.sostenuto',
          },
          {
            testId: 'btn-pedal-una-corda',
            label: 'Una corda',
            commandId: 'add.line.pedal.unaCorda',
          },
          { testId: 'btn-pedal-split', label: 'Pedal change', commandId: 'add.line.pedal.split' },
        ],
      },
    ],
  },
  {
    id: 'marks-articulations',
    label: 'Articulations, fermatas and breaths',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-articulations',
        contentTestId: 'articulations-menu',
        label: 'Articulations',
        icon: Dot,
        split: true,
        columns: 4,
        items: articulationOptions.map((option, index) => ({
          testId: `btn-artic-${option.symbol}`,
          label: option.label,
          commandId: 'add.mark.articulation',
          arg: option.symbol,
          glyph: paletteGlyph('articulation', index),
        })),
      },
      {
        kind: 'menu',
        testId: 'dropdown-fermata',
        label: 'Fermatas',
        icon: Pause,
        split: true,
        columns: 5,
        items: familyItems(
          fermataOptions,
          'add.mark.fermata',
          (option) => `btn-fermata-${option.value}`,
        ),
        footer: paletteFooter('btn-open-fermata-palette', 'Fermatas'),
      },
      {
        kind: 'menu',
        testId: 'dropdown-breath',
        label: 'Breaths and caesuras',
        icon: Wind,
        split: true,
        columns: 5,
        items: familyItems(
          breathOptions,
          'add.mark.breath',
          (option) => `btn-breath-${option.value}`,
        ),
        footer: paletteFooter('btn-open-breath-palette', 'Breaths'),
      },
    ],
  },
  {
    id: 'text',
    label: 'Text and tempo',
    controls: [
      {
        kind: 'menu',
        testId: 'dropdown-text',
        label: 'Text',
        icon: Type,
        items: [
          {
            testId: 'btn-text-title',
            label: 'Title',
            commandId: 'add.text.title',
            section: 'Score header',
          },
          { testId: 'btn-text-subtitle', label: 'Subtitle', commandId: 'add.text.subtitle' },
          { testId: 'btn-text-composer', label: 'Composer', commandId: 'add.text.composer' },
          { testId: 'btn-text-lyricist', label: 'Lyricist', commandId: 'add.text.lyricist' },
          {
            testId: 'btn-text-staff',
            label: 'Staff text',
            commandId: 'add.text.staff',
            section: 'On the score',
          },
          { testId: 'btn-text-system', label: 'System text', commandId: 'add.text.system' },
          {
            testId: 'btn-text-expression',
            label: 'Expression text',
            commandId: 'add.text.expression',
          },
          { testId: 'btn-text-lyrics', label: 'Lyrics', commandId: 'add.text.lyrics' },
          {
            testId: 'btn-text-figured-bass',
            label: 'Figured bass',
            commandId: 'add.text.figuredBass',
          },
          {
            testId: 'btn-text-instrument-change',
            label: 'Instrument change',
            commandId: 'add.text.instrumentChange',
          },
          {
            testId: 'btn-text-harmony-standard',
            label: 'Chord symbol',
            commandId: 'add.text.harmony',
            arg: 0,
            section: 'Harmony',
          },
          {
            testId: 'btn-text-harmony-roman',
            label: 'Roman numeral',
            commandId: 'add.text.harmony',
            arg: 1,
          },
          {
            testId: 'btn-text-harmony-nashville',
            label: 'Nashville number',
            commandId: 'add.text.harmony',
            arg: 2,
          },
          {
            testId: 'btn-text-fingering',
            label: 'Fingering',
            commandId: 'add.text.fingering',
            section: 'Fingering and technique',
          },
          {
            testId: 'btn-text-fingering-lh',
            label: 'LH guitar fingering',
            commandId: 'add.text.fingering.lh',
          },
          {
            testId: 'btn-text-fingering-rh',
            label: 'RH guitar fingering',
            commandId: 'add.text.fingering.rh',
          },
          {
            testId: 'btn-text-string-number',
            label: 'String number',
            commandId: 'add.text.stringNumber',
          },
          { testId: 'btn-text-sticking', label: 'Sticking', commandId: 'add.text.sticking' },
        ],
      },
      {
        kind: 'form',
        testId: 'btn-tempo-open',
        label: 'Tempo',
        icon: Metronome,
        commandId: 'add.text.tempo',
      },
    ],
  },
  ...LAYOUT_GROUPS,
];

/** Every control in strip order (what arrow keys walk). */
export const flattenControls = (groups: readonly StripGroup[]): StripControl[] =>
  groups.flatMap((group) => [...group.controls]);
