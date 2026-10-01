import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiToolPicker } from '../../components/shell/AiToolPicker';
import { InstrumentsPanel } from '../../components/shell/InstrumentsPanel';
import { LeftDock, type LeftDockProps } from '../../components/shell/LeftDock';
import { clearNotices } from '../../components/shell/notices';
import { resetShellUiForTests } from '../../components/shell/shellStore';
import type { WorkspaceDock, DockTab } from '../../components/shell/useWorkspaceDock';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { defineCommand, type CommandContext } from '../../lib/commands/types';

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
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  resetShellUiForTests();
  clearNotices();
});
afterEach(() => vi.unstubAllGlobals());

const dockWith = (tab: DockTab, over: Partial<WorkspaceDock> = {}): WorkspaceDock => ({
  open: true,
  tab,
  poppedOut: false,
  palettesDocked: true,
  palettesVisible: tab === 'palettes',
  isShowing: (t) => t === tab,
  show: vi.fn(),
  toggle: vi.fn(),
  close: vi.fn(),
  setPoppedOut: vi.fn(),
  togglePalettes: vi.fn(),
  openPalette: vi.fn(),
  ...over,
});

const props = (dock: WorkspaceDock, over: Partial<LeftDockProps> = {}): LeftDockProps => ({
  side: 'left',
  width: 300,
  min: 240,
  onResize: vi.fn(),
  dock,
  palettes: {
    disabled: false,
    dragEnabled: true,
    onApply: vi.fn(),
    category: null,
    onShowAll: vi.fn(),
  },
  instruments: { parts: [], groups: [] },
  inspector: { data: null, loading: false, disabled: false, onChange: vi.fn() },
  ...over,
});

