import {
  Download,
  FilePlus,
  FolderOpen,
  GitCompare,
  LayoutPanelLeft,
  Link2,
  ListFilter,
  Music2,
  PanelsTopLeft,
  CircleQuestionMark,
  SquareDashedMousePointer,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { CommandId } from '../../../../lib/commands/types';
import { selectionFilterOptions } from '../../../toolbar/constants';

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
}

export type StripControl = StripCommand | StripMenu;

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
];

/** Every control in strip order (what arrow keys walk). */
export const flattenControls = (groups: readonly StripGroup[]): StripControl[] =>
  groups.flatMap((group) => [...group.controls]);
