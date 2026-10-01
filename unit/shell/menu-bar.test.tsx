import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuBar } from '../../components/shell/MenuBar';
import type { MenuDefinition } from '../../components/shell/menus';
import {
  closeCommandForm,
  getShellUiState,
  resetShellUiForTests,
  setRecentScores,
} from '../../components/shell/shellStore';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { defineCommand, defineFamily, type CommandContext } from '../../lib/commands/types';

beforeEach(() => {
  // Radix positions menus with ResizeObserver, which jsdom lacks.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  resetShellUiForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  closeCommandForm();
});

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  ...DEFAULT_COMMAND_CONTEXT,
  hasScore: true,
  isMutable: true,
  ...over,
});

function setup(menus: readonly MenuDefinition[], context = ctx()) {
  const registry = new CommandRegistry();
  registry.setContextSource(() => context);
  const run = {
    undo: vi.fn(),
    export: vi.fn(),
    palettes: vi.fn(),
    clef: vi.fn(),
    filter: vi.fn(),
    open: vi.fn(),
    recent: vi.fn(),
  };
  registry.register('global', [
    defineCommand({
      id: 'edit.undo',
      label: 'Undo',
      shortcut: 'Mod+Z',
      enabled: (c) => c.isMutable,
      run: run.undo,
    }),
    defineCommand({
      id: 'file.export.pdf',
      label: 'Export PDF',
      enabled: (c) => c.hasScore,
      run: run.export,
    }),
    defineCommand({
      id: 'file.open',
      label: 'Open Score',
      opensDialog: true,
      run: run.open,
    }),
    defineCommand({
      id: 'view.panel.palettes',
      label: 'Palettes',
      checked: () => true,
      run: run.palettes,
    }),
    defineFamily<number>({
      id: 'add.clef',
      label: 'Clef',
      variants: [
        { arg: 0, label: 'Treble' },
        { arg: 20, label: 'Bass' },
      ],
      run: run.clef,
    }),
    defineFamily<number>({
      id: 'edit.selectionFilter',
      label: 'Selection Filter',
      variants: [
        { arg: 1, label: 'Voice 1' },
        { arg: 2, label: 'Voice 2' },
      ],
      checked: (_c, bit) => bit === 1,
      run: run.filter,
    }),
    defineCommand<{ scoreId: string }>({
      id: 'file.openRecent',
      label: 'Open Recent',
      run: run.recent,
    }),
    defineCommand({
      id: 'add.measures',
      label: 'Insert Measures',
      opensDialog: true,
      run: vi.fn(),
    }),
  ]);
  const view = render(<MenuBar registry={registry} menus={menus} />);
  return { registry, run, view, user: userEvent.setup() };
}

