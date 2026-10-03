// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash2, Music2 } from 'lucide-react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnnouncement } from '../../components/shell/announcer/announcerStore';
import { ToolStrip } from '../../components/shell/toolbar/strip/ToolStrip';
import { resetStripCollapsedForTests } from '../../components/shell/toolbar/strip/stripPersistence';
import type { StripGroup } from '../../components/shell/toolbar/strip/toolbarLayout';
import { needsSelection, needsRange } from '../../lib/commands/selectionGates';
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
  resetStripCollapsedForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GROUPS: StripGroup[] = [
  {
    id: 'edit',
    label: 'Edit',
    controls: [
      {
        kind: 'command',
        testId: 'btn-delete',
        label: 'Delete',
        icon: Trash2,
        commandId: 'edit.delete',
      },
      {
        kind: 'command',
        testId: 'btn-explode',
        label: 'Explode',
        icon: Music2,
        commandId: 'tools.explode',
      },
      {
        kind: 'command',
        testId: 'btn-palettes',
        label: 'Palettes',
        icon: Music2,
        commandId: 'view.palettes',
      },
      {
        kind: 'menu',
        testId: 'dropdown-export',
        label: 'Export',
        icon: Music2,
        items: [
          { testId: 'btn-export-pdf', label: 'PDF', commandId: 'file.export.pdf' },
          { testId: 'btn-export-midi', label: 'MIDI', commandId: 'file.export.midi' },
        ],
      },
      {
        kind: 'menu',
        testId: 'dropdown-filter',
        contentTestId: 'filter-menu',
        label: 'Filter',
        icon: Music2,
        commandId: 'edit.filter',
        checkable: true,
        items: [
          { testId: 'filter-1', label: 'Voice 1', arg: 1 },
          { testId: 'filter-2', label: 'Voice 2', arg: 2 },
        ],
      },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    controls: [
      { kind: 'command', testId: 'link-help', label: 'Help', icon: Music2, commandId: 'help.open' },
    ],
  },
];

function setup(
  context: Partial<CommandContext> = {},
  over: { filterMask?: number; palettes?: boolean; quick?: boolean } = {},
) {
  const run = {
    del: vi.fn(),
    explode: vi.fn(),
    palettes: vi.fn(),
    pdf: vi.fn(),
    midi: vi.fn(),
    filter: vi.fn(),
    help: vi.fn(),
  };
  let mask = over.filterMask ?? 1;
  const registry = new CommandRegistry();
  const full: CommandContext = {
    ...DEFAULT_COMMAND_CONTEXT,
    hasScore: true,
    isMutable: true,
    ...context,
  };
  registry.setContextSource(() => full);
  registry.register('global', [
    defineCommand({ id: 'edit.delete', label: 'Delete', enabled: needsSelection, run: run.del }),
    defineCommand({ id: 'tools.explode', label: 'Explode', enabled: needsRange, run: run.explode }),
    defineCommand({
      id: 'view.palettes',
      label: 'Palettes',
      checked: () => Boolean(over.palettes),
      run: run.palettes,
    }),
    defineCommand({ id: 'file.export.pdf', label: 'PDF', run: run.pdf }),
    defineCommand({
      id: 'file.export.midi',
      label: 'MIDI',
      enabled: (c) => c.hasScore && false,
      run: run.midi,
    }),
    defineFamily<number>({
      id: 'edit.filter',
      label: 'Filter',
      variants: [
        { arg: 1, label: 'Voice 1' },
        { arg: 2, label: 'Voice 2' },
      ],
      checked: (_c, bit) => Boolean(mask & bit),
      run: (_c, bit) => {
        mask ^= bit;
        run.filter(bit);
      },
    }),
    defineCommand({ id: 'help.open', label: 'Help', run: run.help }),
  ]);
  render(
    <ToolStrip groups={GROUPS} registry={registry}>
      {over.quick ? <div role="group" aria-label="Write" data-testid="quick-stub" /> : null}
    </ToolStrip>,
  );
  return { registry, run, user: userEvent.setup() };
}

describe('ToolStrip', () => {
  it('renders one labelled button per control, in groups, with the ribbon’s test ids', () => {
    setup({ selection: 'single' });
    const row = screen.getByRole('toolbar', { name: 'Write and tools' });
    expect(within(row).getByRole('group', { name: 'Edit' })).toBeInTheDocument();
    expect(within(row).getByRole('group', { name: 'Help' })).toBeInTheDocument();
    for (const id of [
      'btn-delete',
      'btn-explode',
      'btn-palettes',
      'dropdown-export',
      'dropdown-filter',
      'link-help',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId('btn-delete')).toHaveAccessibleName('Delete');
  });

  it('runs the command when an available button is clicked', async () => {
    const { run, user } = setup({ selection: 'single' });
    await user.click(screen.getByTestId('btn-delete'));
    expect(run.del).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('link-help'));
    expect(run.help).toHaveBeenCalledTimes(1);
  });

  it('keeps an unavailable button focusable, does nothing, and says why', async () => {
    const { run, user } = setup({ selection: 'none' });
    const button = screen.getByTestId('btn-delete');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(run.del).not.toHaveBeenCalled();
    expect(getAnnouncement().text).toBe('Delete: Select something first');
    act(() => button.focus());
    expect(button).toHaveFocus();
  });

  it('tells a different story for a gate that needs a range', async () => {
    const { user } = setup({ selection: 'single' });
    await user.click(screen.getByTestId('btn-explode'));
    expect(getAnnouncement().text).toBe('Explode: Select a range of bars or notes');
  });

  it('shows a toggle as pressed or not, from the command', () => {
    cleanup();
    setup({}, { palettes: true });
    expect(screen.getByTestId('btn-palettes')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('btn-delete')).not.toHaveAttribute('aria-pressed');
    cleanup();
    setup({}, { palettes: false });
    expect(screen.getByTestId('btn-palettes')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens a menu whose items run their own commands, and disables the ones that cannot run', async () => {
    const { run, user } = setup({ selection: 'single' });
    await user.click(screen.getByTestId('dropdown-export'));
    const midi = await screen.findByTestId('btn-export-midi');
    expect(midi).toHaveAttribute('data-disabled');
    await user.click(screen.getByTestId('btn-export-pdf'));
    expect(run.pdf).toHaveBeenCalledTimes(1);
    expect(run.midi).not.toHaveBeenCalled();
  });

  it('does not open a menu in which nothing can run, and says why', async () => {
    cleanup();
    const registry = new CommandRegistry();
    registry.setContextSource(() => ({
      ...DEFAULT_COMMAND_CONTEXT,
      hasScore: false,
      isMutable: false,
    }));
    registry.register('global', [
      defineCommand({ id: 'file.export.pdf', label: 'PDF', enabled: needsSelection, run: vi.fn() }),
      defineCommand({
        id: 'file.export.midi',
        label: 'MIDI',
        enabled: needsSelection,
        run: vi.fn(),
      }),
    ]);
    render(<ToolStrip groups={[GROUPS[0]]} registry={registry} />);
    const user = userEvent.setup();
    const trigger = screen.getByTestId('dropdown-export');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await user.click(trigger);
    expect(screen.queryByTestId('btn-export-pdf')).toBeNull();
    expect(getAnnouncement().text).toBe('Export: This score is read-only here');
  });

  it('shows checkable items with their state, toggles one without closing the menu', async () => {
    const { run, user } = setup({ selection: 'single' }, { filterMask: 1 });
    await user.click(screen.getByTestId('dropdown-filter'));
    expect(await screen.findByTestId('filter-menu')).toBeInTheDocument();
    expect(screen.getByTestId('filter-1')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('filter-2')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByTestId('filter-2'));
    expect(run.filter).toHaveBeenCalledWith(2);
    expect(screen.getByTestId('filter-menu')).toBeInTheDocument();
  });

  it('is one tab stop, and arrow keys move between controls, Home and End to the ends', () => {
    setup({ selection: 'single' });
    const ids = [
      'btn-delete',
      'btn-explode',
      'btn-palettes',
      'dropdown-export',
      'dropdown-filter',
      'link-help',
    ];
    const tabStops = ids.filter((id) => screen.getByTestId(id).getAttribute('tabindex') === '0');
    expect(tabStops).toEqual(['btn-delete']);
    act(() => screen.getByTestId('btn-delete').focus());
    fireEvent.keyDown(screen.getByTestId('btn-delete'), { key: 'ArrowRight' });
    expect(screen.getByTestId('btn-explode')).toHaveFocus();
    expect(screen.getByTestId('btn-explode')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('btn-delete')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(screen.getByTestId('btn-explode'), { key: 'End' });
    expect(screen.getByTestId('link-help')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('link-help'), { key: 'ArrowRight' });
    expect(screen.getByTestId('link-help')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('link-help'), { key: 'Home' });
    expect(screen.getByTestId('btn-delete')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('btn-delete'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('btn-delete')).toHaveFocus();
  });

  it('collapses to a bar and remembers it', async () => {
    const { user } = setup({ selection: 'single' });
    expect(screen.getByTestId('tool-strip')).toHaveAttribute('data-collapsed', 'false');
    await user.click(screen.getByTestId('btn-tool-strip-toggle'));
    expect(screen.getByTestId('tool-strip')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('btn-delete')).toBeNull();
    expect(screen.getByTestId('btn-tool-strip-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem('ots.toolstrip.collapsed')).toBe('1');
    cleanup();
    // A new page load: nothing in memory, only what storage holds.
    resetStripCollapsedForTests();
    setup({ selection: 'single' });
    await act(async () => {});
    expect(screen.getByTestId('tool-strip')).toHaveAttribute('data-collapsed', 'true');
    await userEvent.setup().click(screen.getByTestId('btn-tool-strip-toggle'));
    expect(screen.getByTestId('btn-delete')).toBeInTheDocument();
    expect(window.localStorage.getItem('ots.toolstrip.collapsed')).toBe('0');
  });

  it('still works when browser storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    setup({ selection: 'single' });
    expect(screen.getByTestId('btn-delete')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-tool-strip-toggle'));
    expect(screen.getByTestId('tool-strip')).toHaveAttribute('data-collapsed', 'true');
    vi.restoreAllMocks();
  });

  it('is one flowing toolbar with no scrollbar: the quick controls come first and the tools wrap after them', () => {
    setup({ selection: 'single' }, { quick: true });
    const row = screen.getByTestId('tool-strip-row');
    expect(row.className).toContain('flex-wrap');
    expect(row.className).not.toContain('overflow');
    expect(row.firstElementChild).toContainElement(screen.getByTestId('quick-stub'));
    expect(row).toContainElement(screen.getByTestId('btn-delete'));
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).toBeNull();
  });

  it('keeps the quick controls when the tools are hidden, and shows the tools again from the toggle', async () => {
    const { user } = setup({ selection: 'single' }, { quick: true });
    await user.click(screen.getByTestId('btn-tool-strip-toggle'));
    expect(screen.getByTestId('quick-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-delete')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Edit' })).toBeNull();
    await user.click(screen.getByTestId('btn-tool-strip-toggle'));
    expect(screen.getByTestId('btn-delete')).toBeInTheDocument();
  });
});
