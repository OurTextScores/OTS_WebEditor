'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { createPortal } from 'react-dom';
import { defaultCommandRegistry, type CommandRegistry } from '../../../lib/commands/registry';
import { useCommandContext } from '../../../lib/commands/useRegisterCommands';
import { MenuNodeList } from '../../shell/MenuNodes';
import type { MenuRenderContext } from '../../shell/menuRender';
import type { ScoreContextMenuState } from './contextMenus';

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

// As the menu bar's: `relative` keeps Radix's copied z-index meaningful on its wrapper.
const contentClass =
  'relative z-menu min-w-[14rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded border border-slate-200 bg-white p-1 text-xs text-slate-800 shadow-raised';

/**
 * The score's right-click menu: a controlled dropdown anchored to a point. A dropdown, not
 * Radix's ContextMenu, because what the menu holds is known only after the right-click has
 * hit-tested and selected in the engine, which ContextMenu cannot wait for. Not modal, so a
 * right-click elsewhere on the score reaches the canvas and reopens the menu there.
 */
export function ScoreContextMenu({
  menu,
  onClose,
  registry = defaultCommandRegistry,
}: {
  menu: ScoreContextMenuState | null;
  onClose: () => void;
  registry?: CommandRegistry;
}) {
  const ctx = useCommandContext(registry);
  if (!menu || typeof document === 'undefined') return null;
  const render: MenuRenderContext = {
    registry,
    ctx,
    primitives: DropdownMenuPrimitive,
    contentClass,
    testIdPrefix: 'context',
    labelledTestIds: true,
  };
  return (
    <DropdownMenuPrimitive.Root
      // A new point is a new menu: remount so Radix positions and focuses it afresh.
      key={`${menu.x},${menu.y}`}
      open
      modal={false}
      onOpenChange={(open) => !open && onClose()}
    >
      {createPortal(
        <DropdownMenuPrimitive.Trigger asChild>
          <span
            aria-hidden="true"
            style={{ position: 'fixed', left: menu.x, top: menu.y, width: 0, height: 0 }}
          />
        </DropdownMenuPrimitive.Trigger>,
        document.body,
      )}
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          className={contentClass}
          align="start"
          side="bottom"
          sideOffset={2}
          collisionPadding={8}
          data-testid="score-context-menu"
          // Focus goes back to the score, not to the invisible anchor.
          onCloseAutoFocus={(event) => event.preventDefault()}
          // React carries a portal's events up its component tree: a click on an entry must not
          // also reach the score canvas as a click on blank paper, which clears the selection.
          onPointerDown={stopPropagation}
          onPointerUp={stopPropagation}
          onMouseDown={stopPropagation}
          onMouseUp={stopPropagation}
          onClick={stopPropagation}
          onDoubleClick={stopPropagation}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <MenuNodeList nodes={menu.nodes} render={render} />
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
