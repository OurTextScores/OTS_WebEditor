import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Transport } from '../../components/shell/Transport';
import { StatusBar } from '../../components/shell/StatusBar';
import { clearNotices, notify } from '../../components/shell/notices';
import {
  EMPTY_SHELL_VIEW,
  getShellUiState,
  resetShellUiForTests,
  setShellView,
  setStatusBarPinned,
  subscribeToShellUi,
  type ShellView,
} from '../../components/shell/shellStore';
import { buildStatusBarCommands } from '../../components/shell/shellCommands';
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
  clearNotices();
});
afterEach(() => vi.unstubAllGlobals());

const view = (over: Partial<ShellView> = {}): ShellView => ({
  ...EMPTY_SHELL_VIEW,
  hasScore: true,
  pageCount: 3,
  ...over,
});

function makeRegistry(ctx: Partial<CommandContext> = {}) {
  const registry = new CommandRegistry();
  const context: CommandContext = { ...DEFAULT_COMMAND_CONTEXT, hasScore: true, ...ctx };
  registry.setContextSource(() => context);
  const run = {
    next: vi.fn(),
    prev: vi.fn(),
    page: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitW: vi.fn(),
    fitH: vi.fn(),
    preset: vi.fn(),
    history: vi.fn(),
    progressive: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    sel: vi.fn(),
  };
  registry.register('global', [
    defineCommand({ id: 'view.goto.nextPage', label: 'n', run: run.next }),
    defineCommand({ id: 'view.goto.prevPage', label: 'p', run: run.prev }),
    defineCommand<number>({ id: 'view.goto.page', label: 'g', run: run.page }),
    defineCommand({ id: 'view.zoom.in', label: 'zi', run: run.zoomIn }),
    defineCommand({ id: 'view.zoom.out', label: 'zo', run: run.zoomOut }),
    defineCommand({ id: 'view.zoom.fitWidth', label: 'fw', run: run.fitW }),
    defineCommand({ id: 'view.zoom.fitHeight', label: 'fh', run: run.fitH }),
    defineFamily<number>({
      id: 'view.zoom.preset',
      label: 'Zoom',
      variants: [{ arg: 1, label: '100%' }],
      run: run.preset,
    }),
    defineCommand({ id: 'view.panel.history', label: 'h', run: run.history }),
    defineCommand({ id: 'view.progressiveLoad', label: 'pl', run: run.progressive }),
    defineCommand({ id: 'playback.playPause', label: 'pp', run: run.play }),
    defineCommand({ id: 'playback.stop', label: 's', enabled: (c) => c.hasScore, run: run.stop }),
    defineCommand({
      id: 'playback.playFromSelection',
      label: 'ps',
      enabled: (c) => c.selection !== 'none',
      run: run.sel,
    }),
  ]);
  return { registry, run };
}

function setup(over: Partial<ShellView> = {}, ctx: Partial<CommandContext> = {}) {
  const { registry, run } = makeRegistry(ctx);
  act(() => setShellView(view(over)));
  const utils = render(<StatusBar registry={registry} />);
  return { registry, run, user: userEvent.setup(), ...utils };
}

function mountTransport(over: Partial<ShellView> = {}, ctx: Partial<CommandContext> = {}) {
  const { registry, run } = makeRegistry(ctx);
  act(() => setShellView(view(over)));
  const utils = render(<Transport registry={registry} />);
  return { registry, run, user: userEvent.setup(), ...utils };
}

