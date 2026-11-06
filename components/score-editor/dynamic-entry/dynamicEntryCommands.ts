import { needsSingle } from '../../../lib/commands/selectionGates';
import { defineCommand, type AnyCommand } from '../../../lib/commands/types';
import { setDynamicEntry } from './dynamicEntryStore';

/** Under the selection overlay (the selected note), or the middle of the window without one. */
function anchorAtSelection() {
  const overlay = document
    .querySelector('[data-testid="selection-overlay"]')
    ?.getBoundingClientRect();
  return overlay
    ? { x: overlay.left, y: overlay.bottom + 6 }
    : { x: window.innerWidth / 2 - 100, y: window.innerHeight / 3 };
}

/**
 * Add ▸ Marks ▸ Dynamic… (roadmap E11): desktop MuseScore's add-dynamic, a popup at the selected note where the
 * dynamic is typed or picked. Hook-free: the command catalog (read by the server-rendered Help page) builds it too.
 * No key: desktop's Ctrl+D is the browser's bookmark key.
 */
export function buildDynamicEntryCommands(): AnyCommand[] {
  return [
    defineCommand({
      id: 'add.mark.dynamicEntry',
      label: 'Dynamic…',
      opensDialog: true,
      keywords: ['dynamic', 'mf', 'forte', 'piano', 'type'],
      enabled: needsSingle,
      run: () => setDynamicEntry(anchorAtSelection()),
    }),
  ];
}
