import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellHeader } from '../../components/shell/ShellHeader';
import { buildShellOwnCommands } from '../../components/shell/shellCommands';
import {
  closePalette,
  getShellUiState,
  resetShellUiForTests,
  setShortcutsOpen,
} from '../../components/shell/shellStore';
import { CommandRegistry } from '../../lib/commands/registry';
import { defineCommand } from '../../lib/commands/types';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  resetShellUiForTests();
});
afterEach(() => {
  closePalette();
  setShortcutsOpen(false);
  vi.unstubAllGlobals();
});

describe('ShellHeader', () => {
  it('is the banner, with the score title', () => {
    render(<ShellHeader title="Cello Suite 1" dirty={false} registry={new CommandRegistry()} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('shell-title')).toHaveTextContent('Cello Suite 1');
    expect(screen.queryByTestId('shell-dirty-dot')).toBeNull();
  });

  it('falls back to a name for an untitled score', () => {
    render(<ShellHeader title="" dirty={false} registry={new CommandRegistry()} />);
    expect(screen.getByTestId('shell-title')).toHaveTextContent('Untitled score');
  });

  it('shows a dot, with an accessible name, when changed since the last checkpoint', () => {
    render(<ShellHeader title="T" dirty registry={new CommandRegistry()} />);
    expect(
      screen.getByRole('img', { name: 'Changes since the last checkpoint' }),
    ).toBeInTheDocument();
  });

  it('registers the shell’s own commands while mounted', () => {
    const registry = new CommandRegistry();
    const view = render(<ShellHeader title="T" dirty={false} registry={registry} />);
    expect(registry.ids().sort()).toEqual(
      buildShellOwnCommands()
        .map((c) => c.id)
        .sort(),
    );
    view.unmount();
    expect(registry.ids()).toEqual([]);
  });

  it('opens the palette from its button, and from the shortcut', async () => {
    const user = userEvent.setup();
    render(<ShellHeader title="T" dirty={false} registry={new CommandRegistry()} />);
    await user.click(screen.getByTestId('shell-palette-button'));
    expect(await screen.findByTestId('command-palette')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(getShellUiState().palette.open).toBe(false);

    await user.keyboard('{Control>}{Shift>}P{/Shift}{/Control}');
    expect(await screen.findByTestId('command-palette')).toBeInTheDocument();
    // The same key closes it.
    await user.keyboard('{Control>}{Shift>}P{/Shift}{/Control}');
    expect(getShellUiState().palette.open).toBe(false);
  });

  it('opens go-to from Mod+F', async () => {
    const user = userEvent.setup();
    render(<ShellHeader title="T" dirty={false} registry={new CommandRegistry()} />);
    await user.keyboard('{Control>}f{/Control}');
    expect(getShellUiState().palette).toEqual({ open: true, mode: 'goto' });
  });

  it('shows the shortcuts list from Help ▸ Keyboard Shortcuts', async () => {
    const registry = new CommandRegistry();
    render(<ShellHeader title="T" dirty={false} registry={registry} />);
    await act(async () => {
      await registry.run('help.shortcuts');
    });
    const dialog = await screen.findByTestId('shortcuts-dialog');
    expect(dialog).toHaveTextContent('Slur');
    expect(dialog).toHaveTextContent('Command Palette');
    expect(dialog).toHaveTextContent('Instruments')
  });

  it('runs a menu command through the registry', async () => {
    const user = userEvent.setup();
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register('global', [
      defineCommand({ id: 'checkpoint.save', label: 'Save Checkpoint', run }),
    ]);
    render(<ShellHeader title="T" dirty={false} registry={registry} />);
    await user.click(screen.getByTestId('menu-file'));
    await user.click(await screen.findByTestId('menu-item-checkpoint.save'));
    expect(run).toHaveBeenCalledOnce();
  });
});
