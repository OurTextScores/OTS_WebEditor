'use client';

import * as Menubar from '@radix-ui/react-menubar';
import { Menu as MenuIcon } from 'lucide-react';
import React, { useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useCommandContext } from '../../lib/commands/useRegisterCommands';
import { useClickPreferences } from '../../lib/playback/use-click-preferences';
import { MENUS, type MenuDefinition } from './menus';
import { MenuNodeList, MenuSubMenu } from './MenuNodes';
import type { MenuRenderContext } from './menuRender';
import {
  getHiddenSections,
  getHiddenSectionsOnServer,
  subscribeHiddenSections,
} from './toolbar/strip/stripPersistence';

// `relative` matters: Radix copies the content's computed z-index onto its positioning wrapper,
// and a browser reports `auto` for z-index on an element that is not positioned, which would
// leave the menu underneath the toolbar.
const contentClass =
  'relative z-menu min-w-[14rem] max-h-[var(--radix-menubar-content-available-height)] overflow-y-auto rounded border border-slate-200 bg-white p-1 text-xs text-slate-800 shadow-raised';
const triggerClass =
  'rounded px-2.5 py-1 text-sm text-slate-800 outline-none hover:bg-slate-100 data-[state=open]:bg-slate-100 focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The complete menu bar (SHELL_REDESIGN_DESIGN §8.1), rendered from `MENUS`. Radix gives it
 * `role="menubar"`, roving focus and arrow-key movement between menus. Below 720px the
 * menus collapse into one app menu (`compact`).
 *
 * `enabled` / `checked` are evaluated here, while the menu renders, never ahead of time.
 */
export function MenuBar({
  registry = defaultCommandRegistry,
  menus = MENUS,
  compact = false,
}: {
  registry?: CommandRegistry;
  menus?: readonly MenuDefinition[];
  compact?: boolean;
}) {
  const ctx = useCommandContext(registry);
  // The View ▸ Toolbar checks read the strip's hidden sections, which are not part of the command context.
  useSyncExternalStore(subscribeHiddenSections, getHiddenSections, getHiddenSectionsOnServer);
  // The Playback ▸ Metronome and Count-in checks read the click preferences, also outside the command context.
  useClickPreferences();
  const render: MenuRenderContext = {
    registry,
    ctx,
    primitives: Menubar,
    contentClass,
    testIdPrefix: 'menu',
  };

  if (compact) {
    return (
      <Menubar.Root aria-label="Menu bar" className="flex items-center">
        <Menubar.Menu>
          <Menubar.Trigger className={triggerClass} aria-label="Menu" data-testid="menu-app">
            <MenuIcon size={16} />
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content className={contentClass} align="start" sideOffset={4}>
              {menus.map((menu) => (
                <MenuSubMenu key={menu.id} label={menu.label} render={render}>
                  <MenuNodeList nodes={menu.children} render={render} />
                </MenuSubMenu>
              ))}
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      </Menubar.Root>
    );
  }

  return (
    <Menubar.Root aria-label="Menu bar" className="flex items-center gap-0.5">
      {menus.map((menu) => (
        <Menubar.Menu key={menu.id}>
          <Menubar.Trigger className={triggerClass} data-testid={`menu-${menu.id}`}>
            {menu.label}
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content className={contentClass} align="start" sideOffset={4}>
              <MenuNodeList nodes={menu.children} render={render} />
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
