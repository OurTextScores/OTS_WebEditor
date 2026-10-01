import { Columns2, History, Pencil, type LucideIcon } from 'lucide-react';
import type { CommandId } from '../../lib/commands/types';
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
