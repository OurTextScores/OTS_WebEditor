import { useEffect } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { invokeCommand } from './invokeCommand';
import { SHELL_SHORTCUTS, matchesShortcut } from './shellShortcuts';

const isTextField = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
};

/**
 * Binds `SHELL_SHORTCUTS` on the window. A shortcut whose command is not registered (F7
 * before the Instruments panel exists) is left to the browser. Anything already handled by
 * someone else (`defaultPrevented`) is skipped, so `ScoreEditor`'s own key handler wins
 * for the keys it owns.
 */
export function useShellShortcuts(registry: CommandRegistry = defaultCommandRegistry): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const shortcut = SHELL_SHORTCUTS.find((candidate) => matchesShortcut(event, candidate.keys));
      if (!shortcut || !registry.has(shortcut.commandId)) return;
      if (isTextField(event.target) && !shortcut.inTextFields) return;
      event.preventDefault();
      void invokeCommand(shortcut.commandId, shortcut.arg, registry);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [registry]);
}