describe('StatusBar page controls', () => {
  it('is the contentinfo landmark and shows the page', () => {
    setup({ currentPage: 1, pageCount: 3 });
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByTestId('page-select')).toHaveValue('1');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('of 3');
  });

  it('shows a floor while pages are still being laid out', () => {
    setup({ pageCount: 4, pageCountIsFloor: true });
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('of 4+');
  });

  it('chooses a page one-based, as the go-to command takes it', () => {
    const { run } = setup({ currentPage: 0 });
    fireEvent.change(screen.getByTestId('page-select'), { target: { value: '2' } });
    expect(run.page).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it('steps with the previous and next buttons, and disables them at the ends', async () => {
    const first = setup({ currentPage: 0 });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await first.user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(first.run.next).toHaveBeenCalledOnce();
    first.unmount();

    const last = setup({ currentPage: 2 });
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await last.user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(last.run.prev).toHaveBeenCalledOnce();
  });

  it('lets Next past the last known page while more are being laid out', () => {
    setup({ currentPage: 2, pageCount: 3, pageCountIsFloor: true });
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('is inert with no score', () => {
    setup({ hasScore: false, pageCount: 1 });
    expect(screen.getByTestId('page-select')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});

describe('StatusBar zoom controls', () => {
  it('shows the zoom and runs the zoom commands', async () => {
    const { run, user } = setup({ zoom: 1.25 });
    expect(screen.getByTestId('zoom-preset-trigger')).toHaveTextContent('125%');
    await user.click(screen.getByTestId('btn-zoom-in'));
    await user.click(screen.getByTestId('btn-zoom-out'));
    await user.click(screen.getByTestId('btn-fit-width'));
    await user.click(screen.getByTestId('btn-fit-height'));
    expect(run.zoomIn).toHaveBeenCalledOnce();
    expect(run.zoomOut).toHaveBeenCalledOnce();
    expect(run.fitW).toHaveBeenCalledOnce();
    expect(run.fitH).toHaveBeenCalledOnce();
  });

  it('offers the presets and fit modes, keeping the ribbon’s test ids', async () => {
    const { run, user } = setup();
    await user.click(screen.getByTestId('zoom-preset-trigger'));
    for (const id of [
      'zoom-preset-25',
      'zoom-preset-50',
      'zoom-preset-75',
      'zoom-preset-100',
      'zoom-preset-fit-width',
      'zoom-preset-fit-height',
    ]) {
      expect(await screen.findByTestId(id)).toBeInTheDocument();
    }
    await user.click(screen.getByTestId('zoom-preset-75'));
    expect(run.preset).toHaveBeenCalledWith(expect.anything(), 0.75);
  });
});

describe('StatusBar indicators', () => {
  it('shows layout progress only while the layout is being finalised', () => {
    setup({ preparing: true });
    expect(screen.getByTestId('interaction-preparing-banner')).toHaveTextContent(
      'Finalizing layout',
    );
    act(() => setShellView(view({ preparing: false })));
    expect(screen.queryByTestId('interaction-preparing-banner')).toBeNull();
  });

  it.each([
    [{ dirty: true, checkpointCount: 2 }, 'Unsaved changes'],
    [{ dirty: false, checkpointCount: 0 }, 'No checkpoint'],
    [{ dirty: false, checkpointCount: 2 }, 'Checkpointed'],
  ] as const)('reports the checkpoint state %j as %s', (over, text) => {
    setup(over);
    expect(screen.getByTestId('status-checkpoint')).toHaveTextContent(text);
  });

  it('opens History from the checkpoint indicator', async () => {
    const { run, user } = setup();
    await user.click(screen.getByTestId('status-checkpoint'));
    expect(run.history).toHaveBeenCalledOnce();
  });

  it('toggles progressive load and shows its state', async () => {
    const { run, user } = setup({ progressiveLoadEnabled: false });
    const button = screen.getByTestId('status-progressive-load');
    expect(button).toHaveTextContent('Off');
    await user.click(button);
    expect(run.progressive).toHaveBeenCalledOnce();
  });
});

describe('StatusBar notices', () => {
  it('counts unread notices, and clears the count when the list is opened', async () => {
    const { user } = setup();
    expect(screen.queryByTestId('status-notices-count')).toBeNull();
    act(() => {
      notify({ kind: 'error', title: 'Unable to delete', detail: 'See the console.' });
      notify({ kind: 'info', title: 'Saved' });
    });
    expect(screen.getByTestId('status-notices-count')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument();

    await user.click(screen.getByTestId('status-notices'));
    const list = await screen.findByTestId('notice-list');
    // Newest first.
    const titles = within(list)
      .getAllByText(/Unable to delete|Saved/)
      .map((node) => node.textContent);
    expect(titles).toEqual(['Saved', 'Unable to delete']);
    expect(within(list).getByText('See the console.')).toBeInTheDocument();
    expect(screen.queryByTestId('status-notices-count')).toBeNull();
  });

  it('says when there is nothing', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('status-notices'));
    expect(await screen.findByText('No notifications.')).toBeInTheDocument();
  });
});

describe('StatusBar pinning', () => {
  it('registers View ▸ Status Bar, checked while pinned', async () => {
    const { registry } = setup();
    const entry = registry.get('view.statusBar') as unknown as { checked: () => boolean };
    expect(entry.checked()).toBe(true);
    await registry.run('view.statusBar');
    expect(getShellUiState().statusBarPinned).toBe(false);
    expect(entry.checked()).toBe(false);
  });

  it('remembers the choice', () => {
    setStatusBarPinned(false);
    expect(window.localStorage.getItem('ots.shell.statusBar')).toBe('hidden');
    setStatusBarPinned(true);
    expect(window.localStorage.getItem('ots.shell.statusBar')).toBe('shown');
  });

  it('peeks while the pointer is at the bottom edge, and hides again', () => {
    setup();
    act(() => setStatusBarPinned(false));
    expect(screen.queryByTestId('status-bar')).toBeNull();
    const edge = screen.getByTestId('status-bar-peek');
    fireEvent.mouseEnter(edge);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    fireEvent.mouseLeave(edge);
    expect(screen.queryByTestId('status-bar')).toBeNull();
  });

  it('shares its command with the registry builder', () => {
    expect(buildStatusBarCommands().map((c) => c.id)).toEqual(['view.statusBar']);
  });
});

describe('Transport', () => {
  it.each([
    [{ isPlaying: false, isPaused: false }, 'Play'],
    [{ isPlaying: true, isPaused: false }, 'Pause'],
    [{ isPlaying: true, isPaused: true }, 'Resume'],
  ] as const)('reads %j as %s', (over, name) => {
    mountTransport(over);
    expect(screen.getByTestId('btn-play')).toHaveAccessibleName(name);
  });

  it('enables each button from its command', () => {
    mountTransport({}, { selection: 'none' });
    expect(screen.getByTestId('btn-play')).toBeEnabled();
    expect(screen.getByTestId('btn-stop')).toBeEnabled();
    expect(screen.getByTestId('btn-play-from-selection')).toBeDisabled();
  });

  it('runs the playback commands', async () => {
    const { run, user } = mountTransport({}, { selection: 'single' });
    await user.click(screen.getByTestId('btn-play'));
    await user.click(screen.getByTestId('btn-stop'));
    await user.click(screen.getByTestId('btn-play-from-selection'));
    expect(run.play).toHaveBeenCalledOnce();
    expect(run.stop).toHaveBeenCalledOnce();
    expect(run.sel).toHaveBeenCalledOnce();
  });
});

describe('shell view store', () => {
  it('does not notify when the view is unchanged', () => {
    const listener = vi.fn();
    const state = view();
    setShellView(state);
    const unsubscribe = subscribeToShellUi(listener);
    setShellView({ ...state });
    expect(listener).not.toHaveBeenCalled();
    setShellView({ ...state, zoom: 2 });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