describe('LeftDock', () => {
  it('has a tab per panel, with its shortcut, and marks the selected one', () => {
    render(<LeftDock {...props(dockWith('instruments'))} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Palettes',
      'Instruments',
      'Properties',
    ]);
    expect(screen.getByRole('tab', { name: 'Instruments' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Palettes' })).toHaveAttribute('title', 'Palettes (F9)');
    expect(screen.getByRole('tab', { name: 'Properties' })).toHaveAttribute(
      'title',
      'Properties (F8)',
    );
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'dock-tab-instruments');
  });

  it('switches tab and closes', async () => {
    const dock = dockWith('palettes');
    render(<LeftDock {...props(dock)} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Properties' }));
    expect(dock.show).toHaveBeenCalledWith('properties');
    screen.getByTestId('btn-dock-close').click();
    expect(dock.close).toHaveBeenCalledOnce();
  });

  describe('Palettes tab', () => {
    it('shows the searchable palettes and applies a clicked item', () => {
      const onApply = vi.fn();
      render(
        <LeftDock
          {...props(dockWith('palettes'), {
            palettes: { ...props(dockWith('palettes')).palettes, onApply },
          })}
        />,
      );
      expect(screen.getByTestId('palette-search')).toBeInTheDocument();
      expect(screen.getByText('All palettes')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('palette-search'), { target: { value: 'accent' } });
      screen.getByTestId('palette-item-articulation-3').click();
      expect(onApply).toHaveBeenCalledOnce();
    });

    it('scopes to a category, with a way back to all of them', () => {
      const onShowAll = vi.fn();
      const base = props(dockWith('palettes'));
      render(<LeftDock {...base} palettes={{ ...base.palettes, category: 'Clefs', onShowAll }} />);
      expect(screen.getByTestId('palette-category-clefs')).toBeInTheDocument();
      expect(screen.queryByTestId('palette-category-dynamics')).toBeNull();
      screen.getByTestId('btn-palettes-show-all').click();
      expect(onShowAll).toHaveBeenCalledOnce();
    });

    it('pops out', () => {
      const dock = dockWith('palettes');
      render(<LeftDock {...props(dock)} />);
      screen.getByTestId('btn-palettes-pop-out').click();
      expect(dock.setPoppedOut).toHaveBeenCalledWith(true);
    });

    it('says so, and offers to dock them, when they are floating', () => {
      const dock = dockWith('palettes', { poppedOut: true, palettesDocked: false });
      render(<LeftDock {...props(dock)} />);
      expect(screen.queryByTestId('palette-search')).toBeNull();
      screen.getByTestId('btn-palettes-dock-here').click();
      expect(dock.setPoppedOut).toHaveBeenCalledWith(false);
    });

    it('lets items be dragged only when dragging is enabled', () => {
      const base = props(dockWith('palettes'));
      const { rerender } = render(<LeftDock {...base} />);
      const draggable = () =>
        document
          .querySelector<HTMLElement>('[data-testid^="palette-item-dynamic-"]')!
          .getAttribute('draggable');
      expect(draggable()).toBe('true');
      rerender(<LeftDock {...base} palettes={{ ...base.palettes, dragEnabled: false }} />);
      expect(draggable()).toBe('false');
    });
  });

  it('shows the inspector in the Properties tab, without a toggle of its own', () => {
    render(<LeftDock {...props(dockWith('properties'))} />);
    expect(screen.getByTestId('inspector-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('inspector-toggle')).toBeNull();
    expect(screen.getByTestId('inspector-selection-type')).toHaveTextContent('Select an element');
  });

  it('is a labelled landmark with a resize handle', () => {
    render(<LeftDock {...props(dockWith('palettes'))} />);
    expect(screen.getByRole('complementary', { name: 'Side panel' })).toBeInTheDocument();
    expect(screen.getByTestId('left-dock-resize')).toBeInTheDocument();
  });
});

describe('InstrumentsPanel', () => {
  const groups = [
    {
      id: 'strings',
      name: 'Strings',
      instruments: [
        { id: 'violin', name: 'Violin' },
        { id: 'harp', name: 'Harp' },
      ],
    },
  ];
  const parts = [
    { index: 0, name: 'Piano', instrumentName: 'Piano', instrumentId: 'piano', isVisible: true },
    { index: 1, name: '', instrumentName: 'Violin', instrumentId: 'violin', isVisible: false },
  ];

  function setup(
    ctx: Partial<CommandContext> = {},
    over: { parts?: typeof parts; groups?: typeof groups } = {},
  ) {
    const registry = new CommandRegistry();
    const context: CommandContext = {
      ...DEFAULT_COMMAND_CONTEXT,
      hasScore: true,
      isMutable: true,
      ...ctx,
    };
    registry.setContextSource(() => context);
    const run = { add: vi.fn(), toggle: vi.fn(), remove: vi.fn() };
    registry.register('global', [
      defineCommand<{ instrumentId: string }>({
        id: 'instruments.add',
        label: 'a',
        enabled: (c) => c.isMutable,
        run: run.add,
      }),
      defineCommand<{ index: number }>({
        id: 'instruments.part.toggleVisible',
        label: 't',
        enabled: (c) => c.isMutable,
        run: run.toggle,
      }),
      defineCommand<{ index: number }>({
        id: 'instruments.part.remove',
        label: 'r',
        enabled: (c) => c.isMutable,
        run: run.remove,
      }),
    ]);
    render(
      <InstrumentsPanel
        parts={over.parts ?? parts}
        instrumentGroups={over.groups ?? groups}
        registry={registry}
      />,
    );
    return { run };
  }

  it('lists the parts on the score with their visibility', () => {
    setup();
    expect(screen.getByText('Piano')).toBeInTheDocument();
    // A part with no name falls back to its instrument.
    expect(screen.getByText('Violin', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByTestId('btn-part-visible-0')).toHaveTextContent('Hide');
    expect(screen.getByTestId('btn-part-visible-1')).toHaveTextContent('Show');
  });

  it('runs the part commands with the part index', async () => {
    const { run } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('btn-part-visible-1'));
    await user.click(screen.getByTestId('btn-part-remove-0'));
    expect(run.toggle).toHaveBeenCalledWith(expect.anything(), { index: 1 });
    expect(run.remove).toHaveBeenCalledWith(expect.anything(), { index: 0 });
  });

  it('adds the first instrument by default', async () => {
    const { run } = setup();
    await userEvent.setup().click(screen.getByTestId('btn-add-instrument'));
    expect(run.add).toHaveBeenCalledWith(expect.anything(), { instrumentId: 'violin' });
  });

  it('adds the instrument that was chosen', async () => {
    const { run } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('select-instrument-add'));
    await user.click(await screen.findByRole('option', { name: 'Harp' }));
    await user.click(screen.getByTestId('btn-add-instrument'));
    expect(run.add).toHaveBeenCalledWith(expect.anything(), { instrumentId: 'harp' });
  });

  it('puts the common instruments first, under their own heading', async () => {
    const { run } = setup(
      {},
      {
        groups: [
          {
            id: 'g',
            name: 'All',
            instruments: [
              { id: 'harp', name: 'Harp' },
              { id: 'piano', name: 'Piano' },
            ],
          },
        ],
      },
    );
    void run;
    await userEvent.setup().click(screen.getByTestId('select-instrument-add'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Common')).toBeInTheDocument();
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.textContent)[0],
    ).toBe('Piano');
  });

  it('disables the controls when the score cannot be edited', () => {
    setup({ isMutable: false });
    expect(screen.getByTestId('btn-add-instrument')).toBeDisabled();
    expect(screen.getByTestId('btn-part-visible-0')).toBeDisabled();
    expect(screen.getByTestId('btn-part-remove-0')).toBeDisabled();
  });

  it('says when there is nothing to show', () => {
    setup({}, { parts: [], groups: [] });
    expect(screen.getByText('No parts loaded.')).toBeInTheDocument();
    expect(screen.getByText('Instrument list unavailable.')).toBeInTheDocument();
  });
});

describe('AiToolPicker', () => {
  it('lists every tool with its legacy tab test id, and reports a choice', async () => {
    const onChange = vi.fn();
    render(<AiToolPicker value="assistant" onChange={onChange} aiEnabled />);
    expect(screen.getByTestId('ai-tool-picker')).toHaveTextContent('AI Assistant');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('ai-tool-picker'));
    for (const id of [
      'tab-ai',
      'tab-notagen',
      'tab-transcoda',
      'tab-multitrack-vae',
      'tab-harmony',
      'tab-functional-harmony',
      'tab-mma',
    ]) {
      expect(await screen.findByTestId(id)).toBeInTheDocument();
    }
    await user.click(screen.getByTestId('tab-mma'));
    expect(onChange).toHaveBeenCalledWith('mma');
  });

  it('leaves out the tools that need the AI proxy while it is off', async () => {
    render(<AiToolPicker value="transcoda" onChange={() => {}} aiEnabled={false} />);
    await userEvent.setup().click(screen.getByTestId('ai-tool-picker'));
    expect(await screen.findByTestId('tab-transcoda')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-ai')).toBeNull();
    expect(screen.queryByTestId('tab-notagen')).toBeNull();
  });
});