const FILE_EDIT: MenuDefinition[] = [
  {
    id: 'file',
    label: 'File',
    children: [
      { kind: 'item', id: 'file.open' },
      { kind: 'recentScores' },
      { kind: 'separator' },
      { kind: 'submenu', label: 'Export', children: [{ kind: 'item', id: 'file.export.pdf' }] },
      { kind: 'item', id: 'not.registered' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    children: [
      { kind: 'item', id: 'edit.undo' },
      { kind: 'family', id: 'edit.selectionFilter' },
      { kind: 'family', id: 'add.clef', label: 'Clefs' },
      { kind: 'item', id: 'add.clef', label: 'Bass clef', arg: 20 },
      { kind: 'item', id: 'view.panel.palettes' },
      { kind: 'item', id: 'add.measures' },
    ],
  },
];

// Items inside a submenu are clicked with fireEvent: jsdom has no pointer geometry, so Radix's
// submenu pointer-grace area closes the submenu before user-event's pointer reaches its items.
describe('MenuBar', () => {
  it('is a menubar with one trigger per menu', () => {
    setup(FILE_EDIT);
    expect(screen.getByRole('menubar')).toBeInTheDocument();
    expect(screen.getByTestId('menu-file')).toHaveTextContent('File');
    expect(screen.getByTestId('menu-edit')).toHaveTextContent('Edit');
  });

  it('opens a menu and runs the command a user picks', async () => {
    const { user, run } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(await screen.findByTestId('menu-item-edit.undo'));
    expect(run.undo).toHaveBeenCalledOnce();
  });

  it('shows the command label, an ellipsis for dialogs, and the shortcut', async () => {
    const { user } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-edit'));
    const undo = await screen.findByTestId('menu-item-edit.undo');
    expect(undo).toHaveTextContent('Undo');
    expect(undo.textContent).toMatch(/Ctrl\+Z|⌘Z/);
    expect(screen.getByTestId('menu-item-add.measures')).toHaveTextContent('Insert Measures…');
  });

  it('shows a command as disabled when its enabled predicate says so, and does not run it', async () => {
    const { user, run } = setup(FILE_EDIT, ctx({ isMutable: false }));
    await user.click(screen.getByTestId('menu-edit'));
    const undo = await screen.findByTestId('menu-item-edit.undo');
    expect(undo).toHaveAttribute('data-disabled');
    await user.click(undo);
    expect(run.undo).not.toHaveBeenCalled();
  });

  it('hides entries whose command is not registered', async () => {
    const { user } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-file'));
    await screen.findByTestId('menu-item-file.open');
    expect(screen.queryByTestId('menu-item-not.registered')).toBeNull();
  });

  it('opens a submenu and runs an item inside it', async () => {
    const { user, run } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-file'));
    await user.click(await screen.findByTestId('menu-sub-export'));
    fireEvent.click(await screen.findByTestId('menu-item-file.export.pdf'));
    expect(run.export).toHaveBeenCalledOnce();
  });

  it('renders a family as a submenu of its variants, passing each its argument', async () => {
    const { user, run } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(await screen.findByTestId('menu-sub-clefs'));
    fireEvent.click(await screen.findByText('Bass', { selector: '[role="menuitem"] span' }));
    expect(run.clef).toHaveBeenCalledWith(expect.anything(), 20);
  });

  it('gives one variant its own labelled item', async () => {
    const { user, run } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(await screen.findByText('Bass clef'));
    expect(run.clef).toHaveBeenCalledWith(expect.anything(), 20);
  });

  it('marks checked commands and checked family variants', async () => {
    const { user } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-edit'));
    expect(await screen.findByTestId('menu-item-view.panel.palettes')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByTestId('menu-sub-selection-filter'));
    const voices = await screen.findAllByRole('menuitemcheckbox', { name: /Voice/ });
    expect(voices.map((v) => v.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  });

  it('keeps the menu open when a filter bit is toggled', async () => {
    const { user, run } = setup(FILE_EDIT);
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(await screen.findByTestId('menu-sub-selection-filter'));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Voice 2/ }));
    expect(run.filter).toHaveBeenCalledWith(expect.anything(), 2);
    expect(screen.getByRole('menuitemcheckbox', { name: /Voice 2/ })).toBeInTheDocument();
  });

  it('opens an argument form instead of running a command that needs one', async () => {
    const { user, registry } = setup(FILE_EDIT);
    const run = vi.spyOn(registry, 'run');
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(await screen.findByTestId('menu-item-add.measures'));
    expect(getShellUiState().form).toBe('add.measures');
    expect(run).not.toHaveBeenCalled();
  });

  describe('Open Recent', () => {
    it('says so when there is nothing to open, and disables the entry', async () => {
      const { user } = setup(FILE_EDIT);
      await user.click(screen.getByTestId('menu-file'));
      await user.click(await screen.findByTestId('menu-sub-open-recent'));
      expect(await screen.findByTestId('menu-item-recent-empty')).toHaveTextContent(
        'No recent scores',
      );
      expect(screen.getByTestId('menu-item-recent-empty')).toHaveAttribute('data-disabled');
    });

    it('lists the last ten scores and opens the one chosen', async () => {
      const { user, run } = setup(FILE_EDIT);
      act(() =>
        setRecentScores(
          Array.from({ length: 12 }, (_, i) => ({
            scoreId: `id-${i}`,
            title: `Score ${i}`,
            lastUpdated: 100 - i,
          })),
        ),
      );
      await user.click(screen.getByTestId('menu-file'));
      await user.click(await screen.findByTestId('menu-sub-open-recent'));
      const items = await screen.findAllByTestId('menu-item-recent-score');
      expect(items).toHaveLength(10);
      fireEvent.click(items[3]);
      expect(run.recent).toHaveBeenCalledWith(expect.anything(), { scoreId: 'id-3' });
    });
  });

  it('collapses into one app menu in compact mode', async () => {
    const registry = new CommandRegistry();
    registry.register('global', [defineCommand({ id: 'edit.undo', label: 'Undo', run: vi.fn() })]);
    const user = userEvent.setup();
    render(<MenuBar registry={registry} menus={FILE_EDIT} compact />);
    expect(screen.queryByTestId('menu-file')).toBeNull();
    await user.click(screen.getByTestId('menu-app'));
    const content = await screen.findByRole('menu');
    expect(within(content).getByTestId('menu-sub-file')).toBeInTheDocument();
    expect(within(content).getByTestId('menu-sub-edit')).toBeInTheDocument();
  });

  it('re-evaluates enabled state when the editor context changes', async () => {
    const { user, registry, run } = setup(FILE_EDIT, ctx({ isMutable: false }));
    let current = ctx({ isMutable: false });
    registry.setContextSource(() => current);
    current = ctx({ isMutable: true });
    act(() => registry.invalidate());
    await user.click(screen.getByTestId('menu-edit'));
    await user.click(await screen.findByTestId('menu-item-edit.undo'));
    expect(run.undo).toHaveBeenCalledOnce();
  });
});
