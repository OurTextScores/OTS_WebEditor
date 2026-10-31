import {
  Bot,
  Columns2,
  FileCode,
  History,
  Palette,
  Pencil,
  Piano,
  SlidersHorizontal,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { CommandId } from '../../lib/commands/types';
import type { ShellView } from './shellStore';
import type { DockTab } from './useWorkspaceDock';
import type { OtsActiveActivity } from './workspaceMode';

/**
 * The activity bar's entries (SHELL_REDESIGN_DESIGN §7.4). Compare is both an activity and a
 * state: it lights up whenever a compare session is open, however it was started. AI is not an
 * activity (§7.4): it acts on the score being written, so it is a right panel.
 */
export interface ActivityDefinition {
  readonly id: OtsActiveActivity;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly commandId: CommandId;
}

export const ACTIVITIES: readonly ActivityDefinition[] = [
  { id: 'write', label: 'Write', icon: Pencil, commandId: 'shell.activity.write' },
  { id: 'compare', label: 'Compare', icon: Columns2, commandId: 'shell.activity.compare' },
  { id: 'history', label: 'History', icon: History, commandId: 'shell.activity.history' },
];

/**
 * The left dock's panels, one icon each (VS Code's side bar): a click shows that panel, and on the panel that is
 * showing, closes the dock. Pressed while its panel shows; Palettes also while they float.
 */
export interface DockPanelDefinition {
  readonly id: DockTab;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly commandId: CommandId;
  /** Its keyboard shortcut, for the tooltip. */
  readonly shortcut?: string;
}

export const DOCK_PANELS: readonly DockPanelDefinition[] = [
  {
    id: 'palettes',
    label: 'Palettes',
    icon: Palette,
    commandId: 'view.panel.palettes',
    shortcut: 'F9',
  },
  {
    id: 'instruments',
    label: 'Instruments',
    icon: Piano,
    commandId: 'view.panel.instruments',
    shortcut: 'F7',
  },
  {
    id: 'properties',
    label: 'Properties',
    icon: SlidersHorizontal,
    commandId: 'view.panel.properties',
    shortcut: 'F8',
  },
  { id: 'edits', label: 'Edits', icon: Undo2, commandId: 'view.panel.undoHistory' },
];

/** The published view flags that say a side panel is open. */
export type PanelOpenKey = keyof Pick<ShellView, 'aiToolsOpen' | 'musicXmlOpen'>;

/**
 * Panels that sit beside the score, opened from the same bar. Not activities: they do not replace
 * Write, Compare or History, and any of them can be open with any of those, so each is its own
 * on/off button (pressed while its panel is open) rather than one of a set.
 */
export interface PanelToggleDefinition {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly commandId: CommandId;
  /** Which published view flag says the panel is open. */
  readonly openKey: PanelOpenKey;
}

export const PANEL_TOGGLES: readonly PanelToggleDefinition[] = [
  {
    id: 'ai-tools',
    label: 'AI Tools',
    icon: Bot,
    commandId: 'view.panel.aiTools',
    openKey: 'aiToolsOpen',
  },
  {
    id: 'score-source',
    label: 'Score source (XML)',
    icon: FileCode,
    commandId: 'view.panel.scoreSource',
    openKey: 'musicXmlOpen',
  },
];
