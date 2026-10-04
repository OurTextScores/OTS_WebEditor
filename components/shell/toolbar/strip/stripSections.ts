/**
 * The sections of the tool strip that View ▸ Toolbar shows and hides (SHELL_REDESIGN_DESIGN §23.11): a
 * group belongs to the section named by the first part of its id; the Home groups (file, export, edit,
 * view, help) are one section. Kept free of the layout data so the shell commands can read it.
 */
export interface StripSection {
  readonly id: string;
  readonly label: string;
}

export const STRIP_SECTIONS: readonly StripSection[] = [
  { id: 'home', label: 'Home' },
  { id: 'notes', label: 'Notes' },
  { id: 'marks', label: 'Marks' },
  { id: 'text', label: 'Text' },
  { id: 'layout', label: 'Layout' },
  { id: 'score', label: 'Score' },
];

const HOME_GROUPS = new Set(['file', 'export', 'edit', 'view', 'help']);

export const sectionOfGroup = (groupId: string): string =>
  HOME_GROUPS.has(groupId) ? 'home' : groupId.split('-')[0];
