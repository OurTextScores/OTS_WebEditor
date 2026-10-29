'use client';

import { primaryShortcut } from '../../lib/commands/bindings';
import React, { useSyncExternalStore } from 'react';
import {
  isCommandFamily,
  type Command,
  type CommandContext,
  type CommandFamily,
} from '../../lib/commands/types';
import { labelFor } from '../../lib/commands/dynamicLabels';
import { invokeCommand } from './invokeCommand';
import type { MenuNode } from './menus';
import { menuItemClass, slug, type MenuRenderContext } from './menuRender';
import { pruneMenuNodes } from './menuTree';
import { formatShortcut } from './shortcutDisplay';
import { getShellUiState, subscribeToShellUi } from './shellStore';

const display = (command: Command, ctx: CommandContext, override?: string) =>
  `${override ?? labelFor(command.id, command.label, ctx)}${command.opensDialog ? '…' : ''}`;

function Shortcut({ value }: { value: string | undefined }) {
  return value ? <span className="text-slate-500">{formatShortcut(value)}</span> : null;
}

function FamilyItems({
  family,
  render,
}: {
  family: CommandFamily<unknown>;
  render: MenuRenderContext;
}) {
  const { Item, CheckboxItem, ItemIndicator } = render.primitives;
  const enabled = family.enabled ? family.enabled(render.ctx) : true;
  return (
    <>
      {family.variants.map((variant) => {
        const testId = `${render.testIdPrefix}-item-${variant.testId ?? `${family.id}-${JSON.stringify(variant.arg)}`}`;
        if (family.checked) {
          return (
            <CheckboxItem
              key={testId}
              className={menuItemClass}
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
              <ItemIndicator>✓</ItemIndicator>
            </CheckboxItem>
          );
        }
        return (
          <Item
            key={testId}
            className={menuItemClass}
            data-testid={testId}
            disabled={!enabled}
            onSelect={() => void invokeCommand(family.id, variant.arg, render.registry)}
          >
            <span>{variant.label}</span>
          </Item>
        );
      })}
    </>
  );
}

export function MenuSubMenu({
  label,
  render,
  children,
}: {
  label: string;
  render: MenuRenderContext;
  children: React.ReactNode;
}) {
  const { Sub, SubTrigger, SubContent, Portal } = render.primitives;
  return (
    <Sub>
      <SubTrigger className={menuItemClass} data-testid={`${render.testIdPrefix}-sub-${slug(label)}`}>
        <span>{label}</span>
        <span aria-hidden="true" className="text-slate-500">
          ▸
        </span>
      </SubTrigger>
      <Portal>
        <SubContent className={render.contentClass} sideOffset={2} alignOffset={-4}>
          {children}
        </SubContent>
      </Portal>
    </Sub>
  );
}

function NodeView({ node, render }: { node: MenuNode; render: MenuRenderContext }) {
  const { Item, CheckboxItem, ItemIndicator, Separator } = render.primitives;
  const recentScores = useSyncExternalStore(
    subscribeToShellUi,
    () => getShellUiState().recentScores,
    () => getShellUiState().recentScores,
  );

  if (node.kind === 'separator') {
    return <Separator className="my-1 h-px bg-slate-200" />;
  }

  if (node.kind === 'submenu') {
    return (
      <MenuSubMenu label={node.label} render={render}>
        <MenuNodeList nodes={node.children} render={render} />
      </MenuSubMenu>
    );
  }

  if (node.kind === 'recentScores') {
    return (
      <MenuSubMenu label="Open Recent" render={render}>
        {recentScores.length === 0 ? (
          <Item
            className={menuItemClass}
            disabled
            data-testid={`${render.testIdPrefix}-item-recent-empty`}
          >
            No recent scores
          </Item>
        ) : (
          recentScores.slice(0, 10).map((score) => (
            <Item
              key={score.scoreId}
              className={menuItemClass}
              data-testid={`${render.testIdPrefix}-item-recent-score`}
              onSelect={() =>
                void invokeCommand('file.openRecent', { scoreId: score.scoreId }, render.registry)
              }
            >
              <span className="max-w-[18rem] truncate">{score.title || score.scoreId}</span>
            </Item>
          ))
        )}
      </MenuSubMenu>
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
        <Item
          className={menuItemClass}
          data-testid={`${render.testIdPrefix}-item-${node.id}-${slug(String(node.label ?? variant?.label ?? ''))}`}
          disabled={!enabled}
          onSelect={() => void invokeCommand(node.id, node.arg, render.registry)}
        >
          <span>{node.label ?? variant?.label ?? family.label}</span>
          <Shortcut value={primaryShortcut(node.id, node.arg)} />
        </Item>
      );
    }
    if (node.inline) return <FamilyItems family={family} render={render} />;
    return (
      <MenuSubMenu label={node.label ?? family.label} render={render}>
        <FamilyItems family={family} render={render} />
      </MenuSubMenu>
    );
  }

  const command = entry as unknown as Command;
  const enabled = command.enabled ? command.enabled(render.ctx) : true;
  const label = node.kind === 'item' ? node.label : undefined;
  const testId = `${render.testIdPrefix}-item-${command.id}${render.labelledTestIds && label ? `-${slug(label)}` : ''}`;
  const run = () =>
    void invokeCommand(
      command.id,
      node.kind === 'item' ? node.arg : undefined,
      render.registry,
      node.kind === 'item' ? node.formDefaults : undefined,
    );
  if (command.checked) {
    return (
      <CheckboxItem
        className={menuItemClass}
        data-testid={testId}
        disabled={!enabled}
        checked={command.checked(render.ctx)}
        onSelect={run}
      >
        <span>{display(command, render.ctx, label)}</span>
        <span className="flex items-center gap-2">
          <Shortcut value={primaryShortcut(command.id)} />
          <ItemIndicator>✓</ItemIndicator>
        </span>
      </CheckboxItem>
    );
  }
  return (
    <Item className={menuItemClass} data-testid={testId} disabled={!enabled} onSelect={run}>
      <span>{display(command, render.ctx, label)}</span>
      <Shortcut value={primaryShortcut(command.id)} />
    </Item>
  );
}

/** A command tree, pruned to what the registry holds. */
export function MenuNodeList({
  nodes,
  render,
}: {
  nodes: readonly MenuNode[];
  render: MenuRenderContext;
}) {
  const pruned = pruneMenuNodes(nodes, render.registry);
  return (
    <>
      {pruned.map((node, index) => (
        <NodeView key={index} node={node} render={render} />
      ))}
    </>
  );
}
