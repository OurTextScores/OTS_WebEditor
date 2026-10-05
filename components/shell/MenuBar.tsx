'use client';

import { primaryShortcut } from '../../lib/commands/bindings';
import * as Menubar from '@radix-ui/react-menubar';
import { Menu as MenuIcon } from 'lucide-react';
import React, { useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import {
  isCommandFamily,
  type Command,
  type CommandContext,
  type CommandFamily,
} from '../../lib/commands/types';
import { useCommandContext } from '../../lib/commands/useRegisterCommands';
import { invokeCommand } from './invokeCommand';
import { MENUS, type MenuDefinition, type MenuNode } from './menus';
import { pruneMenuNodes } from './menuTree';
import { formatShortcut } from './shortcutDisplay';
import { getShellUiState, subscribeToShellUi } from './shellStore';
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
const itemClass =
  'flex cursor-pointer select-none items-center justify-between gap-6 rounded px-3 py-1 outline-none data-[highlighted]:bg-accent-soft data-[disabled]:pointer-events-none data-[disabled]:text-slate-400';
const triggerClass =
  'rounded px-2.5 py-1 text-sm text-slate-800 outline-none hover:bg-slate-100 data-[state=open]:bg-slate-100 focus-visible:ring-2 focus-visible:ring-accent';

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

interface RenderContext {
  readonly registry: CommandRegistry;
  readonly ctx: CommandContext;
}

const display = (command: Command, override?: string) =>
  `${override ?? command.label}${command.opensDialog ? '…' : ''}`;

function Shortcut({ value }: { value: string | undefined }) {
  return value ? <span className="text-slate-500">{formatShortcut(value)}</span> : null;
}

function FamilyItems({
  family,
  render,
}: {
  family: CommandFamily<unknown>;
  render: RenderContext;
}) {
  const enabled = family.enabled ? family.enabled(render.ctx) : true;
  return (
    <>
      {family.variants.map((variant) => {
        const testId = `menu-item-${variant.testId ?? `${family.id}-${JSON.stringify(variant.arg)}`}`;
        if (family.checked) {
          return (
            <Menubar.CheckboxItem
              key={testId}
              className={itemClass}
              data-testid={testId}
              disabled={!enabled}
              checked={family.checked(render.ctx, variant.arg)}
              // A filter bit: keep the menu open so several can be toggled in a row.
              onSelect={(event) => {
                event.preventDefault();
                void invokeCommand(family.id, variant.arg, render.registry);
              }}
            >
              <span>{variant.label}</span>
              <Menubar.ItemIndicator>✓</Menubar.ItemIndicator>
            </Menubar.CheckboxItem>
          );
        }
        return (
          <Menubar.Item
            key={testId}
            className={itemClass}
            data-testid={testId}
            disabled={!enabled}
            onSelect={() => void invokeCommand(family.id, variant.arg, render.registry)}
          >
            <span>{variant.label}</span>
          </Menubar.Item>
        );
      })}
    </>
  );
}

function SubMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Menubar.Sub>
      <Menubar.SubTrigger className={itemClass} data-testid={`menu-sub-${slug(label)}`}>
        <span>{label}</span>
        <span aria-hidden="true" className="text-slate-500">
          ▸
        </span>
      </Menubar.SubTrigger>
      <Menubar.Portal>
        <Menubar.SubContent className={contentClass} sideOffset={2} alignOffset={-4}>
          {children}
        </Menubar.SubContent>
      </Menubar.Portal>
    </Menubar.Sub>
  );
}

function NodeView({ node, render }: { node: MenuNode; render: RenderContext }) {
  const recentScores = useSyncExternalStore(
    subscribeToShellUi,
    () => getShellUiState().recentScores,
    () => getShellUiState().recentScores,
  );

  if (node.kind === 'separator') {
    return <Menubar.Separator className="my-1 h-px bg-slate-200" />;
  }

  if (node.kind === 'submenu') {
    return (
      <SubMenu label={node.label}>
        <NodeList nodes={node.children} render={render} />
      </SubMenu>
    );
  }

  if (node.kind === 'recentScores') {
    return (
      <SubMenu label="Open Recent">
        {recentScores.length === 0 ? (
          <Menubar.Item className={itemClass} disabled data-testid="menu-item-recent-empty">
            No recent scores
          </Menubar.Item>
        ) : (
          recentScores.slice(0, 10).map((score) => (
            <Menubar.Item
              key={score.scoreId}
              className={itemClass}
              data-testid="menu-item-recent-score"
              onSelect={() =>
                void invokeCommand('file.openRecent', { scoreId: score.scoreId }, render.registry)
              }
            >
              <span className="max-w-[18rem] truncate">{score.title || score.scoreId}</span>
            </Menubar.Item>
          ))
        )}
      </SubMenu>
    );
  }

  const entry = render.registry.get(node.id);
  if (!entry) return null;

  if (isCommandFamily(entry)) {
    const family = entry as unknown as CommandFamily<unknown>;
    if (node.kind === 'item') {
      // One variant of a family, with its own label ("Zoom to 100%").
      const variant = family.variants.find(
        (candidate) => JSON.stringify(candidate.arg) === JSON.stringify(node.arg),
      );
      const enabled = family.enabled ? family.enabled(render.ctx) : true;
      return (
        <Menubar.Item
          className={itemClass}
          data-testid={`menu-item-${node.id}-${slug(String(node.label ?? variant?.label ?? ''))}`}
          disabled={!enabled}
          onSelect={() => void invokeCommand(node.id, node.arg, render.registry)}
        >
          <span>{node.label ?? variant?.label ?? family.label}</span>
          <Shortcut value={primaryShortcut(node.id, node.arg)} />
        </Menubar.Item>
      );
    }
    if (node.inline) return <FamilyItems family={family} render={render} />;
    return (
      <SubMenu label={node.label ?? family.label}>
        <FamilyItems family={family} render={render} />
      </SubMenu>
    );
  }

  const command = entry as unknown as Command;
  const enabled = command.enabled ? command.enabled(render.ctx) : true;
  const testId = `menu-item-${command.id}`;
  if (command.checked) {
    return (
      <Menubar.CheckboxItem
        className={itemClass}
        data-testid={testId}
        disabled={!enabled}
        checked={command.checked(render.ctx)}
        onSelect={() => void invokeCommand(command.id, undefined, render.registry)}
      >
        <span>{display(command, node.kind === 'item' ? node.label : undefined)}</span>
        <span className="flex items-center gap-2">
          <Shortcut value={primaryShortcut(command.id)} />
          <Menubar.ItemIndicator>✓</Menubar.ItemIndicator>
        </span>
      </Menubar.CheckboxItem>
    );
  }
  return (
    <Menubar.Item
      className={itemClass}
      data-testid={testId}
      disabled={!enabled}
      onSelect={() => void invokeCommand(command.id, undefined, render.registry)}
    >
      <span>{display(command, node.kind === 'item' ? node.label : undefined)}</span>
      <Shortcut value={primaryShortcut(command.id)} />
    </Menubar.Item>
  );
}

function NodeList({ nodes, render }: { nodes: readonly MenuNode[]; render: RenderContext }) {
  const pruned = pruneMenuNodes(nodes, render.registry);
  return (
    <>
      {pruned.map((node, index) => (
        <NodeView key={index} node={node} render={render} />
      ))}
    </>
  );
}

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
  const render: RenderContext = { registry, ctx };

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
                <SubMenu key={menu.id} label={menu.label}>
                  <NodeList nodes={menu.children} render={render} />
                </SubMenu>
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
              <NodeList nodes={menu.children} render={render} />
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
