// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash2, Music2 } from 'lucide-react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnnouncement } from '../../components/shell/announcer/announcerStore';
import { ToolStrip } from '../../components/shell/toolbar/strip/ToolStrip';
import {
  resetLastUsedForTests,
  resetStripCollapsedForTests,
} from '../../components/shell/toolbar/strip/stripPersistence';
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
  resetLastUsedForTests();
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
        testId: 'dropdown-lines',
        contentTestId: 'lines-menu',
        label: 'Lines',
        icon: Music2,
        items: [
          {
            testId: 'btn-ottava-0',
            label: '8va',
            commandId: 'add.line.ottava',
            arg: 0,
            section: 'Ottava',
            glyph: '\uE511',
          },
          { testId: 'btn-ottava-1', label: '8vb', commandId: 'add.line.ottava', arg: 1 },
          {
            testId: 'btn-trill-0',
            label: 'Trill line',
            commandId: 'add.line.trill',
            arg: 0,
            section: 'Trill lines',
          },
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
    ottava: vi.fn(),
    trill: vi.fn(),
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
    defineFamily<number>({
      id: 'add.line.ottava',
      label: 'Ottava',
      variants: [
        { arg: 0, label: '8va' },
        { arg: 1, label: '8vb' },
      ],
      run: (_c, arg) => run.ottava(arg),
    }),
    defineFamily<number>({
      id: 'add.line.trill',
      label: 'Trill',
      variants: [{ arg: 0, label: 'Trill line' }],
      enabled: needsRange,
      run: (_c, arg) => run.trill(arg),
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

  describe('menus with sections and glyphs', () => {
    it('shows a heading above each section, and a glyph beside the items that have one', async () => {
      const { user } = setup({ selection: 'single' });
      await user.click(screen.getByTestId('dropdown-lines'));
      const menu = await screen.findByTestId('lines-menu');
      expect(within(menu).getByText('Ottava')).toBeInTheDocument();
      expect(within(menu).getByText('Trill lines')).toBeInTheDocument();
      // Headings are not items: only the three actions can be chosen.
      expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
      expect(within(screen.getByTestId('btn-ottava-0')).getByText('\uE511')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(within(screen.getByTestId('btn-ottava-1')).queryByText('\uE511')).toBeNull();
      expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
    });

    it('runs the item\u2019s own command with its own argument, and disables an item whose command cannot run', async () => {
      const { run, user } = setup({ selection: 'single' });
      await user.click(screen.getByTestId('dropdown-lines'));
      await user.click(await screen.findByTestId('btn-ottava-1'));
      expect(run.ottava).toHaveBeenCalledWith(1);
      await user.click(screen.getByTestId('dropdown-lines'));
      const trill = await screen.findByTestId('btn-trill-0');
      expect(trill).toHaveAttribute('data-disabled');
      await user.click(trill);
      expect(run.trill).not.toHaveBeenCalled();
    });
  });
});

describe('split buttons', () => {
  const DYNAMICS: StripGroup[] = [
    {
      id: 'marks',
      label: 'Marks',
      controls: [
        {
          kind: 'menu',
          testId: 'dropdown-markings',
          contentTestId: 'markings-menu',
          label: 'Dynamics',
          icon: Music2,
          split: true,
          columns: 3,
          items: [
            {
              testId: 'btn-dynamic-6',
              label: 'p',
              commandId: 'add.mark.dynamic',
              arg: 6,
              glyph: '\uE520',
            },
            {
              testId: 'btn-dynamic-8',
              label: 'mf',
              commandId: 'add.mark.dynamic',
              arg: 8,
              glyph: '\uE521',
            },
            {
              testId: 'btn-dynamic-9',
              label: 'f',
              commandId: 'add.mark.dynamic',
              arg: 9,
              glyph: '\uE522',
            },
          ],
          footer: {
            testId: 'btn-open-dynamics-palette',
            label: 'Open dynamics palette',
            commandId: 'view.palette.open',
            arg: 'Dynamics',
          },
        },
      ],
    },
  ];

  function setupSplit(
    context: Partial<CommandContext> = {},
    over: { dynamicEnabled?: boolean } = {},
  ) {
    const dynamic = vi.fn();
    const palette = vi.fn();
    const registry = new CommandRegistry();
    registry.setContextSource(() => ({
      ...DEFAULT_COMMAND_CONTEXT,
      hasScore: true,
      isMutable: true,
      ...context,
    }));
    registry.register('global', [
      defineFamily<number>({
        id: 'add.mark.dynamic',
        label: 'Dynamic',
        variants: [
          { arg: 6, label: 'p' },
          { arg: 8, label: 'mf' },
          { arg: 9, label: 'f' },
        ],
        enabled: over.dynamicEnabled === false ? needsRange : needsSelection,
        run: (_c, arg) => dynamic(arg),
      }),
      defineCommand<string>({
        id: 'view.palette.open',
        label: 'Open palette',
        run: (_c, arg) => palette(arg),
      }),
    ]);
    render(<ToolStrip groups={DYNAMICS} registry={registry} />);
    return { dynamic, palette, user: userEvent.setup() };
  }
  const face = () => screen.getByTestId('dropdown-markings-last');

  it('starts on the first variant: its glyph on the face, and a click runs it', async () => {
    const { dynamic, user } = setupSplit({ selection: 'single' });
    expect(face()).toHaveAccessibleName('Dynamics: p');
    expect(within(face()).getByText('\uE520')).toBeInTheDocument();
    await user.click(face());
    expect(dynamic).toHaveBeenCalledWith(6);
  });

  it('runs a variant chosen from the menu, and from then on the face runs that one', async () => {
    const { dynamic, user } = setupSplit({ selection: 'single' });
    await user.click(screen.getByTestId('dropdown-markings'));
    await user.click(await screen.findByTestId('btn-dynamic-9'));
    expect(dynamic).toHaveBeenLastCalledWith(9);
    expect(face()).toHaveAccessibleName('Dynamics: f');
    expect(within(face()).getByText('\uE522')).toBeInTheDocument();
    dynamic.mockClear();
    await user.click(face());
    expect(dynamic).toHaveBeenCalledWith(9);
  });

  it('remembers the choice across a reload, and ignores a remembered variant that no longer exists', async () => {
    const first = setupSplit({ selection: 'single' });
    await first.user.click(screen.getByTestId('dropdown-markings'));
    await first.user.click(await screen.findByTestId('btn-dynamic-8'));
    expect(JSON.parse(window.localStorage.getItem('ots.toolstrip.lastUsed')!)).toEqual({
      'dropdown-markings': 'btn-dynamic-8',
    });
    cleanup();
    resetLastUsedForTests();
    setupSplit({ selection: 'single' });
    expect(face()).toHaveAccessibleName('Dynamics: mf');
    cleanup();
    window.localStorage.setItem(
      'ots.toolstrip.lastUsed',
      JSON.stringify({ 'dropdown-markings': 'btn-dynamic-gone' }),
    );
    resetLastUsedForTests();
    setupSplit({ selection: 'single' });
    expect(face()).toHaveAccessibleName('Dynamics: p');
  });

  it('survives a corrupt remembered value and unavailable storage', () => {
    window.localStorage.setItem('ots.toolstrip.lastUsed', '{not json');
    resetLastUsedForTests();
    setupSplit({ selection: 'single' });
    expect(face()).toHaveAccessibleName('Dynamics: p');
  });

  it('lays a glyph menu out as a grid of labelled cells with the footer spanning the width', async () => {
    const { palette, user } = setupSplit({ selection: 'single' });
    await user.click(screen.getByTestId('dropdown-markings'));
    const menu = await screen.findByTestId('markings-menu');
    expect(menu).toHaveStyle({ display: 'grid', gridTemplateColumns: 'repeat(3, 2.25rem)' });
    const cell = screen.getByTestId('btn-dynamic-8');
    expect(cell).toHaveAccessibleName('mf');
    expect(cell).toHaveAttribute('aria-label', 'mf');
    expect(cell).toHaveAttribute('title', 'mf');
    const footer = screen.getByTestId('btn-open-dynamics-palette');
    expect(footer).toHaveStyle({ gridColumn: '1 / -1' });
    await user.click(footer);
    expect(palette).toHaveBeenCalledWith('Dynamics');
    // Opening the palette is not a variant: the face still runs the first one.
    expect(face()).toHaveAccessibleName('Dynamics: p');
  });

  it('does nothing from the face when that variant cannot run, and says why', async () => {
    const { dynamic, user } = setupSplit({ selection: 'none' });
    expect(face()).toHaveAttribute('aria-disabled', 'true');
    await user.click(face());
    expect(dynamic).not.toHaveBeenCalled();
    expect(getAnnouncement().text).toBe('Dynamics: p: Select something first');
    expect(screen.getByTestId('dropdown-markings')).toHaveAttribute('aria-disabled', 'true');
  });

  it('opens with ArrowDown on the face, and the pair is one tab stop', async () => {
    const { user } = setupSplit({ selection: 'single' });
    expect(face()).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('dropdown-markings')).toHaveAttribute('tabindex', '-1');
    act(() => face().focus());
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByTestId('markings-menu')).toBeInTheDocument();
  });

  it('remembers each split button separately: choosing in one does not forget the other', async () => {
    const second: StripGroup = {
      id: 'other',
      label: 'Other',
      controls: [
        {
          kind: 'menu',
          testId: 'dropdown-other',
          label: 'Other',
          icon: Music2,
          split: true,
          items: [
            { testId: 'other-1', label: 'One', commandId: 'add.mark.dynamic', arg: 6 },
            { testId: 'other-2', label: 'Two', commandId: 'add.mark.dynamic', arg: 8 },
          ],
        },
      ],
    };
    const registry = new CommandRegistry();
    registry.setContextSource(() => ({
      ...DEFAULT_COMMAND_CONTEXT,
      hasScore: true,
      isMutable: true,
      selection: 'single',
    }));
    registry.register('global', [
      defineFamily<number>({
        id: 'add.mark.dynamic',
        label: 'Dynamic',
        variants: [
          { arg: 6, label: 'p' },
          { arg: 8, label: 'mf' },
        ],
        run: () => {},
      }),
    ]);
    render(<ToolStrip groups={[DYNAMICS[0], second]} registry={registry} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('dropdown-markings'));
    await user.click(await screen.findByTestId('btn-dynamic-9'));
    await user.click(screen.getByTestId('dropdown-other'));
    await user.click(await screen.findByTestId('other-2'));
    expect(screen.getByTestId('dropdown-markings-last')).toHaveAccessibleName('Dynamics: f');
    expect(screen.getByTestId('dropdown-other-last')).toHaveAccessibleName('Other: Two');
  });
});

