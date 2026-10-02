import { useEffect } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../../lib/commands/registry';
import { routeKeydown } from './KeyboardRouter';

/** Installs the router on the window: the only listener for editing and shell keys. */
export function useKeyboardRouter(registry: CommandRegistry = defaultCommandRegistry): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      routeKeydown(event, registry);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [registry]);
}
