import { defaultCommandRegistry, type CommandRegistry } from './registry';
import type { CommandDescriptor, CommandId, RunStatus } from './types';

/** What Playwright reaches through `window.__otsCommands` (non-production builds only). */
export interface OtsCommandsTestHook {
  run(id: CommandId, args?: unknown): Promise<RunStatus>;
  list(): CommandDescriptor[];
}

declare global {
  interface Window {
    __otsCommands?: OtsCommandsTestHook;
  }
}

/**
 * Exposes the registry to end-to-end tests so they can run a command without knowing
 * which surface (ribbon, menu, palette) currently hosts it. Gated like
 * `window.__webmscore`: a live handle on `window` is not worth its blast radius in a
 * production build. Returns the function that removes the hook.
 */
export function installCommandTestHook(
  registry: CommandRegistry = defaultCommandRegistry,
): () => void {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return () => {};
  const hook: OtsCommandsTestHook = {
    run: (id, args) => registry.run(id, args),
    list: () => registry.list(),
  };
  window.__otsCommands = hook;
  return () => {
    if (window.__otsCommands === hook) delete window.__otsCommands;
  };
}