describe('form buttons', () => {
  const TEMPO: StripGroup[] = [
    {
      id: 'text',
      label: 'Text',
      controls: [
        {
          kind: 'form',
          testId: 'btn-tempo-open',
          label: 'Tempo',
          icon: Music2,
          commandId: 'add.text.tempo',
        },
      ],
    },
  ];

  function setupForm(context: Partial<CommandContext> = {}) {
    const tempo = vi.fn();
    const registry = new CommandRegistry();
    registry.setContextSource(() => ({
      ...DEFAULT_COMMAND_CONTEXT,
      hasScore: true,
      isMutable: true,
      ...context,
    }));
    registry.register('global', [
      defineCommand<{ bpm?: number } | undefined>({
        id: 'add.text.tempo',
        label: 'Tempo',
        enabled: needsSelection,
        run: (_c, args) => tempo(args),
      }),
    ]);
    render(<ToolStrip groups={TEMPO} registry={registry} />);
    return { tempo, user: userEvent.setup() };
  }

  it('opens the command’s form in a popover and runs the command with what was entered', async () => {
    const { tempo, user } = setupForm({ selection: 'single' });
    await user.click(screen.getByTestId('btn-tempo-open'));
    const input = await screen.findByTestId('input-tempo-bpm');
    expect(input).toHaveValue(120);
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '96');
    await user.click(screen.getByTestId('btn-tempo-apply'));
    expect(tempo).toHaveBeenCalledWith({ bpm: 96 });
    expect(screen.queryByTestId('btn-tempo-open-form')).not.toBeInTheDocument();
  });

  it('submits with Enter, sanitising an empty value like the ribbon did', async () => {
    const { tempo, user } = setupForm({ selection: 'single' });
    await user.click(screen.getByTestId('btn-tempo-open'));
    const input = await screen.findByTestId('input-tempo-bpm');
    await user.clear(input);
    await user.keyboard('{Enter}');
    expect(tempo).toHaveBeenCalledWith({ bpm: 120 });
  });

  it('cancels without running, and reopens from the defaults', async () => {
    const { tempo, user } = setupForm({ selection: 'single' });
    await user.click(screen.getByTestId('btn-tempo-open'));
    const input = await screen.findByTestId('input-tempo-bpm');
    await user.clear(input);
    await user.type(input, '50');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(tempo).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('btn-tempo-open'));
    expect(await screen.findByTestId('input-tempo-bpm')).toHaveValue(120);
  });

  it('does not open when the command cannot run, and says why', async () => {
    const { tempo, user } = setupForm({ selection: 'none' });
    const button = screen.getByTestId('btn-tempo-open');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(screen.queryByTestId('input-tempo-bpm')).not.toBeInTheDocument();
    expect(tempo).not.toHaveBeenCalled();
    expect(getAnnouncement().text).toBe('Tempo: Select something first');
  });
});
