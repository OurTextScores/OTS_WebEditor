import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '../../components/shell/CommandPalette';
import {
  closeCommandForm,
  closePalette,
  getShellUiState,
  openPalette,
  resetShellUiForTests,
} from '../../components/shell/shellStore';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { defineCommand, defineFamily, type CommandContext } from '../../lib/commands/types';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.localStorage.clear();
  resetShellUiForTests();
  // jsdom does not implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  closePalette();
  closeCommandForm();
  vi.unstubAllGlobals();
});

function setup(context: Partial<CommandContext> = {}) {
  const registry = new CommandRegistry();
  const full: CommandContext = {
    ...DEFAULT_COMMAND_CONTEXT,
    hasScore: true,
    isMutable: true,
    ...context,
  };
  registry.setContextSource(() => full);
  const run = {
    pdf: vi.fn(),
    undo: vi.fn(),
    clef: vi.fn(),
    bar: vi.fn(),
    page: vi.fn(),
    mark: vi.fn(),
  };
  registry.register('global', [
    defineCommand({
      id: 'file.export.pdf',
      label: 'Export PDF',
      keywords: ['download'],
      run: run.pdf,
    }),
    defineCommand({
      id: 'edit.undo',
      label: 'Undo',
      shortcut: 'Mod+Z',
      enabled: (c) => c.canUndo,
      run: run.undo,
    }),
    defineCommand({ id: 'add.measures', label: 'Insert Measures', run: vi.fn() }),
    defineFamily<number>({
      id: 'add.clef',
      label: 'Clef',
      variants: [
        { arg: 0, label: 'Treble' },
        { arg: 20, label: 'Bass' },
      ],
      run: run.clef,
    }),
    defineCommand<number>({ id: 'view.goto.bar', label: 'Go to Bar', run: run.bar }),
    defineCommand<number>({ id: 'view.goto.page', label: 'Go to Page', run: run.page }),
    defineCommand<string>({
      id: 'view.goto.rehearsal',
      label: 'Go to Rehearsal Mark',
      run: run.mark,
    }),
    defineCommand({ id: 'edit.repeat', label: 'Repeat', run: vi.fn() }),
  ]);
  render(<CommandPalette registry={registry} />);
  return { registry, run, user: userEvent.setup() };
}

const open = async (mode: 'commands' | 'goto' = 'commands') => {
  act(() => openPalette(mode));
  return screen.findByTestId('palette-input');
};

describe('CommandPalette', () => {
  it('is closed until opened, and closes on Escape', async () => {
    const { user } = setup();
    expect(screen.queryByTestId('command-palette')).toBeNull();
    await open();
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());
    expect(getShellUiState().palette.open).toBe(false);
  });

  it('lists commands and family variants', async () => {
    setup();
    await open();
    const titles = screen.getAllByTestId('palette-row').map((row) => row.textContent);
    expect(titles.some((t) => t?.includes('Export PDF'))).toBe(true);
    expect(titles.some((t) => t?.includes('Clef: Bass'))).toBe(true);
  });

  it('filters as the user types and runs the top match on Enter', async () => {
    const { user, run } = setup();
    await open();
    await user.keyboard('export');
    const rows = screen.getAllByTestId('palette-row');
    expect(rows).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(run.pdf).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());
  });

  it('moves with the arrow keys', async () => {
    const { user, run } = setup();
    await open();
    await user.keyboard('clef');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(run.clef).toHaveBeenCalledWith(expect.anything(), 20);
  });

  it('runs a family variant with its argument when clicked', async () => {
    const { user, run } = setup();
    await open();
    await user.keyboard('treble');
    await user.click(screen.getByTestId('palette-row'));
    expect(run.clef).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it('shows unavailable commands muted and does not run them', async () => {
    const { user, run } = setup({ canUndo: false });
    await open();
    await user.keyboard('undo');
    const row = screen.getByTestId('palette-row');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveTextContent('Unavailable');
    await user.keyboard('{Enter}');
    expect(run.undo).not.toHaveBeenCalled();
    // And it stays open: nothing happened, so there is nothing to dismiss.
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
  });

  it('shows the shortcut of an available command', async () => {
    setup({ canUndo: true });
    await open();
    expect(screen.getByText(/Ctrl\+Z|⌘Z/)).toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    const { user } = setup();
    await open();
    await user.keyboard('zzzzzz');
    expect(screen.getByTestId('palette-empty')).toHaveTextContent('No matching commands');
  });

  it('opens an argument form for a command that needs one', async () => {
    const { user } = setup();
    await open();
    await user.keyboard('insert');
    await user.keyboard('{Enter}');
    expect(getShellUiState().form).toBe('add.measures');
  });

  describe('recents', () => {
    it('puts what was run last at the top next time', async () => {
      const first = setup();
      await open();
      await first.user.keyboard('bass');
      await first.user.keyboard('{Enter}');
      await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());

      await open();
      const top = screen.getAllByTestId('palette-row')[0];
      expect(top).toHaveTextContent('Clef: Bass');
    });
  });

  describe('navigation', () => {
    it.each([
      ['m12', 'bar', 12],
      ['b3', 'bar', 3],
      ['p4', 'page', 4],
      ['rB', 'mark', 'B'],
    ] as const)('%s jumps within the score', async (query, which, arg) => {
      const { user, run } = setup();
      await open();
      await user.keyboard(query);
      const nav = screen.getByTestId('palette-navigate');
      expect(nav).toBeInTheDocument();
      await user.keyboard('{Enter}');
      expect(run[which === 'mark' ? 'mark' : which]).toHaveBeenCalledWith(expect.anything(), arg);
    });

    it('leads with the jump for a bar query', async () => {
      const { user } = setup();
      await open();
      await user.keyboard('m12');
      expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'palette-navigate');
    });

    it('does not let "rep" hijack a command search for "repeat"', async () => {
      const { user, run } = setup();
      await open();
      await user.keyboard('rep');
      // `rep` is not a mark, and the command is what is on top.
      expect(screen.queryByTestId('palette-navigate')).toBeNull();
      await user.keyboard('{Enter}');
      expect(run.mark).not.toHaveBeenCalled();
    });

    it('keeps a matching command above an ambiguous rehearsal jump', async () => {
      const { user } = setup();
      await open();
      await user.keyboard('re');
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('data-testid', 'palette-row');
      expect(
        within(options[options.length - 1]).getByText(/rehearsal mark e/i),
      ).toBeInTheDocument();
    });

    it('go-to mode takes a bare number as a bar and lists no commands', async () => {
      const { user, run } = setup();
      await open('goto');
      await user.keyboard('42');
      expect(screen.queryByTestId('palette-row')).toBeNull();
      await user.keyboard('{Enter}');
      expect(run.bar).toHaveBeenCalledWith(expect.anything(), 42);
    });

    it('go-to mode guides the user when nothing is typed', async () => {
      setup();
      await open('goto');
      expect(screen.getByTestId('palette-empty')).toHaveTextContent('Type a bar');
    });
  });
});
